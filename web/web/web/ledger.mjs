export const ASSESSMENTS = {'unreviewed':'Not reviewed','needs-fix':'Needs a fix','not-an-issue':'Not an issue','needs-context':'Need more context'};
export const EMPTY_ASSESSMENT = Object.freeze({status:'unreviewed',note:''});
export function makeExport(report,assessments){
 const annotate=f=>({...f,localAssessment:{...(assessments.get(f.id)||EMPTY_ASSESSMENT)}});
 return {...report,formatVersion:2,files:report.files.map(f=>({...f,findings:f.findings.map(annotate)})),findings:report.findings.map(annotate),assessmentNote:'Human assessments entered locally, not AI output or independently verified claims. Source text is excluded.'};
}
export function restoreAssessments(current,saved){
 if(saved?.kind!=='local-source-inspection'||saved.inferenceUsed!==false||!Array.isArray(saved.files))throw Error('This is not a matching PatchLedger local-review export.');
 if(saved.files.length!==current.files.length)throw Error('Source does not match this export. Restore only against the same files and SHA-256 hashes.');
 const result=new Map(),seen=new Set();
 for(const old of saved.files){
  const file=current.files.find(f=>f.name===old.name);
  if(!file||file.sha256!==old.sha256||seen.has(old.name)||!Array.isArray(old.findings)||old.findings.length!==file.findings.length)throw Error('Source does not match this export. Restore only against the same files and SHA-256 hashes.');
  seen.add(old.name);
  for(const f of old.findings){
   const target=file.findings.find(n=>n.line===f.line&&n.rule===f.rule);
   const a=f.localAssessment||EMPTY_ASSESSMENT;
   if(!target||result.has(target.id)||!Object.hasOwn(ASSESSMENTS,a.status)||typeof a.note!=='string'||a.note.length>1000)throw Error('The saved assessments are invalid or do not match the current candidates.');
   result.set(target.id,{status:a.status,note:a.note});
  }
 }
 return result;
}
function inline(value){return String(value).replace(/[\r\n]/g,' ').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replace(/[\\`*_{}\[\]()#+.!|]/g,'\\$&');}
export function markdownReport(report,assessments){
 const done=report.findings.filter(f=>(assessments.get(f.id)||EMPTY_ASSESSMENT).status!=='unreviewed').length;
 const out=['# PatchLedger review handoff','',`${report.files.length} files | ${report.totalLines} lines | ${report.findings.length} candidates | ${done} assessed`,'','Local pattern checks and human assessments. No AI inference. Pattern matches are not proven defects. No matches does not mean the code is safe. Source text is excluded.',''];
 for(const file of report.files){
  out.push(`## ${inline(file.name)}`,'',`SHA-256: ${file.sha256}`,'');
  if(!file.findings.length)out.push('No configured pattern matched.','');
  for(const f of file.findings){const a=assessments.get(f.id)||EMPTY_ASSESSMENT;out.push(`### ${inline(f.reference)}: ${inline(f.title)}`,'',`Assessment: ${ASSESSMENTS[a.status]}`,`Pattern: ${f.rule}`,f.reason,'');if(a.note)out.push('Reviewer note:',...a.note.split(/\r?\n/).map(line=>'> '+inline(line)),'');}
  if(file.findingsLimited)out.push('Candidate limit reached. Inspect the full source directly.','');
 }
 return out.join('\n');
}
