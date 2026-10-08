import { Router } from 'express';
import { GameError } from '../services/gameError.js';

export function playerCatalogueRoutes(repository) {
  const router = Router();
  router.get('/', (req, res) => res.json(repository.getPlayers(req.query.position)));
  return router;
}

export function playerSyncRoutes(service, { production = false } = {}) {
  const router = Router();
  router.post('/sync-players', async (req, res) => {
    if (production) throw new GameError(403, 'ADMIN_CLI_ONLY', 'En production, lancez sync:players ou sync:careers depuis le serveur.');
    // This application runs on loopback without user accounts. Keep the admin action local.
    if (!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.ip)) {
      throw new GameError(403, 'LOCAL_ADMIN_ONLY', 'La synchronisation doit être lancée sur le serveur local.');
    }
    if (req.get('origin')) {
      let allowed = false;
      try { allowed = ['localhost','127.0.0.1','[::1]'].includes(new URL(req.get('origin')).hostname); } catch { /* Reject malformed origin. */ }
      if (!allowed) throw new GameError(403, 'LOCAL_ADMIN_ONLY', 'Origine de synchronisation refusée.');
    }
    res.json(await service.sync(req.body ?? {}));
  });
  return router;
}
