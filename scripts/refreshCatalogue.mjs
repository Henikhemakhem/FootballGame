import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createFootballApiService } from '../backend/src/services/footballApiClient.js';
import { validateCatalogue } from '../frontend/src/games/catalogue.js';
import { suitableCareer } from '../frontend/src/games/careerService.js';

export async function refreshCatalogue(previous, { settings, football = createFootballApiService(settings), wait = delay }) {
  validateCatalogue(previous);
  if (Number(previous.league) !== settings.league || Number(previous.season) !== settings.season) {
    throw new Error('Le catalogue conservé appartient à une autre ligue ou saison. Exportez un catalogue correspondant avant de changer la compétition.');
  }
  const players = new Map(previous.players.map(player => [player.id, player]));
  const careers = new Map(previous.careers.map(player => [player.id, player]));
  const imported = new Map();
  const warnings = new Set();
  let requests = 0;
  const signal = AbortSignal.timeout(10 * 60 * 1000);
  const request = async action => {
    if (requests >= settings.maxRequests) throw Object.assign(new Error(), { code: 'SYNC_REQUEST_BUDGET' });
    if (requests) await wait(settings.requestDelayMs, undefined, { signal });
    requests++;
    return action();
  };
  const stops = error => ['FOOTBALL_API_RATE_LIMIT','FOOTBALL_API_PLAN_LIMIT','SYNC_REQUEST_BUDGET','API_NOT_CONFIGURED','FOOTBALL_API_UNAVAILABLE'].includes(error.code);
  let totalPages = 1, stop = false;
  for (let page = 1; page <= Math.min(totalPages, settings.maxPages); page++) {
    try {
      const result = await request(() => football.fetchSyncPage({ ...settings, page, signal }));
      totalPages = result.totalPages;
      for (const player of result.players) {
        const id = 'api-' + player.id;
        const old = players.get(id);
        const name = /\b\p{L}\./u.test(player.fullName) && old ? old.name : player.fullName || player.name;
        const saved = { id, apiPlayerId: String(player.id), name, photo: player.photo || old?.photo || null,
          nationality: player.nationality || 'Non renseignée', position: player.position, team: player.team, source: 'api' };
        players.set(id, saved);
        imported.set(id, saved);
      }
    } catch (error) { warnings.add(error.code || 'SYNC_API_ERROR'); stop = stops(error) || signal.aborted; break; }
  }
  if (totalPages > settings.maxPages) warnings.add('SYNC_PAGE_LIMIT');
  for (const player of [...imported.values()].slice(0, settings.careerLimit)) {
    if (stop) break;
    try {
      const raw = await request(() => football.fetchSyncCareer(player.apiPlayerId, { signal }));
      const career = raw.map(step => ({ club: step.club, from: step.from || null, to: step.to || null }));
      if (suitableCareer(career) && player.name.trim().includes(' ') && !/\b\p{L}\./u.test(player.name)) {
        careers.set(player.id, { ...player, career, dataNote: 'Historique API-Football ; les dates inconnues ne sont pas inventées.' });
      }
    } catch (error) { warnings.add(error.code || 'SYNC_API_ERROR'); stop = stops(error) || signal.aborted; }
  }
  if (imported.size > settings.careerLimit) warnings.add('SYNC_CAREER_LIMIT');
  const data = validateCatalogue({ ...previous, updatedAt: imported.size ? new Date().toISOString() : previous.updatedAt,
    players: [...players.values()], careers: [...careers.values()] });
  return { data, requests, playersFetched: imported.size, warnings: [...warnings] };
}

export async function prepareCatalogue({ useLocalEnv = false, environment = process.env } = {}) {
  if (useLocalEnv) {
    const { default: dotenv } = await import('dotenv');
    dotenv.config({ path: new URL('../backend/.env', import.meta.url), quiet: true });
  }
  const file = new URL('../frontend/public/players.json', import.meta.url);
  const previous = validateCatalogue(JSON.parse(await readFile(file, 'utf8')));
  const apiKey = environment.FOOTBALL_API_KEY?.trim();
  if (!apiKey) {
    console.log(`Catalogue conservé : ${previous.players.length} joueurs API, ${previous.careers.length} parcours. FOOTBALL_API_KEY absente : aucun appel fournisseur.`);
    return previous;
  }
  const bounded = (name, fallback, min, max) => {
    const value = Number(environment[name] || fallback);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error('Configuration invalide : ' + name);
    return value;
  };
  const settings = { apiKey, apiUrl: environment.FOOTBALL_API_URL || 'https://v3.football.api-sports.io',
    league: bounded('FOOTBALL_API_LEAGUE', previous.league, 1, 10000), season: bounded('FOOTBALL_API_SEASON', previous.season, 2000, 2100),
    maxPages: bounded('FOOTBALL_SYNC_MAX_PAGES', 3, 1, 200), careerLimit: bounded('FOOTBALL_SYNC_CAREER_LIMIT', 20, 0, 1000),
    maxRequests: bounded('FOOTBALL_SYNC_MAX_REQUESTS', 30, 1, 2000), requestDelayMs: bounded('FOOTBALL_SYNC_REQUEST_DELAY_MS', 6500, 0, 60000) };
  const result = await refreshCatalogue(previous, { settings });
  // Write only validated public fields. Provider responses, games and secrets are never serialized.
  await writeFile(file, JSON.stringify(result.data, null, 2) + '\n');
  console.log(JSON.stringify({ playersFetched: result.playersFetched, requests: result.requests, warnings: result.warnings,
    players: result.data.players.length, playableCareers: result.data.careers.length }));
  return result.data;
}
