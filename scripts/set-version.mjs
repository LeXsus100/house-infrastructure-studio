import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
  throw new Error('Usage: npm run version:set -- 1.2.3');
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['package.json', 'package-lock.json']) {
  const path = join(root, name);
  const value = JSON.parse(await readFile(path, 'utf8'));
  value.version = version;
  if (name === 'package-lock.json' && value.packages?.['']) value.packages[''].version = version;
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const tauriPath = join(root, 'src-tauri', 'tauri.conf.json');
const tauriConfig = JSON.parse(await readFile(tauriPath, 'utf8'));
tauriConfig.version = version;
await writeFile(tauriPath, `${JSON.stringify(tauriConfig, null, 2)}\n`, 'utf8');

const cargoPath = join(root, 'src-tauri', 'Cargo.toml');
const cargo = await readFile(cargoPath, 'utf8');
await writeFile(cargoPath, cargo.replace(/^(version\s*=\s*")[^"]+("\s*)$/m, `$1${version}$2`), 'utf8');

console.log(`Set web and desktop application versions to ${version}.`);
