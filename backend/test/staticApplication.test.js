import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBrowserApplication } from '../../frontend/src/games/browserApplication.js';
import { refreshCatalogue } from '../../scripts/refreshCatalogue.mjs';

const catalogue = JSON.parse(readFileSync(new URL('../../frontend/public/players.json', import.meta.url), 'utf8'));
function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), data };
}
const action = game => ({ player: game.currentPlayer, version: game.version, playerId: game.auction.offeredPlayer.id });

test('site statique : six manches, paiement, quotas et reprise sans aucun serveur', async () => {
  const memory = storage();
  let request = createBrowserApplication(catalogue, memory);
  let game = await request('/games', { player1Name: 'Alex', player2Name: 'Sam' });
  const id = game.id;
  assert.ok(game.auction.offeredPlayer.id.startsWith('api-'));
  for (const amount of [20,40,60,80]) game = await request('/games/' + id + '/bid', { ...action(game), amount });
  game = await request('/games/' + id + '/pass', action(game));
  assert.equal(game.player2Money, 120);
  assert.equal(game.player1Money, 200);
  assert.equal(game.teams[1][0].price, 0);
  assert.equal(game.teams[2][0].price, 80);
  request = createBrowserApplication(catalogue, memory);
  assert.deepEqual(await request('/games/' + id), game);
  while (game.status === 'active') game = await request('/games/' + id + '/pass', action(game));
  assert.equal(new Set([...game.teams[1],...game.teams[2]].map(player=>player.footballPlayerId)).size, 12);
  for (const owner of [1,2]) {
    assert.equal(game.teams[owner].length, 6);
    assert.equal(game.teamStructure[owner].goalkeeper.length, 1);
    assert.equal(game.teamStructure[owner].defenders.length, 2);
    assert.equal(game.teamStructure[owner].midfielders.length, 2);
    assert.equal(game.teamStructure[owner].attackers.length, 1);
  }
  assert.equal(game.result.winner, 2);
});

test('site statique : versions concurrentes et stockage plein ne modifient pas la sauvegarde', async () => {
  const memory = storage();
  const request = createBrowserApplication(catalogue, memory);
  const game = await request('/games', { player1Name: 'Alex', player2Name: 'Sam' });
  const changed = await request('/games/' + game.id + '/bid', { ...action(game), amount: 20 });
  const otherTab = createBrowserApplication(catalogue, memory);
  await assert.rejects(otherTab('/games/' + game.id + '/bid', { ...action(game), amount: 30 }), { code: 'STALE_AUCTION' });
  memory.setItem = () => { throw new Error('quota'); };
  await assert.rejects(request('/games/' + game.id + '/pass', action(changed)), { code: 'LOCAL_STORAGE_FULL' });
  assert.deepEqual(await request('/games/' + game.id), changed);
});

test('site statique : parcours API, identité masquée, réponse unique, reprise et autre joueur', async () => {
  const memory = storage();
  const request = createBrowserApplication(catalogue, memory);
  const quiz = await request('/player-career/start', { difficulty: 'hard' });
  assert.equal(quiz.player, undefined);
  assert.ok(quiz.career.every(step => Object.keys(step).join() === 'club'));
  const record = JSON.parse([...memory.data.values()][0]).careers[quiz.gameId];
  assert.ok(record.playerId.startsWith('api-'));
  const answer = await request('/player-career/' + quiz.gameId + '/answer', { answer: record.playerName.toUpperCase() });
  assert.equal(answer.correct, true);
  await assert.rejects(request('/player-career/' + quiz.gameId + '/answer', { answer: 'Une autre réponse' }), { code: 'CAREER_GAME_FINISHED' });
  assert.deepEqual(await createBrowserApplication(catalogue, memory)('/player-career/' + quiz.gameId), answer);
  const next = await request('/player-career/start', { previousGameId: quiz.gameId });
  const nextRecord = JSON.parse([...memory.data.values()][0]).careers[next.gameId];
  assert.notEqual(nextRecord.playerId, record.playerId);
});

test('site statique : stockage désactivé, parties jouables pour la session', async () => {
  const request = createBrowserApplication(catalogue, null);
  const game = await request('/games', { player1Name: 'Alex', player2Name: 'Sam' });
  assert.deepEqual(await request('/games/' + game.id), game);
  assert.equal((await request('/health')).dataMode, 'api-static');
  await assert.rejects(request('/games/__proto__'), { code: 'GAME_NOT_FOUND' });
  await assert.rejects(request('/player-career/constructor'), { code: 'CAREER_GAME_NOT_FOUND' });
});

const settings = { league:39, season:2024, maxPages:3, careerLimit:2, maxRequests:5, requestDelayMs:0 };
const fail = code => { throw Object.assign(new Error('provider secret must never be logged'), { code }); };
test('build API : quota atteint, catalogue réel conservé et aucun nouvel appel', async () => {
  let calls = 0;
  const result = await refreshCatalogue(catalogue, { settings, football: {
    fetchSyncPage: async () => { calls++; fail('FOOTBALL_API_RATE_LIMIT'); },
    fetchSyncCareer: async () => { throw new Error('Ne doit pas être appelé'); },
  }, wait: async()=>{} });
  assert.deepEqual(result.data, catalogue);
  assert.equal(calls, 1);
  assert.deepEqual(result.warnings, ['FOOTBALL_API_RATE_LIMIT']);
});

test('build API : page limitée, carrières enrichies, champs secrets retirés et parcours incomplets conservés', async () => {
  const player = catalogue.players.find(player => catalogue.careers.some(item => item.id === player.id));
  const before = catalogue.careers.find(item => item.id === player.id);
  const result = await refreshCatalogue(catalogue, { settings:{...settings,maxPages:4}, football:{
    fetchSyncPage: async ({ page }) => {
      if (page > 1) fail('FOOTBALL_API_PAGE_LIMIT');
      return { totalPages:4, players:[{ ...player, id:player.apiPlayerId, fullName:player.name, apiKey:'SECRET', credentials:'SECRET' }] };
    },
    fetchSyncCareer: async () => [{ club:'Incomplet', from:null,to:null,team:{id:'1',secret:'SECRET'} }],
  }, wait:async()=>{} });
  assert.deepEqual(result.data.careers.find(item=>item.id===player.id), before);
  assert.equal(result.requests, 3);
  assert.ok(result.warnings.includes('FOOTBALL_API_PAGE_LIMIT'));
  assert.ok(!JSON.stringify(result.data).includes('SECRET'));
});

test('build API : historique valide actualisé et budget de requêtes respecté', async () => {
  const player = catalogue.players[0];
  const career = ['Un club','Deux clubs','Trois clubs'].map(club=>({club,from:null,to:null}));
  const provider = { fetchSyncPage:async()=>({totalPages:1,players:[{...player,id:player.apiPlayerId,fullName:'Prénom Complet'}]}), fetchSyncCareer:async()=>career };
  const complete = await refreshCatalogue(catalogue, { settings,football:provider,wait:async()=>{} });
  assert.deepEqual(complete.data.careers.find(item=>item.id===player.id).career, career);
  const limited = await refreshCatalogue(catalogue, { settings:{...settings,maxRequests:1},football:provider,wait:async()=>{} });
  assert.equal(limited.requests, 1);
  assert.ok(limited.warnings.includes('SYNC_REQUEST_BUDGET'));
});
