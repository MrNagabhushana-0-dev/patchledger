import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReview, parseReview, reviewSelection, configuration } from '../src/openclaw-review.mjs';
import { makeServer } from '../scripts/serve.mjs';
const selection={file:'src/preview.js',question:'Check this HTML sink',lines:[{number:3,text:'container.innerHTML = userHtml;'}]};
test('validates bounded selection and rejects credentials',()=>{
 assert.deepEqual(validateReview(selection),selection);
 assert.throws(()=>validateReview({...selection,lines:Array(41).fill(selection.lines[0])}));
 assert.throws(()=>validateReview({...selection,lines:[{number:1,text:'const api_key = "example-credential-value"'}]}));
 assert.throws(()=>validateReview({...selection,lines:[{number:1,text:'x'},{number:1,text:'y'}]}));
 assert.throws(()=>validateReview({...selection,file:'a\nb'}));
});
test('rejects hallucinated citations and malformed model responses',()=>{
 assert.throws(()=>parseReview('{"summary":"test","observations":[{"line":99,"concern":"x","suggestion":"y"}],"limitations":"test"}',selection));
 assert.throws(()=>parseReview('all good',selection));
});
test('disabled is disabled, with no provider fallback',async()=>{
 assert.equal(configuration({}).enabled,false);
 await assert.rejects(reviewSelection(selection,{enabled:false}));
});
test('bridge uses real CLI contract, scoped cwd, no shell and no tools; test runner is explicit',async()=>{
 let workspace;
 const result=await reviewSelection(selection,{enabled:true,command:'openclaw',config:'/private/operator-config.json',model:'cerebras/test'},async(command,args,input,cwd)=>{
  workspace=cwd;assert.equal(command,'openclaw');assert.deepEqual(args.slice(0,2),['agent','exec']);assert.ok(args.includes('--config'));assert.ok(args.includes('--json'));assert.ok(input.includes('untrusted source'));assert.ok(input.includes('container.innerHTML'));assert.ok(args.includes(cwd));
  const policy=JSON.parse(args[args.indexOf('--config-override')+1]);assert.deepEqual(policy.tools.deny,['*']);
  return {ok:true,status:'ok',final:JSON.stringify({summary:'Test double only',observations:[{line:3,concern:'Test',suggestion:'Test'}],limitations:'Fixture, no model was run'}),model:'test-model',provider:'test'};
 });
 assert.equal(result.provenance.harness,'OpenClaw');assert.equal(result.review.observations[0].line,3);
 const {stat}=await import('node:fs/promises');await assert.rejects(stat(workspace));
});
async function withServer(config,reviewer,fn){const server=makeServer(config,reviewer);await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await fn('http://127.0.0.1:'+server.address().port);}finally{await new Promise(r=>server.close(r));}}
test('HTTP denies cross origin, unknown hosts, non-JSON and traversal; static local mode works',()=>withServer({enabled:false},null,async base=>{
 assert.equal((await fetch(base+'/')).status,200);
 assert.equal((await fetch(base+'/api/openclaw/status')).status,200);
 assert.equal((await fetch(base+'/api/openclaw/status',{headers:{Origin:'https://evil.invalid'}})).status,403);
 const {request}=await import('node:http');
 const denied=await new Promise((resolve,reject)=>{const req=request(base+'/api/openclaw/status',{headers:{Host:'evil.invalid'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});assert.equal(denied,403);
 assert.equal((await fetch(base+'/api/openclaw/review',{method:'POST',headers:{'Content-Type':'application/json','X-PatchLedger-Review':'1'},body:JSON.stringify(selection)})).status,503);
 assert.equal((await fetch(base+'/api/openclaw/review',{method:'POST'})).status,415);
 assert.equal((await fetch(base+'/%2e%2e%2fsrc/openclaw-review.mjs')).status,404);
}));
test('HTTP explicit successful fixture integration and rate limit',()=>withServer({enabled:true,model:'fixture'},async()=>({review:{summary:'Fixture only'}}),async base=>{
 const send=()=>fetch(base+'/api/openclaw/review',{method:'POST',headers:{'Content-Type':'application/json','X-PatchLedger-Review':'1'},body:JSON.stringify(selection)});
 assert.equal((await send()).status,200);assert.equal((await send()).status,429);
}));
