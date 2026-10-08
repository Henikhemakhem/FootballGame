import { Router } from 'express';
import { playerCareerController } from '../controllers/playerCareerController.js';

export function playerCareerRoutes(service) {
  const router = Router();
  const controller = playerCareerController(service);
  router.post('/start', controller.start);
  router.get('/:gameId', controller.get);
  router.post('/:gameId/answer', controller.answer);
  return router;
}
