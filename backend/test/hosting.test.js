import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/models/database.js';
import { backupDatabase } from '../src/models/databaseBackup.js';
import { GameRepository } from '../src/models/gameRepository.js';
import { GameService } from '../src/services/gameService.js';
import { PlayerCareerRepository } from '../src/models/playerCareerRepository.js';
import { PlayerCareerGameService } from '../src/services/playerCareerGameService.js';
import { netlifyRedirects } from '../../scripts/netlifyConfig.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
function temporary(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'football-hosting-'));
  t.after(() => {
    assert.ok(path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep));
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

test('Netlify : proxy HTTPS vers le backend, sans identifiants ni adresse manquante', () => {
  assert.equal(netlifyRedirects('https://football.onrender.com'),
    '/api/* https://football.onrender.com/api/:splat 200!\n/* /index.html 200\n');
  for (const value of [undefined,'','http://localhost:3001','https://user:password@example.com','https://example.com/api',
    'https://example.com?key=secret','https://example.com/#fragment','https://example.com\n/api/* attacker']) {
    assert.throws(() => netlifyRedirects(value));
  }
});

test('sauvegarde WAL : parties et catalogue préservés, verrou de copie libéré, aucun fichier écrasé', async t => {
  const directory = temporary(t);
  const filename = path.join(directory, 'live.sqlite');
  const destination = path.join(directory, 'backup.sqlite');
  const db = openDatabase(filename);
  let restored;
  try {
    const gameRepo = new GameRepository(db);
    const gameService = new GameService(gameRepo);
    const game = await gameService.create({ player1Name: 'Alex', player2Name: 'Sam' });
    gameService.bid(game.id, { player: 1, playerId: game.auction.offeredPlayer.id, version: game.version, amount: 20 });
    const careerRepo = new PlayerCareerRepository(db);
    const careerService = new PlayerCareerGameService(careerRepo);
    const quiz = await careerService.start();
    careerService.answer(quiz.gameId, { answer: 'Réponse incorrecte' });
    db.prepare("UPDATE PlayerSyncLock SET owner='source-process',expiresAt=? WHERE id=1").run(Date.now() + 60000);
    const oldGame = gameRepo.get(game.id);
    const oldQuiz = careerRepo.get(quiz.gameId);
    assert.ok(statSync(filename + '-wal').size > 0);
    const result = await backupDatabase(filename, destination);
    assert.equal(result.counts.Player, 32);
    assert.equal(result.counts.Game, 1);
    assert.equal(result.counts.PlayerCareerGame, 1);
    assert.equal(db.prepare('SELECT owner FROM PlayerSyncLock').get().owner, 'source-process');
    await assert.rejects(backupDatabase(filename, destination), { code: 'EEXIST' });
    await assert.rejects(backupDatabase(filename, filename), /chemin différent/);
    restored = openDatabase(destination);
    assert.deepEqual(new GameRepository(restored).get(game.id), oldGame);
    assert.deepEqual(new PlayerCareerRepository(restored).get(quiz.gameId), oldQuiz);
    assert.equal(restored.prepare('SELECT expiresAt FROM PlayerSyncLock').get().expiresAt, 0);
    assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { restored?.close(); db.close(); }
});

test('production : stockage explicite et port numérique, aucune dépendance au .env local', t => {
  const directory = temporary(t);
  const script = "import {config} from './backend/src/config.js';console.log(JSON.stringify({host:config.host,port:config.port,databasePath:config.databasePath,production:config.production}));";
  const environment = { ...process.env, NODE_ENV: 'production', HOST: '', PORT: '10000', DATABASE_PATH: path.join(directory, 'production.sqlite') };
  const valid = spawnSync(process.execPath, ['--input-type=module','-e',script], { cwd: root, env: environment, encoding: 'utf8' });
  assert.equal(valid.status, 0, valid.stderr);
  assert.deepEqual(JSON.parse(valid.stdout), { host:'0.0.0.0', port:10000, databasePath:environment.DATABASE_PATH, production:true });
  for (const overrides of [{ DATABASE_PATH:'' },{ DATABASE_PATH:'relative.sqlite' },{ PORT:'not-a-port' }]) {
    const result = spawnSync(process.execPath, ['--input-type=module','-e',script], { cwd:root, env:{ ...environment,...overrides }, encoding:'utf8' });
    assert.notEqual(result.status, 0);
  }
});

test('serveur de production : démarrage, deux jeux, absence de cache et synchronisation HTTP refusée', async t => {
  const directory = temporary(t);
  const child = spawn(process.execPath, ['backend/src/server.js'], { cwd: root,
    env: { ...process.env, NODE_ENV:'production', HOST:'0.0.0.0', PORT:'0', DATABASE_PATH:path.join(directory,'production.sqlite') },
    stdio: ['ignore','pipe','pipe'] });
  const closed = new Promise(resolve => child.once('close', resolve));
  try {
    const port = await new Promise((resolve, reject) => {
      let output = '', errors = '';
      const timeout = setTimeout(() => reject(new Error('Le serveur ne démarre pas : ' + errors)), 10000);
      child.stderr.on('data', chunk => { errors += chunk; });
      child.on('error', error => { clearTimeout(timeout); reject(error); });
      child.on('exit', code => { clearTimeout(timeout); reject(new Error('Serveur arrêté : ' + code + ' ' + errors)); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/http:\/\/0\.0\.0\.0:(\d+)/);
        if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
      });
    });
    const base = 'http://127.0.0.1:' + port + '/api';
    const post = (route, body) => fetch(base + route, { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body) });
    const health = await fetch(base + '/health');
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.equal((await health.json()).dataMode, 'sqlite');
    assert.equal((await post('/games', { player1Name:'Alex',player2Name:'Sam' })).status, 201);
    const quiz = await post('/player-career/start', { difficulty:'hard' });
    assert.equal(quiz.status, 201);
    assert.equal((await quiz.json()).player, undefined);
    const admin = await post('/admin/sync-players', {});
    assert.equal(admin.status, 403);
    assert.equal((await admin.json()).error.code, 'ADMIN_CLI_ONLY');
    assert.equal((await fetch(base + '/players?position=GK')).status, 200);
  } finally { child.kill(); await closed; }
});
