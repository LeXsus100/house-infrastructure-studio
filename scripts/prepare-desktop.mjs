import { build } from 'esbuild';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1))), '..');
const tauriRoot = join(projectRoot, 'src-tauri');
const binariesDir = join(tauriRoot, 'binaries');
const serverDir = join(tauriRoot, 'resources', 'server');
const licensesDir = join(tauriRoot, 'resources', 'licenses');

if (process.platform !== 'win32') throw new Error('The current desktop packaging profile builds the Windows NSIS installer only.');
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Desktop packaging requires Node.js 24 or newer for the built-in SQLite runtime.');

const targetTriple = execFileSync('rustc', ['--print', 'host-tuple'], { encoding: 'utf8' }).trim();
if (!targetTriple.endsWith('windows-msvc')) throw new Error(`The Windows MSVC Rust toolchain is required; found ${targetTriple}.`);

await mkdir(binariesDir, { recursive: true });
await mkdir(serverDir, { recursive: true });
await mkdir(licensesDir, { recursive: true });

await build({
  entryPoints: [join(projectRoot, 'server', 'desktop.ts')],
  outfile: join(serverDir, 'desktop.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: false,
  minify: false,
  banner: {
    js: `/* Bundled local API for the House Infrastructure Studio desktop app. */
import { createRequire as __houseStudioCreateRequire } from 'node:module';
const require = __houseStudioCreateRequire(import.meta.url);`
  }
});

const sidecarPath = join(binariesDir, `house-studio-node-${targetTriple}.exe`);
await copyFile(process.execPath, sidecarPath);

const nodeLicenseUrl = `https://raw.githubusercontent.com/nodejs/node/v${process.versions.node}/LICENSE`;
const licenseResponse = await fetch(nodeLicenseUrl);
if (!licenseResponse.ok) throw new Error(`Could not retrieve the Node.js runtime license (${licenseResponse.status}).`);
await writeFile(join(licensesDir, 'node-LICENSE'), await licenseResponse.text(), 'utf8');

console.log(`Prepared desktop API and Node.js ${process.versions.node} sidecar for ${targetTriple}.`);
