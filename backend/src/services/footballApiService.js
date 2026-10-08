import { config } from '../config.js';
import { mockPlayers } from '../data/mockPlayers.js';
import { mockCareers } from '../data/mockCareers.js';
import { careerFromTransfers } from './careerService.js';
import { GameError } from './gameError.js';

const positions = new Set(['Attacker', 'Midfielder', 'Defender', 'Goalkeeper']);
export function normalizePlayer(entry) {
  const player = entry?.player;
  const stat = entry?.statistics?.find(item => positions.has(item?.games?.position) && item?.team?.name);
  if (!player?.id || typeof player.name !== 'string' || !stat) return null;
  const fullName = [player.firstname, player.lastname].filter(value => typeof value === 'string' && value.trim()).join(' ').trim();
  return { id: String(player.id), name: player.name, fullName: fullName || player.name, photo: /^https:\/\//.test(player.photo || '') ? player.photo : null,
    nationality: player.nationality || null, team: stat.team.name, position: stat.games.position,
    firstname: player.firstname || null, lastname: player.lastname || null, age: player.age || null,
    height: player.height || null, weight: player.weight || null,
    club: stat.team.id != null ? { id: String(stat.team.id), name: stat.team.name, logo: /^https:\/\//.test(stat.team.logo || '') ? stat.team.logo : null } : null };
}

export function createFootballApiService(settings = config, fetcher = fetch) {
  let cache = null;
  let expiresAt = 0;
  let pending = null;
  const careerCache = new Map();
  const careerPending = new Map();
  const mockMode = settings.useMockData || !settings.apiKey;
  let quotaBlockedUntil = 0;

  // Synchronization always uses the provider, even if the old demo flag remains enabled.
  async function syncRequest(endpoint, parameters, signal) {
    if (!settings.apiKey) throw new GameError(502, 'API_NOT_CONFIGURED', 'Renseignez FOOTBALL_API_KEY dans backend/.env pour synchroniser les joueurs réels.');
    if (Date.now() < quotaBlockedUntil) throw new GameError(502, 'FOOTBALL_API_RATE_LIMIT', 'Quota API épuisé selon le fournisseur. Réessayez après sa réinitialisation.');
    let url;
    try {
      const base = new URL(settings.apiUrl);
      if (base.protocol !== 'https:' || base.username || base.password) throw new Error();
      url = new URL(base.toString().replace(/\/$/, '') + '/' + endpoint);
      url.search = new URLSearchParams(parameters).toString();
    } catch { throw new GameError(502, 'API_NOT_CONFIGURED', 'FOOTBALL_API_URL doit être une URL HTTPS valide.'); }
    let response, data;
    try {
      response = await fetcher(url, { headers: { 'x-apisports-key': settings.apiKey }, redirect: 'error',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
      if (response.status === 429) {
        quotaBlockedUntil = Date.now() + 60000;
        throw new GameError(502, 'FOOTBALL_API_RATE_LIMIT', 'Quota API atteint. La synchronisation est interrompue ; les données locales sont conservées.');
      }
      if (!response.ok) throw new Error();
      data = await response.json();
      const daily = response.headers?.get('x-ratelimit-requests-remaining');
      const perMinute = response.headers?.get('x-ratelimit-remaining');
      if ((daily != null && Number(daily) === 0) || (perMinute != null && Number(perMinute) === 0)) quotaBlockedUntil = Date.now() + 60000;
    } catch (error) {
      if (error instanceof GameError) throw error;
      throw new GameError(502, 'FOOTBALL_API_UNAVAILABLE', 'API unavailable : connexion, délai dépassé ou erreur HTTP. Les données locales sont conservées.');
    }
    if (data.errors && Object.keys(data.errors).length) {
      if (Object.hasOwn(data.errors, 'plan')) {
        const pageLimit = /\bpage\b/i.test(String(data.errors.plan));
        throw new GameError(502, pageLimit ? 'FOOTBALL_API_PAGE_LIMIT' : 'FOOTBALL_API_PLAN_LIMIT', pageLimit
          ? 'Votre abonnement limite la pagination des joueurs. Les joueurs disponibles sont conservés et les carrières peuvent être synchronisées.'
          : 'Votre abonnement API-Football ne permet pas cet accès. Les données locales sont conservées.');
      }
      const quota = /rate|limit|quota|requests/i.test(JSON.stringify(data.errors));
      throw new GameError(502, quota ? 'FOOTBALL_API_RATE_LIMIT' : 'FOOTBALL_API_ERROR', quota
        ? 'Limite API atteinte ; relancez la synchronisation après réinitialisation du quota.'
        : 'API Football a refusé la demande. Vérifiez la clé, la ligue et la saison.');
    }
    if (!Array.isArray(data.response)) throw new GameError(502, 'FOOTBALL_API_ERROR', 'Réponse API Football invalide.');
    return data;
  }

  async function loadCareer(playerId, signal) {
    let url;
    try {
      const base = new URL(settings.apiUrl);
      if (base.protocol !== 'https:' || base.username || base.password) throw new Error();
      url = new URL(base.toString().replace(/\/$/, '') + '/transfers');
      url.search = new URLSearchParams({ player: String(playerId) }).toString();
    } catch {
      throw new GameError(502, 'API_NOT_CONFIGURED', 'L’URL API Football doit être une URL HTTPS valide.');
    }
    let data;
    try {
      const response = await fetcher(url, { headers: { 'x-apisports-key': settings.apiKey },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000), redirect: 'error' });
      if (!response.ok) throw new Error();
      data = await response.json();
    } catch {
      throw new GameError(502, 'FOOTBALL_API_UNAVAILABLE', 'L’historique des transferts est indisponible. Réessayez plus tard.');
    }
    if (!Array.isArray(data.response) || (data.errors && Object.keys(data.errors).length)) {
      throw new GameError(502, 'FOOTBALL_API_ERROR', 'L’API Football a refusé l’historique. Vérifiez votre clé et votre quota.');
    }
    const career = careerFromTransfers(data.response, playerId);
    if (careerCache.size >= 200) careerCache.delete(careerCache.keys().next().value);
    careerCache.set(String(playerId), { career, expiresAt: Date.now() + 60 * 60 * 1000 });
    return career;
  }

  async function load() {
    if (!settings.apiKey) throw new GameError(502, 'API_NOT_CONFIGURED', 'Configurez la clé API Football ou activez le mode démo.');
    let base;
    try {
      base = new URL(settings.apiUrl);
      if (base.protocol !== 'https:' || base.username || base.password) throw new Error();
    } catch {
      throw new GameError(502, 'API_NOT_CONFIGURED', 'L’URL API Football doit être une URL HTTPS valide.');
    }
    const players = new Map();
    const deadline = AbortSignal.timeout(30000);
    let totalPages = 1;
    for (let page = 1; page <= totalPages; page++) {
      const url = new URL(`${base.toString().replace(/\/$/, '')}/players`);
      url.search = new URLSearchParams({ league: settings.league, season: settings.season, page: String(page) }).toString();
      let data;
      try {
        const response = await fetcher(url, {
          headers: { 'x-apisports-key': settings.apiKey },
          signal: AbortSignal.any([deadline, AbortSignal.timeout(10000)]), redirect: 'error',
        });
        if (!response.ok) throw new Error();
        data = await response.json();
      } catch {
        throw new GameError(502, 'FOOTBALL_API_UNAVAILABLE', 'L’API Football est indisponible. Réessayez ou activez le mode démo.');
      }
      if (!Array.isArray(data.response) || (data.errors && Object.keys(data.errors).length)) {
        throw new GameError(502, 'FOOTBALL_API_ERROR', 'L’API Football a refusé la demande. Vérifiez la clé, la saison et votre quota.');
      }
      const pages = Number(data.paging?.total || 1);
      if (!Number.isInteger(pages) || pages < 1) throw new GameError(502, 'FOOTBALL_API_ERROR', 'Réponse API Football invalide.');
      // Une sélection de 20 pages suffit à la V1 et borne les coûts du fournisseur.
      totalPages = Math.min(pages, 20);
      for (const entry of data.response) {
        const player = normalizePlayer(entry);
        if (player && !players.has(player.id)) players.set(player.id, player);
      }
    }
    if (players.size < 10) throw new GameError(502, 'EMPTY_CATALOG', 'La saison choisie ne fournit pas assez de footballeurs pour jouer.');
    cache = [...players.values()];
    expiresAt = Date.now() + 60 * 60 * 1000;
    return cache.map(player => ({ ...player }));
  }

  return {
    async fetchSyncPage({ league, season, page, signal }) {
      const data = await syncRequest('players', { league, season, page: String(page) }, signal);
      const totalPages = Number(data.paging?.total || 1);
      if (!Number.isInteger(totalPages) || totalPages < page) throw new GameError(502, 'FOOTBALL_API_ERROR', 'Pagination API invalide.');
      return { players: data.response.map(normalizePlayer).filter(Boolean), totalPages };
    },
    async fetchSyncClubs({ league, season, signal }) {
      const data = await syncRequest('teams', { league, season }, signal);
      return data.response.map(entry => entry.team).filter(team => team?.id != null && team.name)
        .map(team => ({ id: String(team.id), name: team.name, country: team.country || null,
          logo: /^https:\/\//.test(team.logo || '') ? team.logo : null }));
    },
    async fetchSyncCareer(playerId, { signal } = {}) {
      const data = await syncRequest('transfers', { player: String(playerId) }, signal);
      const career = careerFromTransfers(data.response, playerId, { includeClubs: true });
      // A missing external club ID cannot form a dependable relational career.
      return career.every(step => step.team.id != null) ? career.map(step => ({ ...step,
        team: { id: String(step.team.id), name: step.team.name,
          logo: /^https:\/\//.test(step.team.logo || '') ? step.team.logo : null },
      })) : [];
    },
    async getPlayers() {
      if (settings.useMockData || !settings.apiKey) return mockPlayers.map(player => ({ ...player }));
      if (cache && Date.now() < expiresAt) return cache.map(player => ({ ...player }));
      if (!pending) pending = load().finally(() => { pending = null; });
      return pending;
    },
    async getCareerCandidates() {
      if (mockMode) return mockCareers.map(({ career, ...player }) => ({ ...player }));
      const players = await this.getPlayers();
      return players.filter(player => !/\b\p{L}\./u.test(player.fullName)).map(player => ({
        id: player.id, name: player.fullName, photo: player.photo, source: 'api',
        dataNote: 'Historique des transferts fourni par l’API ; les périodes non renseignées ne sont pas inventées.',
      }));
    },
    async getPlayerCareer(playerId, { signal } = {}) {
      if (mockMode) return structuredClone(mockCareers.find(player => player.id === String(playerId))?.career || []);
      const id = String(playerId);
      const cached = careerCache.get(id);
      if (cached && Date.now() < cached.expiresAt) return structuredClone(cached.career);
      if (!careerPending.has(id)) careerPending.set(id, loadCareer(id, signal).finally(() => careerPending.delete(id)));
      return structuredClone(await careerPending.get(id));
    },
  };
}

export const footballApiService = createFootballApiService();
