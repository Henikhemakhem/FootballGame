import { PlayerCareerGameService as CareerEngine } from '../../../frontend/src/games/playerCareerGameService.js';
import { PlayerCatalogueRepository } from '../models/playerCatalogueRepository.js';
export { DIFFICULTIES, normalizeAnswer } from '../../../frontend/src/games/playerCareerGameService.js';
export class PlayerCareerGameService extends CareerEngine {
  constructor(repository, options = {}) {
    super(repository, { football: new PlayerCatalogueRepository(repository.db), ...options });
  }
}
