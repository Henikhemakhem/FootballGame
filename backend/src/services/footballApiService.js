import { config } from '../config.js';
import { createFootballApiService } from './footballApiClient.js';
export { createFootballApiService, normalizePlayer } from './footballApiClient.js';
export const footballApiService = createFootballApiService(config);
