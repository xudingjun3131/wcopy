// Tauri beforeDevCommand: assemble the frontend into ./dist (so ../assets works),
// then serve it on :1432 with zero npm dependencies.
import http from 'node:http';
import { readFile, cpSync, mkdirSync, rmSync } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { dirname, fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');

// Rebuild the frontend dir (mirrors beforeBuildCommand) so ../assets resolves in dev.
await rmSync(dist, { recursive: true, force: true }).catch(() => {});
await mkdirSync(dist, { recursive: true });
await cpSync(join(root, 'src'), dist, { recursive: true });
await cpSync(join(root, 'assets'), join(dist, 'assets'), { recursive: true });

const PORT = 1432;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p === '/') p = '/index.html';
    const fp = normalize(join(dist, p));
    if (fp !== dist && !fp.startsWith(dist + sep)) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    const data = await readFile(fp);
    res.writeHead(200, { 'content-type': TYPES[extname(fp)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(PORT, () => console.log(`wcopy dev server → http://localhost:${PORT}`));
