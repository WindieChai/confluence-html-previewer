import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

await mkdir(dist, { recursive: true });

await esbuild.build({
  entryPoints: [join(root, 'src/init.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2018'],
  minify: true,
  sourcemap: false,
  logLevel: 'info',
  outfile: join(dist, 'html-previewer.init.js'),
});

await copyFile(join(root, 'src/icon.png'), join(dist, 'html-previewer.icon.png'));

console.log('Built dist/html-previewer.init.js');
console.log('Copied dist/html-previewer.icon.png');
