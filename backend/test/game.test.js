import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/models/database.js';
import { GameRepository } from '../src/models/gameRepository.js';
import { GameService, ROUND_POSITIONS, POSITION_LIMITS } from '../src/services/gameService.js';
import { mockPlayers } from '../src/data/mockPlayers.js';

function fixture(t, options = {}) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const repository = new GameRepository(db);
  return { repository, service: new GameService(repository, { loadPlayers: async () => mockPlayers, pick: () => 0, ...options }) };
}
const names = { player1Name: 'Alex', player2Name: 'Sam' };
const body = game => ({ player: game.currentPlayer, version: game.version, playerId: game.auction.offeredPlayer.id });
const bid = (service, game, amount) => service.bid(game.id, { ...body(game), amount });
const pass = (service, game) => service.pass(game.id, body(game));

test('20, 40, 60, 80, passer : seul le gagnant paie, le perdant reçoit un autre gardien gratuit', async t => {
  const { service } = fixture(t);
  let game = await service.create(names);
  const sold = game.auction.offeredPlayer;
  assert.equal(sold.position, 'Goalkeeper');
  for (const [i, amount] of [20, 40, 60, 80].entries()) {
    assert.equal(game.currentPlayer, i % 2 + 1);
    game = bid(service, game, amount);
    assert.equal(game.auction.currentPrice, amount);
    assert.equal(game.auction.currentBidder, i % 2 + 1);
    assert.equal(game.player1Money, 200);
    assert.equal(game.player2Money, 200);
    assert.equal(game.teams[1].length, 0);
  }
  game = pass(service, game);
  assert.equal(game.lastRound.winner, 2);
  assert.equal(game.lastRound.loser, 1);
  assert.equal(game.lastRound.finalPrice, 80);
  assert.equal(game.lastRound.status, 'finished');
  assert.equal(game.player2Money, 120);
  assert.equal(game.player1Money, 200);
  assert.equal(game.teams[2][0].footballPlayerId, sold.id);
  assert.equal(game.teams[2][0].price, 80);
  assert.equal(game.teams[1][0].price, 0);
  assert.equal(game.teams[1][0].position, sold.position);
  assert.notEqual(game.teams[1][0].footballPlayerId, sold.id);
  assert.equal(game.round, 2);
  assert.equal(game.auction.position, 'Defender');
  assert.equal(game.auction.firstBidder, 2);
  assert.equal(game.currentPlayer, 2);
  assert.equal(game.auction.currentPrice, 0);
});

test('les offres invalides, dépassements de budget, mauvais tours et requêtes périmées sont refusés', async t => {
  const { service } = fixture(t);
  let game = await service.create(names);
  const original = game;
  assert.throws(() => service.bid(game.id, { ...body(game), player: 2, amount: 20 }), { code: 'WRONG_TURN' });
  for (const amount of [0, -1, 1.5, '20', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => bid(service, game, amount), { code: 'INVALID_BID' });
  }
  assert.throws(() => bid(service, game, 201), { code: 'INSUFFICIENT_FUNDS' });
  assert.throws(() => service.bid(game.id, { ...body(game), playerId: 'wrong', amount: 10 }), { code: 'WRONG_AUCTION' });
  assert.throws(() => service.pass(game.id, { player: 1 }), { code: 'INVALID_ACTION' });
  assert.equal(service.get(game.id).version, 0);
  game = bid(service, game, 20);
  assert.throws(() => bid(service, original, 40), { code: 'STALE_AUCTION' });
  assert.throws(() => bid(service, game, 20), { code: 'INVALID_BID' });
  assert.throws(() => bid(service, game, 19), { code: 'INVALID_BID' });
  game = bid(service, game, 21);
  assert.equal(game.auction.currentPrice, 21);
});

test('un budget exactement atteint reste valide et aucun paiement ne survient avant le passage', async t => {
  const { service } = fixture(t);
  let game = await service.create(names);
  game = bid(service, game, 200);
  assert.equal(game.player1Money, 200);
  assert.throws(() => bid(service, game, 201), { code: 'INSUFFICIENT_FUNDS' });
  game = pass(service, game);
  assert.equal(game.player1Money, 0);
  assert.equal(game.player2Money, 200);
  assert.equal(game.teams[2][0].price, 0);
  // Le manager sans budget peut passer aux manches suivantes et reçoit toujours sa recrue.
  while (game.status === 'active') {
    if (game.currentPlayer === 1) game = pass(service, game);
    else if (game.auction.currentBidder === null) game = bid(service, game, 1);
    else game = pass(service, game);
  }
  assert.equal(game.teams[1].length, 6);
  assert.equal(game.teams[2].length, 6);
});

test('six manches dans l’ordre, premiers enchérisseurs alternés, 12 joueurs uniques et quotas exacts', async t => {
  const { service } = fixture(t);
  let game = await service.create(names);
  const used = new Set();
  for (let round = 1; round <= 6; round++) {
    assert.equal(game.round, round);
    assert.equal(game.auction.position, ROUND_POSITIONS[round - 1]);
    assert.equal(game.auction.firstBidder, round % 2 ? 1 : 2);
    assert.equal(game.currentPlayer, game.auction.firstBidder);
    game = bid(service, game, 10 * round);
    game = pass(service, game);
    const result = game.lastRound;
    for (const player of [result.soldPlayer, result.freePlayer]) {
      assert.ok(!used.has(player.id));
      used.add(player.id);
      assert.equal(player.position, ROUND_POSITIONS[round - 1]);
    }
    assert.equal(game.teams[1].length, round);
    assert.equal(game.teams[2].length, round);
  }
  assert.equal(game.status, 'finished');
  assert.equal(game.round, 6);
  assert.equal(game.auction.status, 'finished');
  assert.equal(used.size, 12);
  for (const owner of [1, 2]) {
    for (const [position, quota] of Object.entries(POSITION_LIMITS)) {
      assert.equal(game.teams[owner].filter(p => p.position === position).length, quota);
    }
    const spent = game.teams[owner].reduce((sum, p) => sum + p.price, 0);
    assert.equal(game['player' + owner + 'Money'], 200 - spent);
    assert.equal(game.scores[owner], spent);
    assert.equal(game.teamStructure[owner].goalkeeper.length, 1);
  }
  assert.throws(() => pass(service, game), { code: 'GAME_FINISHED' });
  assert.throws(() => bid(service, game, 1), { code: 'GAME_FINISHED' });
});

test('sans enchère, deux passages attribuent deux recrues gratuites sans bloquer les six manches', async t => {
  const { service } = fixture(t);
  let game = await service.create(names);
  for (let round = 1; round <= 6; round++) {
    const first = game.currentPlayer;
    game = pass(service, game);
    assert.equal(game.round, round);
    assert.equal(game.currentPlayer, 3 - first);
    game = pass(service, game);
    assert.equal(game.lastRound.noBids, true);
    assert.equal(game.lastRound.winner, first);
    assert.equal(game.lastRound.finalPrice, 0);
    assert.equal(game.player1Money, 200);
    assert.equal(game.player2Money, 200);
  }
  assert.equal(game.status, 'finished');
  assert.equal(game.result.winner, null);
  assert.equal(game.teams[1].length, 6);
});

test('le second participant peut ouvrir après un passage puis le premier peut surenchérir', async t => {
  const { service } = fixture(t);
  let game = await service.create(names);
  game = pass(service, game);
  game = bid(service, game, 20);
  game = bid(service, game, 30);
  game = pass(service, game);
  assert.equal(game.lastRound.winner, 1);
  assert.equal(game.player1Money, 170);
});

test('une erreur lors de la seconde attribution annule aussi la première et tout paiement', async t => {
  const { service, repository } = fixture(t);
  let game = await service.create(names);
  game = bid(service, game, 80);
  const snapshot = service.get(game.id);
  const purchase = repository.purchase.bind(repository);
  let count = 0;
  repository.purchase = (...args) => {
    if (++count === 2) throw new Error('Attribution interrompue');
    return purchase(...args);
  };
  assert.throws(() => pass(service, game), /Attribution interrompue/);
  assert.deepEqual(service.get(game.id), snapshot);
});

test('un catalogue insuffisant ou dupliqué est refusé avant la création', async t => {
  const { service } = fixture(t, { loadPlayers: async () => [...mockPlayers.filter(p => p.position !== 'Goalkeeper'), mockPlayers[26], mockPlayers[26]] });
  await assert.rejects(service.create(names), { code: 'INSUFFICIENT_POSITION_PLAYERS' });
});

test('les anciennes parties sont consultables et protégées contre les nouvelles actions', async t => {
  const { service, repository } = fixture(t);
  repository.create({ id: 'old', ...names, player1Money: 200, player2Money: 200,
    currentTurn: 1, currentPlayer: 1, status: 'active', version: 0,
    createdAt: new Date().toISOString(), state: { catalog: mockPlayers, usedIds: [], currentOffer: mockPlayers[0] } });
  assert.equal(service.get('old').legacy, true);
  assert.throws(() => service.auction('old'), { code: 'LEGACY_GAME' });
  assert.throws(() => service.pass('old', { player: 1, version: 0, playerId: 'demo-1' }), { code: 'LEGACY_GAME' });
});
