import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(process.env.MOO_SERVE_ROOT || '.');
createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!path.startsWith(root + sep)) throw new Error('outside root');
    const bytes = await readFile(path);
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html' })[extname(path)] || 'application/octet-stream');
    res.end(bytes);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(4177, '127.0.0.1');
