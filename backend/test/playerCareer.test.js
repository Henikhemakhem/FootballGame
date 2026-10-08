import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/models/database.js';
import { PlayerCareerRepository } from '../src/models/playerCareerRepository.js';
import { PlayerCareerGameService, normalizeAnswer } from '../src/services/playerCareerGameService.js';
import { careerFromTransfers } from '../src/services/careerService.js';
import { createApp } from '../src/app.js';
import { createFootballApiService } from '../src/services/footballApiService.js';

const career = [
  { club: 'Club Alpha', from: '2009-07-01', to: '2012-07-01' },
  { club: 'Club Beta', from: '2012-07-01', to: '2017-01-15' },
  { club: 'Club Gamma', from: '2017-01-15', to: null },
];
const players = [
  { id: 'private-player-one', name: 'Émile Testeur', photo: 'https://example.com/private-player-one.png' },
  { id: 'private-player-two', name: 'Second Joueur', photo: 'https://example.com/private-player-two.png' },
];
function fixture(t) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const repository = new PlayerCareerRepository(db);
  const football = { getCareerCandidates: async () => players, getPlayerCareer: async () => career };
  return { db, repository, service: new PlayerCareerGameService(repository, { football, pick: () => 0 }) };
}
function assertPrivate(game) {
  assert.deepEqual(Object.keys(game).sort(), ['career', 'dataNote', 'difficulty', 'gameId', 'status']);
  const json = JSON.stringify(game);
  for (const player of players) for (const secret of [player.name, player.id, player.photo]) assert.ok(!json.includes(secret));
  assert.match(game.gameId, /^[\da-f-]{36}$/);
}

test('indices publics : aucune identité/photo/id de joueur ; difficultés construites côté serveur', async t => {
  const { service } = fixture(t);
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const game = await service.start({ difficulty });
    assertPrivate(game);
    assert.equal(game.status, 'PLAYING');
    assertPrivate(service.get(game.gameId));
    if (difficulty === 'hard') assert.deepEqual(game.career, career.map(step => ({ club: step.club })));
    if (difficulty === 'medium') assert.equal(game.career[0].season, '2009 – 2012');
    if (difficulty === 'easy') assert.equal(game.career[0].season, '2009-07-01 – 2012-07-01');
  }
});

test('une mauvaise réponse révèle le vrai joueur et verrouille définitivement la tentative', async t => {
  const { service } = fixture(t);
  const game = await service.start();
  const result = service.answer(game.gameId, { answer: 'Un autre nom', correct: true, playerName: 'Un autre nom' });
  assert.equal(result.correct, false);
  assert.equal(result.message, 'Tu as échoué !');
  assert.equal(result.status, 'FINISHED');
  assert.equal(result.player.name, players[0].name);
  assert.equal(result.player.photo, players[0].photo);
  assert.equal(result.player.career.length, 3);
  assert.throws(() => service.answer(game.gameId, { answer: players[0].name }), { code: 'CAREER_GAME_FINISHED' });
  assert.deepEqual(service.get(game.gameId), result);
});

test('normalisation : casse, accents et espaces ; les noms partiels ne sont pas acceptés', async t => {
  const { service } = fixture(t);
  const game = await service.start();
  assert.equal(service.answer(game.gameId, { answer: '  EMILE   TESTEUR  ' }).correct, true);
  assert.equal(normalizeAnswer('Ibrahimović'), normalizeAnswer('ibrahimovic'));
  const other = await service.start();
  assert.equal(service.answer(other.gameId, { answer: 'Testeur' }).correct, false);
});

test('rejouer sélectionne un autre joueur et les historiques trop courts sont écartés', async t => {
  const { repository, service } = fixture(t);
  const first = await service.start();
  const second = await service.start({ previousGameId: first.gameId });
  assert.notEqual(first.gameId, second.gameId);
  assert.notEqual(repository.get(first.gameId).playerId, repository.get(second.gameId).playerId);
  const filtered = new PlayerCareerGameService(repository, { pick: () => 0, football: {
    getCareerCandidates: async () => players,
    getPlayerCareer: async id => id === players[0].id ? career.slice(0, 2) : career,
  } });
  const game = await filtered.start();
  assert.equal(repository.get(game.gameId).playerId, players[1].id);
});

test('entrées invalides ne consomment pas la tentative ; parties absentes et catalogues incomplets', async t => {
  const { repository, service } = fixture(t);
  await assert.rejects(service.start({ difficulty: 'unknown' }), { code: 'INVALID_DIFFICULTY' });
  const game = await service.start();
  for (const answer of ['', '   ', 12, null, 'a'.repeat(121)]) {
    assert.throws(() => service.answer(game.gameId, { answer }), { code: 'INVALID_ANSWER' });
  }
  assert.equal(service.get(game.gameId).status, 'PLAYING');
  assert.throws(() => service.get('missing'), { code: 'CAREER_GAME_NOT_FOUND' });
  const empty = new PlayerCareerGameService(repository, { football: { getCareerCandidates: async () => players,
    getPlayerCareer: async () => career.slice(0, 2) } });
  await assert.rejects(empty.start(), { code: 'NO_SUITABLE_CAREER' });
});

test('REST : réponse privée, échec, nouvelle partie, succès et une seule validation concurrente', async t => {
  const { db, service } = fixture(t);
  const server = createApp({ database: db, careerService: service }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/player-career';
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const response = await post('/start', { difficulty: 'medium' });
  assert.equal(response.status, 201);
  const game = await response.json();
  assertPrivate(game);
  assertPrivate(await (await fetch(base + '/' + game.gameId)).json());
  const wrong = await (await post('/' + game.gameId + '/answer', { answer: 'Faux nom' })).json();
  assert.equal(wrong.correct, false);
  const next = await (await post('/start', { previousGameId: game.gameId })).json();
  assertPrivate(next);
  const simultaneous = await Promise.all([
    post('/' + next.gameId + '/answer', { answer: ' second   joueur ' }),
    post('/' + next.gameId + '/answer', { answer: 'Second Joueur' }),
  ]);
  assert.deepEqual(simultaneous.map(res => res.status).sort(), [200, 409]);
  const succeeded = await (await fetch(base + '/' + next.gameId)).json();
  assert.equal(succeeded.correct, true);
  assert.equal(succeeded.player.name, players[1].name);
});

test('les transferts deviennent un parcours ordonné, avec prêts/retours ; les trous sont refusés', () => {
  const club = id => ({ id, name: 'Club ' + id });
  const move = (date, from, to) => ({ date, teams: { out: club(from), in: club(to) } });
  const moves = [move('2020-07-01', 2, 1), move('2019-07-01', 1, 2), move('2021-07-01', 1, 3)];
  const result = careerFromTransfers([{ player: { id: 12 }, transfers: moves }], 12);
  assert.deepEqual(result.map(step => step.club), ['Club 1', 'Club 2', 'Club 1', 'Club 3']);
  assert.equal(result[0].from, null);
  assert.equal(result[0].to, '2019-07-01');
  assert.deepEqual(careerFromTransfers([{ player: { id: 12 }, transfers: [moves[1], move('2020-07-01', 9, 3)] }], 12), []);
  assert.deepEqual(careerFromTransfers([{ player: { id: 99 }, transfers: moves }], 12), []);
  assert.deepEqual(careerFromTransfers([{ player: { id: 12 }, transfers: [move('2020-02-31', 1, 2)] }], 12), []);
});

test('API réelle : sélection automatique, historique /transfers, cache privé et profils complets', async () => {
  const requests = [];
  const settings = { useMockData: false, apiKey: 'private-key', apiUrl: 'https://example.com', league: '39', season: '2024' };
  const football = createFootballApiService(settings, async (url, options) => {
    requests.push({ path: url.pathname, player: url.searchParams.get('player'), key: options.headers['x-apisports-key'] });
    const response = url.pathname === '/players' ? Array.from({ length: 10 }, (_, i) => ({
      player: { id: i + 1, name: 'P. ' + i, firstname: 'Prénom', lastname: 'Nom ' + i },
      statistics: [{ team: { name: 'Club' }, games: { position: 'Attacker' } }],
    })) : [{ player: { id: 1 }, transfers: [
      { date: '2010-01-01', teams: { out: { id: 1, name: 'Alpha' }, in: { id: 2, name: 'Beta' } } },
      { date: '2015-01-01', teams: { out: { id: 2, name: 'Beta' }, in: { id: 3, name: 'Gamma' } } },
    ] }];
    return { ok: true, json: async () => ({ response, errors: [], paging: { total: 1 } }) };
  });
  const candidates = await football.getCareerCandidates();
  assert.equal(candidates[0].name, 'Prénom Nom 0');
  const first = await football.getPlayerCareer(candidates[0].id);
  const again = await football.getPlayerCareer(candidates[0].id);
  assert.deepEqual(first, again);
  assert.equal(first.length, 3);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].path, '/transfers');
  assert.equal(requests[1].player, '1');
  assert.equal(requests[1].key, settings.apiKey);
});
