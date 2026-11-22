import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectFiles } from '../src/inspect.mjs';

test('findings cite exact source lines and never claim inference',()=>{
 const report=inspectFiles([{name:'example.js',text:'// TODO review\nconst x = eval(input);\n'}]);
 assert.equal(report.inferenceUsed,false);assert.equal(report.findings.length,2);
 assert.equal(report.findings[1].reference,'example.js:2');assert.equal(report.files[0].sha256.length,64);
 assert.equal('text' in report.files[0],false);
});
test('does not treat clean results as clearance',()=>{
 const report=inspectFiles([{name:'hello.py',text:'print(123)'}]);
 assert.equal(report.findings.length,0);assert.match(report.limitations.join(' '),/not a security clearance/);
});
for(const name of ['../bad.js','/root.js','.env','.env.local','private.pem'])test(`rejects ${name}`,()=>assert.throws(()=>inspectFiles([{name,text:'test'}])));
test('rejects likely secrets',()=>assert.throws(()=>inspectFiles([{name:'file.js',text:'const secret = "csk-'+ 'a'.repeat(32)+'"'}])));
test('rejects duplicate names and non-text',()=>{
 assert.throws(()=>inspectFiles([{name:'a',text:'a'},{name:'a',text:'b'}]));
 assert.throws(()=>inspectFiles([{name:'a',text:'a\0b'}]));
});
test('requires a bounded nonempty file set',()=>{
 assert.throws(()=>inspectFiles([]));assert.throws(()=>inspectFiles(Array(31).fill({name:'a',text:'a'})));
 assert.throws(()=>inspectFiles([{name:'a',text:'a'.repeat(750001)}]));
});

test('flags hardcoded credentials, weak hashes and non-cryptographic randomness',()=>{
 const report=inspectFiles([{name:'src/session.js',text:'const api_key = "demo-not-a-real-secret-1234";\nconst id = Math.random();\nconst digest = md5(value);\n'}]);
 assert.deepEqual(report.findings.map(f=>f.rule),['hardcoded-credential','insecure-random','weak-hash']);
 assert.equal(report.findings[0].severity,'high');
 assert.equal(report.findings[0].title,'Possible hardcoded credential');
});
test('does not flag environment lookups or strong hashing as credentials',()=>{
 const report=inspectFiles([{name:'src/config.js',text:'const key = process.env.API_KEY;\nconst digest = createHash("sha256").update(x);\n'}]);
 assert.equal(report.findings.length,0);
});
