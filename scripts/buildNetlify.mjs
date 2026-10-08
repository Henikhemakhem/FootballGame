import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { netlifyRedirects } from './netlifyConfig.mjs';

try {
  // Validate before building, so a missing backend never produces a broken deployment.
  const redirects = netlifyRedirects(process.env.BACKEND_URL);
  const frontend = fileURLToPath(new URL('../frontend/', import.meta.url));
  const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
  const result = spawnSync(process.execPath, [vite, 'build'], { cwd: frontend, stdio: 'inherit' });
  if (result.error || result.status !== 0) process.exitCode = result.status || 1;
  else {
    writeFileSync(new URL('../frontend/dist/_redirects', import.meta.url), redirects, 'utf8');
    console.log('Build Netlify prêt : interface et proxy /api configurés.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
