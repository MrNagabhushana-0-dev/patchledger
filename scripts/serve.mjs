import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { configuration, reviewSelection } from '../src/openclaw-review.mjs';
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.woff2':'font/woff2' };
const port = Number(process.env.PORT) || 4317;
const root = fileURLToPath(new URL('../web/', import.meta.url));
export function makeServer(config = configuration(), reviewer = reviewSelection) {
 let running = false, lastRun = 0;
 return createServer(async (req,res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Cache-Control','no-store');
  const json = (code,data) => { res.writeHead(code, {'Content-Type':'application/json'}); res.end(JSON.stringify(data)); };
  if (!/^localhost(?::\d+)?$|^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host || '')) return json(403,{error:'Loopback host required.'});
  const path = new URL(req.url,'http://localhost').pathname;
  if (path.startsWith('/api/')) {
   if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json(403,{error:'Same-origin requests only.'});
   if (path === '/api/openclaw/status' && req.method === 'GET') return json(200,{enabled:config.enabled, harness:'OpenClaw', model:config.enabled ? config.model : null, message:config.enabled ? 'Configured. A successful review still requires live provider access.' : 'Not activated. Local checks remain available. Run the companion server with an approved model configuration.'});
   if (path !== '/api/openclaw/review' || req.method !== 'POST') return json(404,{error:'Not found.'});
   if (req.headers['content-type'] !== 'application/json' || req.headers['x-patchledger-review'] !== '1') return json(415,{error:'JSON review request required.'});
   if (!config.enabled) return json(503,{error:'OpenClaw is not activated. No source was sent to a model.'});
   if (running || Date.now()-lastRun < 10000) return json(429,{error:'One review at a time. Wait before another request.'});
   running = true;
   try {
    let raw='',bytes=0;
    for await (const chunk of req) { bytes+=chunk.length; if(bytes>24000) { json(413,{error:'Excerpt too large.'}); return; } raw+=chunk; }
    let body; try { body=JSON.parse(raw); } catch { return json(400,{error:'Invalid JSON.'}); }
    lastRun=Date.now(); const result=await reviewer(body,config); json(200,result);
   } catch(e) { json(422,{error:e.message}); } finally { running=false; }
   return;
  }
  let rel; try { rel=decodeURIComponent(path); } catch { return json(400,{error:'Invalid path.'}); }
  const file=resolve(root,'.'+(rel==='/'?'/index.html':rel));
  if (req.method!=='GET' || !file.startsWith(root.endsWith(sep)?root:root+sep) || !types[extname(file)]) { res.writeHead(404); res.end('Not found.'); return; }
  try { const data=await readFile(file); res.writeHead(200,{'Content-Type':types[extname(file)]+'; charset=utf-8'}); res.end(data); }
  catch { res.writeHead(404);res.end('Not found.'); }
 });
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) makeServer().listen(port,'127.0.0.1',()=>console.log('PatchLedger: http://127.0.0.1:'+port));
