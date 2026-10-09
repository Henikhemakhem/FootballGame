import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareCatalogue } from './refreshCatalogue.mjs';

try {
  await prepareCatalogue();
  const frontend = fileURLToPath(new URL('../frontend/', import.meta.url));
  const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
  const result = spawnSync(process.execPath, [vite, 'build'], { cwd: frontend, stdio: 'inherit' });
  if (result.error || result.status !== 0) process.exitCode = result.status || 1;
  else console.log('Build Netlify prêt : application entièrement statique, sans backend.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
