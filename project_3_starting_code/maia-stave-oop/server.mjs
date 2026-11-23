// Local-only static preview. No credentials, build process, or administrator privileges.
import http from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const parts = pathname.split('/').filter(Boolean);
    const allowedRoots = new Set(['src', 'vendor', 'examples']);
    if (parts.some(p => p.startsWith('.')) ||
        (parts.length > 1 ? !allowedRoots.has(parts[0]) : !['index.html', 'style.css', undefined].includes(parts[0]))) {
      res.writeHead(404).end(); return;
    }
    let filename = path.resolve(root, '.' + pathname);
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
    filename = await realpath(filename);
    if (!filename.startsWith(root)) { res.writeHead(403).end(); return; }
    const contents = await readFile(filename);
    res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : contents);
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(Number(process.env.PORT || 8080), '127.0.0.1', () => console.log(`maia-stave-oop: http://127.0.0.1:${server.address().port}`));
