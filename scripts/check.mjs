import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const directories = ['src', 'tests', 'examples', 'scripts'];
for (const directory of directories) for (const file of await readdir(new URL(`../${directory}/`, import.meta.url))) {
  if (!/\.m?js$/.test(file)) continue;
  const path = new URL(`../${directory}/${file}`, import.meta.url);
  const check = spawnSync(process.execPath, ['--check', path.pathname], { stdio: 'inherit' });
  if (check.status !== 0) process.exit(check.status || 1);
}
for (const file of await readdir(new URL('../src/', import.meta.url))) {
  const content = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
  if (/console\.|process\.env|api\.day\.app\/\$|api\.day\.app\/mcp/.test(content)) throw new Error('Unsafe source pattern.');
}
console.log('Syntax and source-safety checks passed.');
