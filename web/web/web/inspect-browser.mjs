import { inspectCore } from './inspect-core.mjs';
export async function inspectFiles(input){
 if(!globalThis.crypto?.subtle)throw new Error('Secure browser hashing is unavailable. Open this page over HTTPS or localhost.');
 const report=inspectCore(input);
 await Promise.all(report.files.map(async(file,i)=>{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input[i].text));
  file.sha256=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 }));
 return report;
}
