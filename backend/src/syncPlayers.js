import { config } from './config.js';
import { openDatabase } from './models/database.js';
import { PlayerCatalogueRepository } from './models/playerCatalogueRepository.js';
import { PlayerSyncService } from './services/playerSyncService.js';

let db;
try {
  const input = {};
  const flags = { '--league':'league', '--season':'season', '--max-pages':'maxPages', '--career-limit':'careerLimit', '--max-requests':'maxRequests' };
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('npm run sync:players -- [--careers-only] [--league 39] [--season 2024] [--max-pages 30] [--career-limit 50] [--max-requests 90]');
  } else {
    for (let i = 0; i < args.length;) {
      if (args[i] === '--careers-only') { input.careersOnly = true; i++; continue; }
      if (!flags[args[i]] || args[i+1] == null || !/^\d+$/.test(args[i+1])) throw new Error('Arguments invalides. Consultez --help.');
      input[flags[args[i]]] = Number(args[i+1]);
      i += 2;
    }
    db = openDatabase(config.databasePath);
    console.log('Starting synchronization...');
    const summary = await new PlayerSyncService(new PlayerCatalogueRepository(db)).sync(input);
    console.log(JSON.stringify(summary, null, 2));
    console.log(summary.complete ? 'Synchronization completed.' : 'Synchronization partially completed; local data preserved. See warnings.');
  }
} catch (error) {
  console.error(error.code || 'SYNC_FAILED', error.code ? error.message : 'Arguments invalides ou erreur locale. Les données sont conservées.');
  process.exitCode = 1;
} finally { db?.close(); }
