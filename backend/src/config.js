import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const backendRoot = fileURLToPath(new URL('../', import.meta.url));
const production = process.env.NODE_ENV === 'production';
if (!production) dotenv.config({ path: path.join(backendRoot, '.env'), quiet: true });
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT doit être un entier entre 0 et 65535.');
const databasePath = process.env.DATABASE_PATH?.trim();
if (production && (!databasePath || !path.isAbsolute(databasePath))) {
  throw new Error('En production, DATABASE_PATH doit être un chemin absolu sur le disque persistant.');
}
export const config = {
  production,
  port,
  host: process.env.HOST?.trim() || (production ? '0.0.0.0' : '127.0.0.1'),
  databasePath: path.resolve(backendRoot, databasePath || './data/football-draft.sqlite'),
  useMockData: process.env.USE_MOCK_DATA !== 'false',
  apiKey: (process.env.FOOTBALL_API_KEY || '').trim(),
  apiUrl: process.env.FOOTBALL_API_URL || 'https://v3.football.api-sports.io',
  league: process.env.FOOTBALL_API_LEAGUE || '39',
  season: process.env.FOOTBALL_API_SEASON || '2024',
  syncMaxPages: Number(process.env.FOOTBALL_SYNC_MAX_PAGES || 30),
  syncCareerLimit: Number(process.env.FOOTBALL_SYNC_CAREER_LIMIT || 50),
  syncMaxRequests: Number(process.env.FOOTBALL_SYNC_MAX_REQUESTS || 90),
  syncRequestDelayMs: Number(process.env.FOOTBALL_SYNC_REQUEST_DELAY_MS || 6500),
};
