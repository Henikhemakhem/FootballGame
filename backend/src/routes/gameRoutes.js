import { Router } from 'express';
import { gameController } from '../controllers/gameController.js';

export function gameRoutes(service) {
  const router = Router();
  const controller = gameController(service);
  router.post('/', controller.create);
  router.get('/:id', controller.get);
  router.get('/:id/auction', controller.auction);
  router.get('/:id/team/:player', controller.team);
  router.post('/:id/bid', controller.bid);
  router.post('/:id/pass', controller.pass);
  return router;
}
