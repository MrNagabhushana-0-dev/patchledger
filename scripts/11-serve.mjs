import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};
const port = Number(process.env.PORT) || 4317;

createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  const path = new URL(req.url, 'http://localhost').pathname;
  const rel = path === '/' ? 'index.html' : path.slice(1);
  const ext = rel.slice(rel.lastIndexOf('.'));
  if (req.method !== 'GET' || rel.includes('..') || !Object.hasOwn(types, ext)) { res.writeHead(404); res.end('Not found.'); return; }
  try {
    const body = await readFile(new URL('../web/' + rel, import.meta.url));
    res.writeHead(200, { 'Content-Type': types[ext] + '; charset=utf-8' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('Not found.');
  }
}).listen(port, '127.0.0.1', () => console.log('PatchLedger: http://127.0.0.1:' + port));
