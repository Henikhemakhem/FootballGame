import { backup, DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';

export async function backupDatabase(source, destination) {
  const sourcePath = path.resolve(source);
  const targetPath = path.resolve(destination);
  if (!existsSync(sourcePath)) throw new Error('La base source est introuvable.');
  if (sourcePath.toLowerCase() === targetPath.toLowerCase()) throw new Error('La sauvegarde doit avoir un chemin différent de la base source.');
  mkdirSync(path.dirname(targetPath), { recursive: true });
  // Reserve exclusively: never overwrite an existing backup or the live database.
  closeSync(openSync(targetPath, 'wx', 0o600));
  const sourceDb = new DatabaseSync(sourcePath, { readOnly: true, timeout: 5000 });
  let targetDb;
  try {
    await backup(sourceDb, targetPath);
    targetDb = new DatabaseSync(targetPath);
    const tables = new Set(targetDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    // A lock lease belongs to the source process, never to the restored server.
    if (tables.has('PlayerSyncLock')) targetDb.exec('UPDATE PlayerSyncLock SET owner=NULL, expiresAt=0 WHERE id=1');
    if (targetDb.prepare('PRAGMA quick_check').get().quick_check !== 'ok' || targetDb.prepare('PRAGMA foreign_key_check').all().length) {
      throw new Error('La vérification de la sauvegarde a échoué. Ne transférez pas ce fichier.');
    }
    targetDb.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;');
    const counts = Object.fromEntries(['Player','Club','PlayerCareer','Game','PlayerCareerGame'].filter(table => tables.has(table))
      .map(table => [table, targetDb.prepare('SELECT COUNT(*) AS count FROM ' + table).get().count]));
    return { filename: targetPath, counts };
  } finally { targetDb?.close(); sourceDb.close(); }
}
