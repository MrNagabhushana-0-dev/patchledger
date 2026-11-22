import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const types={'/':'text/html','/index.html':'text/html','/app.js':'text/javascript','/style.css':'text/css','/inspect-core.mjs':'text/javascript','/inspect-browser.mjs':'text/javascript','/ledger.mjs':'text/javascript','/favicon.svg':'image/svg+xml'};
const port=Number(process.env.PORT)||4317;
createServer(async(req,res)=>{
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
 const path=new URL(req.url,'http://localhost').pathname;
 if(req.method!=='GET'||!Object.hasOwn(types,path)){res.writeHead(404);res.end('Not found.');return;}
 try{const body=await readFile(new URL('../web/'+(path==='/'?'index.html':path.slice(1)),import.meta.url));res.writeHead(200,{'Content-Type':types[path]+'; charset=utf-8'});res.end(body);}catch{res.writeHead(500);res.end('Could not read the workbench assets.');}
}).listen(port,'127.0.0.1',()=>console.log('PatchLedger: http://127.0.0.1:'+port));
