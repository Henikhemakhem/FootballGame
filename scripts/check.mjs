import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function check(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) check(file);
    else if (/\.(js|mjs)$/.test(file)) {
      const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status || 1);
    }
  }
}
check('backend/src');
check('scripts');
console.log('Syntaxe JavaScript vérifiée.');
