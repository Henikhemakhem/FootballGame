import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { config } from '../config.js';
import { footballApiService } from './footballApiService.js';
import { suitableCareer } from './careerService.js';
import { GameError } from './gameError.js';

export class PlayerSyncService {
  constructor(repository, { football = footballApiService, settings = config, wait = delay } = {}) {
    this.repository = repository;
    this.football = football;
    this.settings = settings;
    this.wait = wait;
  }

  options(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new GameError(400, 'INVALID_SYNC_OPTIONS', 'Options de synchronisation invalides.');
    if (Object.keys(input).some(key => !['league','season','maxPages','careerLimit','maxRequests','careersOnly'].includes(key))) {
      throw new GameError(400, 'INVALID_SYNC_OPTIONS', 'Option inconnue. Utilisez league, season, maxPages, careerLimit, maxRequests ou careersOnly.');
    }
    if (input.careersOnly != null && typeof input.careersOnly !== 'boolean') throw new GameError(400, 'INVALID_SYNC_OPTIONS', 'careersOnly doit être un booléen.');
    const bounded = (value, fallback, min, max) => {
      const result = value == null ? Number(fallback) : Number(value);
      if (!Number.isInteger(result) || result < min || result > max) throw new GameError(400, 'INVALID_SYNC_OPTIONS', 'Une option de synchronisation dépasse les limites autorisées.');
      return result;
    };
    return { league: bounded(input.league, this.settings.league, 1, 10000), season: bounded(input.season, this.settings.season, 2000, 2100),
      maxPages: bounded(input.maxPages, this.settings.syncMaxPages || 30, 1, 200),
      careerLimit: bounded(input.careerLimit, this.settings.syncCareerLimit ?? 50, 0, 1000),
      maxRequests: bounded(input.maxRequests, this.settings.syncMaxRequests || 90, 1, 2000), careersOnly: input.careersOnly === true };
  }

  async sync(input = {}) {
    const options = this.options(input);
    const requestDelay = Number(this.settings.syncRequestDelayMs ?? 6500);
    if (!Number.isInteger(requestDelay) || requestDelay < 0 || requestDelay > 60000) throw new GameError(400, 'INVALID_SYNC_OPTIONS', 'FOOTBALL_SYNC_REQUEST_DELAY_MS doit être compris entre 0 et 60000.');
    const db = this.repository.db;
    const owner = randomUUID();
    const locked = db.prepare('UPDATE PlayerSyncLock SET owner=?, expiresAt=? WHERE id=1 AND expiresAt<=?')
      .run(owner, Date.now() + 15 * 60 * 1000, Date.now());
    if (!locked.changes) throw new GameError(409, 'SYNC_IN_PROGRESS', 'Une synchronisation est déjà en cours.');
    const summary = { success: true, complete: true, playersFetched: 0, playersAdded: 0, playersUpdated: 0,
      clubsAdded: 0, careersAdded: 0, careersUpdated: 0, careersFetched: 0, careersSkipped: 0,
      requests: 0, warnings: [], league: options.league, season: options.season, mode: options.careersOnly ? 'careers' : 'players' };
    const signal = AbortSignal.timeout(10 * 60 * 1000);
    const request = async action => {
      if (signal.aborted) throw new GameError(502, 'SYNC_TIMEOUT', 'Délai global de synchronisation dépassé.');
      if (summary.requests >= options.maxRequests) throw new GameError(502, 'SYNC_REQUEST_BUDGET', 'Budget de requêtes atteint. Relancez pour compléter les parcours.');
      // Sequential requests, with no burst and no automatic retry on provider limits.
      if (summary.requests) {
        try { await this.wait(requestDelay, undefined, { signal }); }
        catch { throw new GameError(502, 'SYNC_TIMEOUT', 'Délai global de synchronisation dépassé.'); }
      }
      summary.requests++;
      return action();
    };
    const warn = error => {
      summary.complete = false;
      const code = error instanceof GameError ? error.code : 'SYNC_API_ERROR';
      if (!summary.warnings.includes(code)) summary.warnings.push(code);
    };
    const mustStop = error => ['FOOTBALL_API_RATE_LIMIT','FOOTBALL_API_PLAN_LIMIT','SYNC_REQUEST_BUDGET','SYNC_TIMEOUT','API_NOT_CONFIGURED'].includes(error.code) || signal.aborted;
    try {
      const imported = new Map();
      if (options.careersOnly) {
        for (const player of db.prepare("SELECT id,apiPlayerId FROM Player WHERE source='api' ORDER BY id").all()) {
          imported.set(player.apiPlayerId, { player: { id: player.apiPlayerId }, saved: { id: player.id } });
        }
        if (!imported.size) throw new GameError(502, 'NO_API_PLAYERS', 'Importez d’abord les joueurs API avec npm run sync:players.');
      }
      let totalPages = 1;
      for (let page = 1; !options.careersOnly && page <= Math.min(totalPages, options.maxPages); page++) {
        let result;
        try { result = await request(() => this.football.fetchSyncPage({ ...options, page, signal })); }
        catch (error) { if (!imported.size) throw error; warn(error); break; }
        totalPages = result.totalPages;
        for (const player of result.players) {
          if (imported.has(String(player.id))) continue;
          const saved = this.repository.transaction(() => {
            const club = this.repository.upsertClub(player.club);
            const savedPlayer = this.repository.upsertPlayer(player, club?.id);
            return { ...savedPlayer, clubAdded: Boolean(club?.added) };
          });
          summary.playersFetched++;
          summary[saved.added ? 'playersAdded' : 'playersUpdated']++;
          if (saved.clubAdded) summary.clubsAdded++;
          imported.set(String(player.id), { player, saved });
        }
      }
      if (!imported.size) throw new GameError(502, 'EMPTY_CATALOG', 'La réponse API ne contient aucun joueur exploitable. Les données locales sont conservées.');
      if (!summary.warnings.includes('FOOTBALL_API_PAGE_LIMIT') && totalPages > options.maxPages) warn(new GameError(502, 'SYNC_PAGE_LIMIT', 'Limite de pages atteinte.'));
      // A quota/transport failure during pagination must not cause more API requests.
      const paginationFailed = summary.warnings.some(code => !['SYNC_PAGE_LIMIT','FOOTBALL_API_PAGE_LIMIT'].includes(code));
      if (!paginationFailed) {
        let stop = false;
        if (!options.careersOnly) {
          try {
            const clubs = await request(() => this.football.fetchSyncClubs({ ...options, signal }));
            if (!clubs.length) warn(new GameError(502, 'EMPTY_CLUBS', 'Clubs non renseignés par le fournisseur.'));
            for (const club of clubs) {
              const saved = this.repository.transaction(() => this.repository.upsertClub(club));
              if (saved?.added) summary.clubsAdded++;
            }
          } catch (error) { warn(error); stop = mustStop(error); }
        }
        // Prioritize careers never checked, then the oldest checks (including empty histories).
        const candidates = [...imported.values()].map(item => ({ ...item,
          lastSync: db.prepare('SELECT careerSyncedAt FROM Player WHERE id=?').get(item.saved.id).careerSyncedAt || '',
        })).sort((a, b) => a.lastSync.localeCompare(b.lastSync));
        for (const { player, saved } of candidates.slice(0, options.careerLimit)) {
          if (stop) break;
          let career;
          try { career = await request(() => this.football.fetchSyncCareer(player.id, { signal })); }
          catch (error) { warn(error); stop = mustStop(error); continue; }
          summary.careersFetched++;
          db.prepare('UPDATE Player SET careerSyncedAt=? WHERE id=?').run(new Date().toISOString(), saved.id);
          if (!career.length || career.some(step => step.team?.id == null || !step.team.name)) {
            summary.careersSkipped++;
            continue;
          }
          const playable = suitableCareer(career);
          if (!playable) summary.careersSkipped++;
          const counts = this.repository.transaction(() => {
            // Archive superseded stints, without deleting data. Publish the valid snapshot atomically.
            const existingPlayable = suitableCareer(this.repository.getPlayerCareer('local-' + saved.id));
            const publish = playable || !existingPlayable;
            if (publish) db.prepare('UPDATE PlayerCareer SET active=0 WHERE playerId=?').run(saved.id);
            const counts = { clubsAdded: 0, careersAdded: 0, careersUpdated: 0 };
            for (const step of career) {
              const club = this.repository.upsertClub(step.team);
              if (club.added) counts.clubsAdded++;
              const added = this.repository.upsertCareer(saved.id, club.id, step, 'api', publish);
              counts[added ? 'careersAdded' : 'careersUpdated']++;
            }
            return counts;
          });
          for (const key of Object.keys(counts)) summary[key] += counts[key];
        }
        if (candidates.length > options.careerLimit) warn(new GameError(502, 'SYNC_CAREER_LIMIT', 'Limite de parcours atteinte.'));
      }
      summary.localCounts = this.repository.counts();
      summary.playableApiCareers = this.repository.getCareerCandidates().filter(player => player.careerSource === 'api').length;
      return summary;
    } finally {
      db.prepare('UPDATE PlayerSyncLock SET owner=NULL, expiresAt=0 WHERE id=1 AND owner=?').run(owner);
    }
  }
}
