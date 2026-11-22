
const rules = [
  {id:'dynamic-evaluation', severity:'review', pattern:/\b(?:eval|exec)\s*\(/, title:'Dynamic evaluation', reason:'Review whether untrusted input can reach this call. A text match alone does not prove a vulnerability.'},
  {id:'shell-execution', severity:'review', pattern:/\b(?:execSync|spawnSync|subprocess\.(?:run|Popen)|os\.system)\s*\(/, title:'Process execution', reason:'Check argument construction, shell mode, permissions and input provenance.'},
  {id:'raw-html', severity:'review', pattern:/dangerouslySetInnerHTML|\.innerHTML\s*=/, title:'Raw HTML sink', reason:'Check whether the value is trusted or correctly sanitized.'},
  {id:'disabled-tls', severity:'high', pattern:/rejectUnauthorized\s*:\s*false|verify\s*=\s*False/, title:'TLS verification may be disabled', reason:'Confirm the surrounding API and environment. Avoid disabled verification in production.'},
  {id:'development-marker', severity:'note', pattern:/\b(?:TODO|FIXME|HACK)\b/, title:'Unfinished-work marker', reason:'Decide whether this item blocks release.'},
];

export function inspectCore(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 30) throw new Error('Choose between 1 and 30 text files.');
  let bytes=0;
  const seen=new Set();
  const files=input.map((f,index)=>{
    if(typeof f?.name !== 'string' || typeof f?.text !== 'string') throw new Error('Each file needs a name and text.');
    const name=f.name.replaceAll('\\','/');
    if(!name || name.length>180 || name.startsWith('/') || name.split('/').includes('..') || /[\x00-\x1f]/.test(name)) throw new Error('Unsafe file name.');
    if(seen.has(name)) throw new Error('Duplicate file names are not accepted.');
    seen.add(name);
    if(/(^|\/)(\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx))$/i.test(name)) throw new Error('Do not upload credential or environment files.');
    bytes+=new TextEncoder().encode(f.text).byteLength;
    if(bytes>750000 || f.text.includes('\0')) throw new Error('Use text files only, up to 750 KB total.');
    // Refuse likely credentials before returning any source text to a report.
    if(/(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bcsk-[A-Za-z0-9]{18,}|\bsk-(?:proj-)?[A-Za-z0-9_-]{24,})/.test(f.text)) throw new Error('A likely credential was detected. Remove secrets before uploading.');
    const lines=f.text.split(/\r?\n/);
    const findings=[];
    for(let line=0;line<lines.length;line++) {
      for(const rule of rules) if(rule.pattern.test(lines[line])) findings.push({id:`F${index+1}-L${line+1}-${rule.id}`,rule:rule.id,line:line+1,severity:rule.severity,title:rule.title,reason:rule.reason,reference:`${name}:${line+1}`});
      if(findings.length>150) break;
    }
    return {name,bytes:new TextEncoder().encode(f.text).byteLength,lines:lines.length,findings,findingsLimited:findings.length>150};
  });
  return {kind:'local-source-inspection',inferenceUsed:false,files,totalBytes:bytes,totalLines:files.reduce((n,f)=>n+f.lines,0),findings:files.flatMap(f=>f.findings),limitations:['Pattern matches are review candidates, not proven vulnerabilities.','No code was executed. No AI review was run.','Absence of findings is not a security clearance.']};
}
