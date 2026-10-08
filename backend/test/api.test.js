import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/models/database.js';
import { GameRepository } from '../src/models/gameRepository.js';
import { GameService } from '../src/services/gameService.js';
import { mockPlayers } from '../src/data/mockPlayers.js';

test('REST : création, lecture et validation des paramètres', async () => {
  const database = openDatabase(':memory:');
  const service = new GameService(new GameRepository(database), { loadPlayers: async () => mockPlayers });
  const server = createApp({ database, service }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (route, body) => fetch(base + route, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await request('/health')).status, 200);
    assert.equal((await request('/games', {})).status, 400);
    const created = await request('/games', { player1Name: 'Alex', player2Name: 'Sam', player1Money: 900 });
    assert.equal(created.status, 201);
    const game = await created.json();
    assert.equal(game.player1Money, 200);
    assert.equal(game.player2Money, 200);
    assert.equal((await (await request(`/games/${game.id}`)).json()).id, game.id);
    assert.equal((await request(`/games/${game.id}/auction`)).status, 200);
    assert.deepEqual(await (await request(`/games/${game.id}/team/1`)).json(), { goalkeeper: [], defenders: [], midfielders: [], attackers: [] });
    assert.equal((await request(`/games/${game.id}/accept`, {})).status, 404);
    assert.equal((await request(`/games/${game.id}/reject`, {})).status, 404);
    assert.equal((await request(`/games/${game.id}/team/3`)).status, 400);
    assert.equal((await request('/games/missing')).status, 404);
    assert.equal((await request('/unknown')).status, 404);
    const malformed = await fetch(`${base}/games`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, 'INVALID_JSON');
  } finally {
    await new Promise(resolve => server.close(resolve));
    database.close();
  }
});
