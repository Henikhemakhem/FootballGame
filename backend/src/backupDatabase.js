import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config, backendRoot } from './config.js';
import { backupDatabase } from './models/databaseBackup.js';

try {
  if (process.argv.length > 3) throw new Error('Usage : npm run db:backup -- [chemin-de-sauvegarde.sqlite]');
  const filename = 'football-draft-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8) + '.sqlite';
  const destination = process.argv[2] || path.join(backendRoot, 'backups', filename);
  console.log(JSON.stringify(await backupDatabase(config.databasePath, destination), null, 2));
  console.log('Sauvegarde SQLite vérifiée, prête à être transférée sur le disque persistant.');
} catch (error) {
  console.error('BACKUP_FAILED', error.code === 'EEXIST' ? 'Le fichier existe déjà ; choisissez un nouveau chemin.' : error.message);
  process.exitCode = 1;
}
