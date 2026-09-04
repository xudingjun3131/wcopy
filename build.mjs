// Tauri beforeBuildCommand: assemble the frontend dist (src + assets) into ./dist,
// which is what tauri.conf.json's frontendDist points to.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'src'), dist, { recursive: true });
cpSync(join(root, 'assets'), join(dist, 'assets'), { recursive: true });
console.log('frontend built -> dist');
