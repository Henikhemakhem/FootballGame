import express from 'express';
import { config } from './config.js';
import { openDatabase } from './models/database.js';
import { GameRepository } from './models/gameRepository.js';
import { GameService } from './services/gameService.js';
import { gameRoutes } from './routes/gameRoutes.js';
import { PlayerCareerRepository } from './models/playerCareerRepository.js';
import { PlayerCareerGameService } from './services/playerCareerGameService.js';
import { playerCareerRoutes } from './routes/playerCareerRoutes.js';
import { PlayerCatalogueRepository } from './models/playerCatalogueRepository.js';
import { PlayerSyncService } from './services/playerSyncService.js';
import { playerCatalogueRoutes, playerSyncRoutes } from './routes/playerCatalogueRoutes.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function createApp({ database, service, careerService, syncService, settings = config } = {}) {
  const app = express();
  const db = database || openDatabase(settings.databasePath);
  const games = service || new GameService(new GameRepository(db));
  const careers = careerService || new PlayerCareerGameService(new PlayerCareerRepository(db));
  const catalogue = new PlayerCatalogueRepository(db);
  app.locals.database = db;
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8kb' }));
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', rulesVersion: 2, dataMode: 'sqlite', catalogue: catalogue.counts() }));
  app.use('/api/players', playerCatalogueRoutes(catalogue));
  app.use('/api/admin', playerSyncRoutes(syncService || new PlayerSyncService(catalogue), { production: settings.production }));
  app.use('/api/games', gameRoutes(games));
  app.use('/api/player-career', playerCareerRoutes(careers));
  app.use('/api', (_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route introuvable.' } }));
  const frontendDist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
  if (existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('/', (_req, res) => res.sendFile('index.html', { root: frontendDist }));
  }
  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route introuvable.' } }));
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Le corps de la demande doit être un JSON valide.' } });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'La demande est trop volumineuse.' } });
    }
    const status = error.status || 500;
    if (status >= 500) console.error('Erreur serveur :', error.code || error.name);
    res.status(status).json({ error: { code: error.code || 'SERVER_ERROR',
      message: status >= 500 && status !== 502 ? 'Le serveur ne peut pas traiter cette demande.' : error.message } });
  });
  return app;
}
