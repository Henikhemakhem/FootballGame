import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/models/database.js';
import { GameRepository } from '../src/models/gameRepository.js';

test('SQLite crée les tables, conserve une partie et annule les transactions invalides', () => {
  const db = openDatabase(':memory:');
  const repository = new GameRepository(db);
  try {
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    repository.create({ id: 'test', player1Name: 'Alex', player2Name: 'Sam',
      player1Money: 200, player2Money: 200, currentTurn: 1, currentPlayer: 1,
      status: 'active', createdAt: new Date().toISOString(), version: 0, state: { usedIds: [] } });
    assert.equal(repository.get('test').player1Money, 200);
    assert.throws(() => repository.transaction(() => {
      db.prepare('UPDATE Game SET player1Money = 100 WHERE id = ?').run('test');
      db.prepare('UPDATE Game SET player2Money = -1 WHERE id = ?').run('test');
    }));
    assert.equal(repository.get('test').player1Money, 200);
    const player = { id: 'p', name: 'Test', photo: null, team: 'Club', nationality: 'France', position: 'Attacker', price: 25 };
    repository.purchase('test', player, 1);
    assert.throws(() => repository.purchase('test', player, 2));
    assert.equal(repository.team('test', 1).length, 1);
    assert.throws(() => repository.purchase('missing', { ...player, id: 'other' }, 1));
    repository.purchase('test', { ...player, id: 'free', price: 0 }, 2);
    assert.equal(repository.team('test', 2)[0].price, 0);
    assert.throws(() => repository.purchase('test', { ...player, id: 'negative', price: -1 }, 1));
  } finally { db.close(); }
});
