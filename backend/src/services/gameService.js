import { GameService as GameEngine } from '../../../frontend/src/games/gameService.js';
import { PlayerCatalogueRepository } from '../models/playerCatalogueRepository.js';
export { ROUND_POSITIONS, POSITION_LIMITS, TEAM_SIZE, organizeTeam } from '../../../frontend/src/games/gameService.js';
export class GameService extends GameEngine {
  constructor(repository, options = {}) {
    super(repository, { loadPlayers: () => new PlayerCatalogueRepository(repository.db).getPlayers(), ...options });
  }
}
