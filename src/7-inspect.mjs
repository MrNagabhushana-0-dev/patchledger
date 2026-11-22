import { createHash } from 'node:crypto';
import { inspectCore } from '../web/inspect-core.mjs';
export function inspectFiles(input){
 const report=inspectCore(input);
 report.files.forEach((file,i)=>{file.sha256=createHash('sha256').update(input[i].text).digest('hex');});
 return report;
}
