import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/models/database.js';
import { GameRepository } from '../src/models/gameRepository.js';
import { GameService } from '../src/services/gameService.js';
import { mockPlayers } from '../src/data/mockPlayers.js';

test('REST : 20 → 40 → 60 → 80 → passer, six manches, concurrence et persistance SQLite', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'football-draft-'));
  const filename = path.join(directory, 'test.sqlite');
  let database = openDatabase(filename);
  const service = new GameService(new GameRepository(database), { loadPlayers: async () => mockPlayers });
  const server = createApp({ database, service }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/games';
  const post = (suffix, body) => fetch(base + suffix, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const input = game => ({ player: game.currentPlayer, version: game.version, playerId: game.auction.offeredPlayer.id });
  try {
    let game = await (await post('', { player1Name: 'Alice', player2Name: 'Bob' })).json();
    const body = { ...input(game), amount: 20, money: 9999, winner: 1, freePlayer: mockPlayers[0] };
    const simultaneous = await Promise.all([post('/' + game.id + '/bid', body), post('/' + game.id + '/bid', body)]);
    assert.deepEqual(simultaneous.map(res => res.status).sort(), [200, 409]);
    game = await (await fetch(base + '/' + game.id)).json();
    for (const amount of [40, 60, 80]) {
      const response = await post('/' + game.id + '/bid', { ...input(game), amount });
      assert.equal(response.status, 200);
      game = await response.json();
    }
    assert.equal(game.currentPlayer, 1);
    const reopened = openDatabase(filename);
    assert.deepEqual(new GameService(new GameRepository(reopened)).get(game.id), game);
    reopened.close();
    let response = await post('/' + game.id + '/pass', input(game));
    assert.equal(response.status, 200);
    game = await response.json();
    assert.equal(game.lastRound.winner, 2);
    assert.equal(game.player2Money, 120);
    assert.equal(game.player1Money, 200);
    assert.equal(game.teams[1][0].price, 0);
    assert.equal(game.teams[1][0].position, game.teams[2][0].position);
    assert.notEqual(game.teams[1][0].footballPlayerId, game.teams[2][0].footballPlayerId);
    assert.equal(game.round, 2);
    assert.equal(game.auction.firstBidder, 2);
    const auction = await (await fetch(base + '/' + game.id + '/auction')).json();
    assert.equal(auction.auction.round, 2);
    while (game.status === 'active') {
      response = await post('/' + game.id + '/bid', { ...input(game), amount: 10 });
      assert.equal(response.status, 200);
      game = await response.json();
      response = await post('/' + game.id + '/pass', input(game));
      assert.equal(response.status, 200);
      game = await response.json();
    }
    assert.equal(game.teams[1].length, 6);
    assert.equal(game.teams[2].length, 6);
    assert.equal((await post('/' + game.id + '/pass', input(game))).status, 409);
    assert.deepEqual(await (await fetch(base + '/' + game.id + '/team/2')).json(), game.teamStructure[2]);
    await new Promise(resolve => server.close(resolve));
    database.close();
    database = openDatabase(filename);
    assert.deepEqual(new GameService(new GameRepository(database)).get(game.id), game);
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
    database.close();
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    rmSync(directory, { recursive: true, force: true });
  }
});
