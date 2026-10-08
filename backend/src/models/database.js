import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { seedCatalogue } from './playerCatalogueRepository.js';

export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS Game (
      id TEXT PRIMARY KEY,
      player1Name TEXT NOT NULL,
      player2Name TEXT NOT NULL,
      player1Money INTEGER NOT NULL DEFAULT 200 CHECK(player1Money >= 0),
      player2Money INTEGER NOT NULL DEFAULT 200 CHECK(player2Money >= 0),
      currentTurn INTEGER NOT NULL DEFAULT 1,
      currentPlayer INTEGER NOT NULL DEFAULT 1 CHECK(currentPlayer IN (1,2)),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','finished')),
      createdAt TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS GamePlayer (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gameId TEXT NOT NULL REFERENCES Game(id) ON DELETE CASCADE,
      footballPlayerId TEXT NOT NULL,
      name TEXT NOT NULL,
      photo TEXT,
      team TEXT NOT NULL,
      nationality TEXT NOT NULL,
      position TEXT NOT NULL,
      price INTEGER NOT NULL CHECK(price >= 0),
      owner INTEGER NOT NULL CHECK(owner IN (1,2)),
      UNIQUE(gameId, footballPlayerId)
    );
    CREATE INDEX IF NOT EXISTS GamePlayer_game_owner ON GamePlayer(gameId, owner);
  `);
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version === 1) {
    // SQLite ne modifie pas un CHECK en place : reconstruire en conservant les lignes.
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`
        ALTER TABLE GamePlayer RENAME TO GamePlayer_v1;
        CREATE TABLE GamePlayer (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          gameId TEXT NOT NULL REFERENCES Game(id) ON DELETE CASCADE,
          footballPlayerId TEXT NOT NULL,
          name TEXT NOT NULL,
          photo TEXT,
          team TEXT NOT NULL,
          nationality TEXT NOT NULL,
          position TEXT NOT NULL,
          price INTEGER NOT NULL CHECK(price >= 0),
          owner INTEGER NOT NULL CHECK(owner IN (1,2)),
          UNIQUE(gameId, footballPlayerId)
        );
        INSERT INTO GamePlayer SELECT * FROM GamePlayer_v1;
        DROP TABLE GamePlayer_v1;
        CREATE INDEX GamePlayer_game_owner ON GamePlayer(gameId, owner);
        PRAGMA user_version = 2;
      `);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      db.close();
      throw error;
    }
  } else if (version === 0) db.exec('PRAGMA user_version = 2');
  db.exec(`
    CREATE TABLE IF NOT EXISTS PlayerCareerGame (
      id TEXT PRIMARY KEY,
      playerId TEXT NOT NULL,
      playerName TEXT NOT NULL,
      playerPhoto TEXT,
      career TEXT NOT NULL,
      dataNote TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PLAYING' CHECK(status IN ('PLAYING', 'FINISHED')),
      difficulty TEXT NOT NULL CHECK(difficulty IN ('easy', 'medium', 'hard')),
      createdAt TEXT NOT NULL,
      answeredAt TEXT,
      isCorrect INTEGER CHECK(isCorrect IN (0, 1)),
      answer TEXT
    );
  `);
  if (db.prepare('PRAGMA user_version').get().user_version < 3) db.exec('PRAGMA user_version = 3');
  db.exec(`
    CREATE TABLE IF NOT EXISTS Club (
      id INTEGER PRIMARY KEY AUTOINCREMENT, apiClubId TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      logo TEXT, country TEXT, source TEXT NOT NULL DEFAULT 'api'
    );
    CREATE TABLE IF NOT EXISTS Player (
      id INTEGER PRIMARY KEY AUTOINCREMENT, apiPlayerId TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      firstname TEXT, lastname TEXT, age INTEGER, nationality TEXT, photo TEXT,
      position TEXT NOT NULL CHECK(position IN ('Goalkeeper','Defender','Midfielder','Attacker')),
      height TEXT, weight TEXT, currentClubId INTEGER REFERENCES Club(id), source TEXT NOT NULL DEFAULT 'api', careerSyncedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS Player_position ON Player(position);
    CREATE TABLE IF NOT EXISTS PlayerCareer (
      id INTEGER PRIMARY KEY AUTOINCREMENT, playerId INTEGER NOT NULL REFERENCES Player(id),
      clubId INTEGER NOT NULL REFERENCES Club(id), startDate TEXT, endDate TEXT, season TEXT,
      source TEXT NOT NULL DEFAULT 'api', stintKey TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      UNIQUE(playerId,stintKey)
    );
    CREATE INDEX IF NOT EXISTS PlayerCareer_player_active ON PlayerCareer(playerId,active);
    CREATE TABLE IF NOT EXISTS PlayerSyncLock (id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT, expiresAt INTEGER NOT NULL);
    INSERT OR IGNORE INTO PlayerSyncLock (id,expiresAt) VALUES (1,0);
  `);
  if (!db.prepare('PRAGMA table_info(Player)').all().some(column => column.name === 'careerSyncedAt')) {
    db.exec('ALTER TABLE Player ADD COLUMN careerSyncedAt TEXT');
  }
  if (db.prepare('PRAGMA user_version').get().user_version < 4) db.exec('PRAGMA user_version = 4');
  seedCatalogue(db);
  return db;
}
