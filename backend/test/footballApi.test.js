import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFootballApiService, normalizePlayer } from '../src/services/footballApiService.js';

const settings = { useMockData: false, apiKey: 'private-test-key', apiUrl: 'https://example.com', league: '39', season: '2024' };
const entry = id => ({ player: { id, name: `Player ${id}`, photo: 'https://example.com/photo.png', nationality: 'France' },
  statistics: [{ games: { position: 'Attacker' }, team: { name: 'Club' } }] });

test('le mode démo fonctionne sans clé et sans réseau', async () => {
  const service = createFootballApiService({ useMockData: true }, () => { throw new Error('Pas de réseau'); });
  assert.equal((await service.getPlayers()).length, 32);
});

test('API : normalisation, pagination, dédoublonnage, cache et appels simultanés', async () => {
  const requests = [];
  const service = createFootballApiService(settings, async (url, options) => {
    requests.push({ url: String(url), key: options.headers['x-apisports-key'] });
    const page = Number(url.searchParams.get('page'));
    return { ok: true, json: async () => ({ errors: [], paging: { total: 2 },
      response: Array.from({ length: 6 }, (_, i) => entry((page - 1) * 5 + i + 1)) }) };
  });
  const [players, simultaneous] = await Promise.all([service.getPlayers(), service.getPlayers()]);
  assert.equal(players.length, 11);
  assert.deepEqual(players, simultaneous);
  assert.equal(players[0].position, 'Attacker');
  await service.getPlayers();
  assert.equal(requests.length, 2);
  assert.equal(requests[0].key, 'private-test-key');
  assert.ok(!requests[0].url.includes('private-test-key'));
  assert.equal(normalizePlayer({}), null);
});

test('API : erreurs contrôlées sans exposer les secrets ni utiliser la démo', async () => {
  const unconfigured = createFootballApiService({ ...settings, apiKey: '' }, () => { throw new Error('Pas de réseau'); });
  assert.equal((await unconfigured.getPlayers()).length, 32);
  await assert.rejects(createFootballApiService(settings, async () => { throw new Error(settings.apiKey); }).getPlayers(),
    error => error.code === 'FOOTBALL_API_UNAVAILABLE' && !error.message.includes(settings.apiKey));
  await assert.rejects(createFootballApiService(settings, async () => ({ ok: true,
    json: async () => ({ errors: { token: 'Invalid' }, response: [] }) })).getPlayers(), { code: 'FOOTBALL_API_ERROR' });
});
