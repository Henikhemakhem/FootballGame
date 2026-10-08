import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../src/models/database.js';
import { GameRepository } from '../src/models/gameRepository.js';
import { GameService } from '../src/services/gameService.js';
import { PlayerCareerRepository } from '../src/models/playerCareerRepository.js';
import { PlayerCareerGameService } from '../src/services/playerCareerGameService.js';
import { mockPlayers } from '../src/data/mockPlayers.js';

test('les deux jeux utilisent la même SQLite et survivent au redémarrage sans modifier leurs états', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'football-games-shared-'));
  const filename = path.join(directory, 'test.sqlite');
  let db = openDatabase(filename);
  try {
    let auctions = new GameService(new GameRepository(db), { loadPlayers: async () => mockPlayers });
    let careers = new PlayerCareerGameService(new PlayerCareerRepository(db));
    let auction = await auctions.create({ player1Name: 'Alex', player2Name: 'Sam' });
    auction = auctions.bid(auction.id, { player: 1, playerId: auction.auction.offeredPlayer.id, version: 0, amount: 20 });
    const career = await careers.start({ difficulty: 'hard' });
    db.close();
    db = openDatabase(filename);
    auctions = new GameService(new GameRepository(db));
    careers = new PlayerCareerGameService(new PlayerCareerRepository(db));
    assert.deepEqual(auctions.get(auction.id), auction);
    assert.deepEqual(careers.get(career.gameId), career);
    const answer = careers.answer(career.gameId, { answer: 'Mauvaise réponse' });
    db.close();
    db = openDatabase(filename);
    assert.deepEqual(new PlayerCareerGameService(new PlayerCareerRepository(db)).get(career.gameId), answer);
    assert.deepEqual(new GameService(new GameRepository(db)).get(auction.id), auction);
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    db.close();
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    rmSync(directory, { recursive: true, force: true });
  }
});
