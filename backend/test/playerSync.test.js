import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/models/database.js';
import { PlayerCatalogueRepository } from '../src/models/playerCatalogueRepository.js';
import { PlayerSyncService } from '../src/services/playerSyncService.js';
import { createFootballApiService } from '../src/services/footballApiService.js';
import { GameService } from '../src/services/gameService.js';
import { GameRepository } from '../src/models/gameRepository.js';
import { PlayerCareerRepository } from '../src/models/playerCareerRepository.js';
import { PlayerCareerGameService } from '../src/services/playerCareerGameService.js';
import { createApp } from '../src/app.js';

const settings = { apiKey: 'secret-test-key', apiUrl: 'https://provider.example', league: '39', season: '2024',
  useMockData: true, syncRequestDelayMs: 0 };
const clubs = [
  { id: 11001, name: 'Club Alpha', country: 'France', logo: 'https://provider.example/alpha.png' },
  { id: 11002, name: 'Club Beta', country: 'France' },
  { id: 11003, name: 'Club Gamma', country: 'France' },
];
const positions = ['Goalkeeper','Defender','Midfielder','Attacker'];
const profile = id => ({ player: { id, name: 'J. ' + id, firstname: 'Joueur', lastname: String(id),
  age: 27, height: '180 cm', weight: '75 kg', nationality: 'France', photo: 'https://provider.example/' + id + '.png' },
  statistics: [{ team: clubs[2], games: { position: positions[id % 4] } }] });
const moves = id => [{ player: { id }, transfers: [
  { date: '2014-07-01', teams: { out: clubs[0], in: clubs[1] } },
  { date: '2016-07-01', teams: { out: clubs[1], in: clubs[0] } },
  { date: '2019-07-01', teams: { out: clubs[0], in: clubs[2] } },
] }];
const response = data => ({ ok: true, status: 200, json: async () => ({ errors: [], ...data }) });

function fixture(t, count = 350, intercept = () => null) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const repository = new PlayerCatalogueRepository(db);
  const requests = [];
  const football = createFootballApiService(settings, async (url, options) => {
    requests.push(url.pathname);
    assert.equal(options.headers['x-apisports-key'], settings.apiKey);
    assert.ok(!String(url).includes(settings.apiKey));
    const custom = intercept(url);
    if (custom) return custom;
    if (url.pathname === '/players') {
      const page = Number(url.searchParams.get('page'));
      const start = (page - 1) * 20 + 1;
      const players = Array.from({ length: Math.max(0, Math.min(20, count - start + 1)) }, (_, i) => profile(start + i));
      if (page > 1) players.push(profile(1)); // provider overlap across pages
      return response({ response: players, paging: { total: Math.max(1, Math.ceil(count / 20)) } });
    }
    if (url.pathname === '/teams') return response({ response: clubs.map(team => ({ team })) });
    if (url.pathname === '/transfers') return response({ response: moves(Number(url.searchParams.get('player'))) });
    throw new Error('Unexpected endpoint');
  });
  return { db, repository, requests, service: new PlayerSyncService(repository, { football, settings, wait: async () => {} }) };
}

test('synchronisation : 350 joueurs, profils, clubs, prêts/retours ; deuxième import sans doublons', async t => {
  const { db, repository, service } = fixture(t);
  const baseline = repository.counts();
  const options = { careerLimit: 350, maxRequests: 1000 };
  const first = await service.sync(options);
  assert.equal(first.playersFetched, 350);
  assert.equal(first.playersAdded, 350);
  assert.equal(first.clubsAdded, 3);
  assert.equal(first.careersAdded, 1400);
  assert.equal(first.complete, true);
  assert.equal(first.localCounts.Player, baseline.Player + 350);
  const player = db.prepare('SELECT * FROM Player WHERE apiPlayerId=?').get('1');
  assert.equal(player.name, 'Joueur 1');
  assert.equal(player.firstname, 'Joueur');
  assert.equal(player.age, 27);
  assert.equal(player.height, '180 cm');
  assert.deepEqual(repository.getPlayerCareer('local-' + player.id).map(step => step.club), ['Club Alpha','Club Beta','Club Alpha','Club Gamma']);
  const second = await service.sync(options);
  assert.equal(second.playersAdded, 0);
  assert.equal(second.playersUpdated, 350);
  assert.equal(second.clubsAdded, 0);
  assert.equal(second.careersAdded, 0);
  assert.equal(second.careersUpdated, 1400);
  assert.deepEqual(second.localCounts, first.localCounts);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM (SELECT apiPlayerId FROM Player GROUP BY apiPlayerId HAVING COUNT(*)>1)').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM (SELECT apiClubId FROM Club GROUP BY apiClubId HAVING COUNT(*)>1)').get().n, 0);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('les deux jeux utilisent les nouveaux joueurs SQLite sans aucun appel réseau', async t => {
  const { repository, service, db } = fixture(t, 12);
  await service.sync({ careerLimit: 12 });
  const real = repository.getPlayers().filter(player => player.source === 'api');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Network prohibited while starting a game'); };
  try {
    const auctions = new GameService(new GameRepository(db), { pick: length => length - 1 });
    const game = await auctions.create({ player1Name: 'Alex', player2Name: 'Sam' });
    assert.ok(real.some(player => player.id === game.auction.offeredPlayer.id));
    const careers = new PlayerCareerGameService(new PlayerCareerRepository(db), { pick: length => length - 1 });
    const quiz = await careers.start({ difficulty: 'hard' });
    assert.equal(quiz.career.length, 4);
    assert.ok(!JSON.stringify(quiz).includes('Joueur'));
    const saved = new PlayerCareerRepository(db).get(quiz.gameId);
    assert.ok(real.some(player => player.id === saved.playerId));
    assert.equal(careers.answer(quiz.gameId, { answer: saved.playerName }).correct, true);
    const next = await careers.start({ previousGameId: quiz.gameId });
    assert.notEqual(new PlayerCareerRepository(db).get(next.gameId).playerId, saved.playerId);
  } finally { globalThis.fetch = originalFetch; }
});

test('mise à jour : Salah conserve son identité locale, les anciennes parties et ses données manquantes', async t => {
  let extended = false;
  const { repository, service, db } = fixture(t, 1, url => {
    if (url.pathname !== '/players') return null;
    const entry = profile(306);
    entry.player = { id: 306, name: 'M. Salah', firstname: 'Mohamed', lastname: 'Salah', age: extended ? null : 34, nationality: 'Egypt' };
    entry.statistics[0].team = { id: 40, name: 'Liverpool' };
    return response({ response: [entry], paging: { total: 1 } });
  });
  const old = db.prepare("SELECT * FROM Player WHERE name='Mohamed Salah'").get();
  const careers = new PlayerCareerGameService(new PlayerCareerRepository(db), { pick: () => 0 });
  const quiz = await careers.start();
  const originalGame = new PlayerCareerRepository(db).get(quiz.gameId);
  const first = await service.sync({ careerLimit: 1 });
  assert.equal(first.playersAdded, 0);
  assert.equal(first.playersUpdated, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM Player WHERE name='Mohamed Salah'").get().n, 1);
  assert.equal(db.prepare("SELECT id FROM Player WHERE apiPlayerId='306'").get().id, old.id);
  assert.deepEqual(new PlayerCareerRepository(db).get(quiz.gameId), originalGame);
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM PlayerCareer WHERE playerId=? AND source='mock'").get(old.id).n >= 3);
  extended = true;
  const second = await service.sync({ careerLimit: 1 });
  assert.equal(second.careersAdded, 0);
  assert.equal(db.prepare("SELECT age FROM Player WHERE apiPlayerId='306'").get().age, 34);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(repository.getRandomCareerPlayer({ pick: () => 0 }).career.length >= 3, true);
});

test('erreurs API, réponse vide, timeout : données locales intactes et verrou libéré', async t => {
  for (const failure of [() => { throw new Error('timeout secret-test-key'); },
    () => ({ ok: false, status: 503 }), () => response({ response: [], paging: { total: 1 } }),
    () => response({ errors: { token: 'invalid' }, response: [] })]) {
    const { repository, service, db } = fixture(t, 1, failure);
    const before = repository.counts();
    await assert.rejects(service.sync(), error => error.status === 502 && !error.message.includes(settings.apiKey));
    assert.deepEqual(repository.counts(), before);
    assert.equal(db.prepare('SELECT expiresAt FROM PlayerSyncLock').get().expiresAt, 0);
    assert.equal((await new PlayerCareerGameService(new PlayerCareerRepository(db)).start()).status, 'PLAYING');
    assert.equal((await new GameService(new GameRepository(db)).create({ player1Name: 'A', player2Name: 'B' })).status, 'active');
  }
});

test('quota en cours : import partiel conservé, arrêt immédiat, aucune suppression de parcours', async t => {
  const { repository, service, db, requests } = fixture(t, 40, url => url.pathname === '/players' && url.searchParams.get('page') === '2'
    ? { ok: false, status: 429 } : null);
  const before = repository.counts();
  const summary = await service.sync();
  assert.equal(summary.complete, false);
  assert.ok(summary.warnings.includes('FOOTBALL_API_RATE_LIMIT'));
  assert.equal(summary.playersAdded, 20);
  assert.equal(requests.length, 2);
  assert.equal(repository.counts().Player, before.Player + 20);
  assert.equal(repository.counts().PlayerCareer, before.PlayerCareer);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('historiques vides, trop courts ou clubs sans ID : filtrage du quiz, ancien parcours préservé', async t => {
  const { repository, service, db } = fixture(t, 3, url => {
    if (url.pathname !== '/transfers') return null;
    const id = Number(url.searchParams.get('player'));
    if (id === 1) return response({ response: [] });
    const entries = moves(id);
    if (id === 2) entries[0].transfers = entries[0].transfers.slice(0, 1);
    if (id === 3) entries[0].transfers[0].teams.out = { name: 'Club sans ID' };
    return response({ response: entries });
  });
  const summary = await service.sync({ careerLimit: 3 });
  assert.equal(summary.careersSkipped, 3);
  assert.equal(summary.careersAdded, 2);
  assert.ok(repository.getCareerCandidates().every(player => player.source !== 'api'));
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('lots successifs : les parcours non encore interrogés sont prioritaires et le budget est respecté', async t => {
  const { service, db, requests } = fixture(t, 12, url => url.pathname === '/transfers' ? response({ response: [] }) : null);
  await service.sync({ careerLimit: 3 });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM Player WHERE careerSyncedAt IS NOT NULL').get().n, 3);
  await service.sync({ careerLimit: 3 });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM Player WHERE careerSyncedAt IS NOT NULL').get().n, 6);
  const before = requests.length;
  const limited = await service.sync({ maxRequests: 1 });
  assert.equal(limited.requests, 1);
  assert.equal(requests.length, before + 1);
  assert.ok(limited.warnings.includes('SYNC_REQUEST_BUDGET'));
});

test('un historique API devenu court ou vide ne modifie pas le parcours jouable déjà enregistré', async t => {
  let mode = 'full';
  const { service, repository, db } = fixture(t, 1, url => {
    if (url.pathname !== '/transfers' || mode === 'full') return null;
    const entries = mode === 'empty' ? [] : moves(1);
    if (mode === 'short') entries[0].transfers = entries[0].transfers.slice(0, 1);
    return response({ response: entries });
  });
  await service.sync({ careerLimit: 1 });
  const id = 'local-' + db.prepare("SELECT id FROM Player WHERE apiPlayerId='1'").get().id;
  const before = repository.getPlayerCareer(id);
  for (const next of ['short','empty']) {
    mode = next;
    const result = await service.sync({ careerLimit: 1 });
    assert.equal(result.careersSkipped, 1);
    assert.deepEqual(repository.getPlayerCareer(id), before);
    assert.ok(repository.getCareerCandidates().some(player => player.id === id));
  }
});

test('les limites de pagination et les en-têtes de quota produisent un bilan partiel explicite', async t => {
  const paged = fixture(t, 40);
  const capped = await paged.service.sync({ maxPages: 1, careerLimit: 20 });
  assert.equal(capped.playersFetched, 20);
  assert.equal(capped.complete, false);
  assert.ok(capped.warnings.includes('SYNC_PAGE_LIMIT'));
  const quota = fixture(t, 40, url => url.pathname === '/players' ? {
    ...response({ response: Array.from({ length: 20 }, (_, index) => profile(index + 1)), paging: { total: 2 } }),
    headers: { get: name => name === 'x-ratelimit-requests-remaining' ? '0' : null },
  } : null);
  const result = await quota.service.sync();
  assert.equal(result.playersFetched, 20);
  assert.ok(result.warnings.includes('FOOTBALL_API_RATE_LIMIT'));
  assert.equal(quota.requests.length, 1);
});

test('limite de pages du forfait gratuit : les carrières sont importées malgré la quatrième page refusée', async t => {
  const { service, requests } = fixture(t, 80, url => url.pathname === '/players' && url.searchParams.get('page') === '4'
    ? response({ response: [], errors: { plan: 'Free plans are limited to a maximum value of 3 for the Page parameter' } }) : null);
  const result = await service.sync({ careerLimit: 60 });
  assert.equal(result.playersFetched, 60);
  assert.equal(result.careersFetched, 60);
  assert.equal(result.careersAdded, 240);
  assert.equal(result.playableApiCareers, 60);
  assert.ok(result.warnings.includes('FOOTBALL_API_PAGE_LIMIT'));
  assert.ok(!result.warnings.includes('FOOTBALL_API_RATE_LIMIT'));
  assert.equal(requests.filter(path => path === '/players').length, 4);
  assert.equal(requests.filter(path => path === '/transfers').length, 60);
});

test('synchronisation des seules carrières : aucun rechargement des joueurs ni des clubs', async t => {
  const { service, repository, requests, db } = fixture(t, 12);
  await service.sync({ careerLimit: 0 });
  const before = repository.counts();
  const offset = requests.length;
  const result = await service.sync({ careersOnly: true, careerLimit: 12 });
  assert.equal(result.playersFetched, 0);
  assert.equal(result.playersAdded, 0);
  assert.equal(result.playersUpdated, 0);
  assert.equal(result.careersFetched, 12);
  assert.equal(result.playableApiCareers, 12);
  assert.equal(repository.counts().Player, before.Player);
  assert.deepEqual(requests.slice(offset), Array(12).fill('/transfers'));
  await assert.rejects(service.sync({ careersOnly: 'true' }), { code: 'INVALID_SYNC_OPTIONS' });
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('le parcours privilégie les historiques API, exclut les démos et rejouer change de joueur', async t => {
  const { service, repository, db } = fixture(t, 12);
  await service.sync({ careerLimit: 12 });
  assert.ok(repository.getCareerCandidates().some(player => player.careerSource === 'mock'));
  const careers = new PlayerCareerGameService(new PlayerCareerRepository(db), { pick: () => 0 });
  const first = await careers.start();
  const previous = new PlayerCareerRepository(db).get(first.gameId);
  assert.equal(repository.getCareerCandidates().find(player => player.id === previous.playerId).careerSource, 'api');
  const next = await careers.start({ previousGameId: first.gameId });
  const current = new PlayerCareerRepository(db).get(next.gameId);
  assert.notEqual(previous.playerId, current.playerId);
  assert.equal(repository.getCareerCandidates().find(player => player.id === current.playerId).careerSource, 'api');
  assert.equal(first.player, undefined);
  assert.match(first.dataNote, /API-Football/);
});

test('carrières interdites par le forfait : un seul appel refusé et parcours locaux préservés', async t => {
  const { service, repository, requests } = fixture(t, 12, url => url.pathname === '/transfers'
    ? response({ response: [], errors: { plan: 'This endpoint is not available for this subscription' } }) : null);
  await service.sync({ careerLimit: 0 });
  const before = repository.counts();
  const offset = requests.length;
  const result = await service.sync({ careersOnly: true, careerLimit: 12 });
  assert.ok(result.warnings.includes('FOOTBALL_API_PLAN_LIMIT'));
  assert.equal(requests.length - offset, 1);
  assert.deepEqual(repository.counts(), before);
});

test('REST : synchronisation locale, filtre par poste, options et synchronisations concurrentes', async t => {
  let block = false, release, entered;
  const { service, repository, db } = fixture(t, 12, url => block && url.pathname === '/players' ? new Promise(resolve => {
    release = () => resolve(response({ response: Array.from({ length: 12 }, (_, index) => profile(index + 1)), paging: { total: 1 } }));
    entered();
  }) : null);
  const server = createApp({ database: db, syncService: service }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (body, origin) => fetch(base + '/api/admin/sync-players', { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body) });
  let result = await post({ careerLimit: 12 });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).playersAdded, 12);
  for (const code of ['GK','DEF','MID','ATT']) {
    const players = await (await fetch(base + '/api/players?position=' + code)).json();
    assert.ok(players.length >= 3);
    assert.ok(players.every(player => player.position === { GK:'Goalkeeper', DEF:'Defender', MID:'Midfielder', ATT:'Attacker' }[code]));
  }
  assert.equal((await fetch(base + '/api/players?position=INVALID')).status, 400);
  assert.equal((await fetch(base + '/api/players?position=constructor')).status, 400);
  assert.equal((await post({ maxPages: 0 })).status, 400);
  assert.equal((await post({ apiKey: 'never-accepted' })).status, 400);
  assert.equal((await post({}, 'https://foreign.example')).status, 403);
  db.prepare('UPDATE PlayerSyncLock SET expiresAt=? WHERE id=1').run(Date.now() + 60000);
  assert.equal((await post({})).status, 409);
  db.prepare('UPDATE PlayerSyncLock SET expiresAt=0 WHERE id=1').run();
  const ready = new Promise(resolve => { entered = resolve; });
  block = true;
  const first = post({ careerLimit: 12 });
  await ready;
  const second = await post({ careerLimit: 12 });
  release();
  assert.equal(second.status, 409);
  assert.equal((await first).status, 200);
  assert.ok(repository.getRandomCareerPlayer().career.length >= 3);
});
