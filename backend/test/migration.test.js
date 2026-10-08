import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../src/models/database.js';
import { GameRepository } from '../src/models/gameRepository.js';

test('migration SQLite V1 → V2 : conserve les anciennes recrues et autorise les nouvelles gratuites', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'football-draft-migration-'));
  const filename = path.join(directory, 'legacy.sqlite');
  let db = new DatabaseSync(filename);
  try {
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE Game (
        id TEXT PRIMARY KEY, player1Name TEXT NOT NULL, player2Name TEXT NOT NULL,
        player1Money INTEGER NOT NULL CHECK(player1Money >= 0),
        player2Money INTEGER NOT NULL CHECK(player2Money >= 0),
        currentTurn INTEGER NOT NULL, currentPlayer INTEGER NOT NULL,
        status TEXT NOT NULL, createdAt TEXT NOT NULL, version INTEGER NOT NULL, state TEXT NOT NULL
      );
      CREATE TABLE GamePlayer (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gameId TEXT NOT NULL REFERENCES Game(id) ON DELETE CASCADE,
        footballPlayerId TEXT NOT NULL, name TEXT NOT NULL, photo TEXT, team TEXT NOT NULL,
        nationality TEXT NOT NULL, position TEXT NOT NULL,
        price INTEGER NOT NULL CHECK(price > 0), owner INTEGER NOT NULL CHECK(owner IN (1,2)),
        UNIQUE(gameId, footballPlayerId)
      );
      CREATE INDEX GamePlayer_game_owner ON GamePlayer(gameId, owner);
      PRAGMA user_version = 1;
    `);
    let repository = new GameRepository(db);
    repository.create({ id: 'old', player1Name: 'Alex', player2Name: 'Sam',
      player1Money: 175, player2Money: 200, currentTurn: 2, currentPlayer: 2,
      status: 'active', createdAt: '2026-10-08', version: 1, state: { usedIds: ['old-player'] } });
    const player = { id: 'old-player', name: 'Test', photo: null, team: 'Club', nationality: 'France', position: 'Defender', price: 25 };
    repository.purchase('old', player, 1);
    const original = repository.get('old');
    db.close();
    db = openDatabase(filename);
    repository = new GameRepository(db);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
    assert.deepEqual(repository.get('old'), original);
    repository.purchase('old', { ...player, id: 'free', price: 0 }, 2);
    assert.equal(repository.team('old', 2)[0].price, 0);
    assert.throws(() => repository.purchase('old', { ...player, id: 'negative', price: -1 }, 2));
    assert.throws(() => repository.purchase('old', player, 2));
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    const snapshot = repository.get('old');
    db.close();
    db = openDatabase(filename);
    assert.deepEqual(new GameRepository(db).get('old'), snapshot);
  } finally {
    db.close();
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    rmSync(directory, { recursive: true, force: true });
  }
});
