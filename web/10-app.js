import {inspectFiles} from './inspect-browser.mjs';
import {ASSESSMENTS,EMPTY_ASSESSMENT,makeExport,restoreAssessments,markdownReport} from './ledger.mjs';
const $=id=>document.getElementById(id);
let report,sourceFiles=[],assessments=new Map(),findingFiles=new Map(),queueLimit=100,activeId=null,activeFile=null,dirty=false,sample=false,busy=false;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const assessment=f=>assessments.get(f.id)||EMPTY_ASSESSMENT;
const fileOf=f=>findingFiles.get(f.id);
const allowReplace=()=>!dirty||confirm('Your assessments have not been exported. Replace this workspace and discard them?');
function error(message=''){$('error').textContent=message;$('error').hidden=!message;}
function setDirty(value){dirty=value;updateProgress();}
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
$('about-button').onclick=()=>{const open=$('about').hidden;$('about').hidden=!open;$('about-button').setAttribute('aria-expanded',String(open));};
$('choose-files').onclick=()=>$('files').click();
$('choose-folder').onclick=()=>$('folder').click();
$('restore').onclick=()=>$('restore-file').click();
const allowed=/\.(?:[cm]?js|[cm]?ts|tsx|jsx|py|go|rs|java|rb|php|[ch]|cpp|hpp|md|txt|json|ya?ml|css|html?|sql|sh|vue|svelte|kt|swift|cs)$/i;
const excluded=/(^|\/)(?:node_modules|\.git|\.venv|\.next|coverage|dist)(\/|$)|(^|\/)(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx))$/i;
async function importFiles(list,folderMode=false){
 if(busy||!list.length)return;
 if(!allowReplace())return;
 const files=list.filter(f=>!folderMode||(allowed.test(f.name)&&!excluded.test(f.webkitRelativePath||f.name)));
 const skipped=list.length-files.length;
 if(!files.length){error('No supported source files found. Choose UTF-8 text files; do not include credentials.');return;}
 if(files.length>30||files.reduce((n,f)=>n+f.size,0)>750000){error('This selection is too large. Choose a smaller folder or up to 30 files, 750 KB total. The current workspace is unchanged.');return;}
 busy=true;error();$('intake-status').textContent='Reading and hashing locally...';
 try{
  const sources=await Promise.all(files.map(async f=>({name:f.webkitRelativePath||f.name,text:new TextDecoder('utf-8',{fatal:true}).decode(await f.arrayBuffer())})));
  const data=await inspectFiles(sources);commit(sources,data,false);
  $('intake-status').textContent=`${files.length} files opened locally${skipped?`; ${skipped} unsupported, generated or credential files skipped`:''}.`;
 }catch(e){error((e instanceof TypeError?'A file is not valid UTF-8 text.':e.message)+' The previous workspace is unchanged.');$('intake-status').textContent='Could not open this selection.';}
 finally{busy=false;}
}
for(const id of ['files','folder'])$(id).addEventListener('change',event=>{const files=[...event.target.files];event.target.value='';void importFiles(files,id==='folder');});
$('sample').onclick=async()=>{
 if(busy||!allowReplace())return;
 busy=true;
 const sources=[
  {name:'src/preview.js',text:'// Sample only. This code is displayed, never executed.\nexport function renderPreview(container, userHtml) {\n  container.innerHTML = userHtml;\n}\n\nexport function calculate(expression) {\n  return eval(expression);\n}\n'},
  {name:'src/request.js',text:'// Sample only. Review environment and caller context.\nexport const requestOptions = {\n  rejectUnauthorized: false,\n};\n\n// TODO: document the development-only behavior.\n'},
  {name:'test/preview.test.js',text:'// Sample only. A text match is not a proven defect.\nconst fixture = "eval(input)";\nconst expected = 3;\n// TODO: add a regression case for escaped markup.\n'},
  {name:'src/format.js',text:'// Sample only. No configured pattern matches this file.\nexport const formatTotal = value => value.toFixed(2);\n'}
 ];
 try{commit(sources,await inspectFiles(sources),true);$('intake-status').textContent='Sample code loaded. These files illustrate the checks; they are not your project.';error();}catch(e){error(e.message);}finally{busy=false;}
};
function commit(sources,data,isSample){
 sourceFiles=sources;report=data;sample=isSample;assessments=new Map();findingFiles=new Map(data.files.flatMap(file=>file.findings.map(f=>[f.id,file])));queueLimit=100;activeFile=null;activeId=data.findings[0]?.id||null;dirty=false;
 $('search').value='';$('filter').value='all';$('sample-label').hidden=!sample;
 $('workspace-description').textContent=sample?'A sample change to explore. Read a candidate, record a decision, and save the handoff.':'Your files are open. Work through the candidates and export the decisions you want to keep.';
 $('download').disabled=false;$('download-markdown').disabled=false;$('restore').disabled=false;$('clear').disabled=false;
 $('export-status').textContent='Export before closing. Source and notes stay in this tab only.';
 document.body.classList.add('has-workspace');
 render();
}
function updateProgress(){
 if(!report)return;
 const done=report.findings.filter(f=>assessment(f).status!=='unreviewed').length;
 $('progress').max=Math.max(1,report.findings.length);$('progress').value=done;
 $('progress-label').textContent=`${done} / ${report.findings.length} assessed`;
 $('save-state').textContent=dirty?'Unexported changes':done?'Changes exported or restored':'No decisions recorded yet';
 $('save-state').classList.toggle('unsaved',dirty);
 $('summary').textContent=`${report.files.length} files · ${report.totalLines} lines · ${report.findings.length} candidates · local checks only`;
}
function renderFiles(){
 const rail=$('file-list');rail.replaceChildren();$('file-count').textContent=String(report.files.length).padStart(2,'0');
 const all=el('button',undefined,'file-button all-files');all.type='button';all.append(el('span','All source files'),el('span',String(report.findings.length),'file-badge'));all.setAttribute('aria-pressed',String(activeFile===null));all.onclick=()=>{activeFile=null;chooseFirst();render();};rail.append(all);
 for(const file of report.files){const b=el('button',undefined,'file-button');b.type='button';b.setAttribute('aria-pressed',String(activeFile===file.name));b.setAttribute('aria-label',`${file.name}, ${file.findings.length} candidates`);const name=el('span',file.name,'filename');b.append(name,el('span',String(file.findings.length),'file-badge'));b.onclick=()=>{activeFile=file.name;chooseFirst();render();};rail.append(b);}
}
function candidates(){
 const query=$('search').value.toLowerCase().trim(),status=$('filter').value;
 return report.findings.filter(f=>(!activeFile||fileOf(f).name===activeFile)&&(status==='all'||assessment(f).status===status)&&(!query||`${f.reference} ${f.title} ${f.reason}`.toLowerCase().includes(query)));
}
function chooseFirst(){queueLimit=100;activeId=candidates()[0]?.id||null;}
function renderQueue(){
 const queue=$('candidate-list');queue.replaceChildren();const filtered=candidates();$('queue-heading').textContent=`Review queue · ${filtered.length}`;
 if(!filtered.length){const hasCandidates=activeFile?report.files.find(f=>f.name===activeFile).findings.length:report.findings.length;const empty=el('div',undefined,'queue-empty');empty.append(el('h3',hasCandidates?'No candidates in this view.':'No configured patterns matched.'),el('p',hasCandidates?'Change the search, file or assessment filter. This does not change your review.':'Read the source directly. An empty queue is not a security clearance.'));queue.append(empty);return;}
 const activeIndex=filtered.findIndex(f=>f.id===activeId);if(activeIndex>=queueLimit)queueLimit=Math.ceil((activeIndex+1)/100)*100;
 for(const [i,f] of filtered.slice(0,queueLimit).entries()){
  const b=el('button',undefined,'candidate');b.type='button';b.dataset.id=f.id;b.setAttribute('aria-current',String(activeId===f.id));
  const top=el('span',undefined,'candidate-top');top.append(el('span',`${String(i+1).padStart(2,'0')} / ${f.rule==='disabled-tls'?'TLS CHECK':'PATTERN CHECK'}`),el('span',assessment(f).status==='unreviewed'?'○':'✓','assessment-mark'));
  b.append(top,el('strong',f.title),el('span',f.reference,'candidate-ref'),el('span',ASSESSMENTS[assessment(f).status],'candidate-status'));b.onclick=()=>{activeId=f.id;renderQueue();renderDetail();if(matchMedia('(max-width:640px)').matches)$('detail').scrollIntoView({block:'start'});};queue.append(b);
 }
  if(filtered.length>queueLimit){const more=el('button',`Showing ${queueLimit} of ${filtered.length}. Show 100 more`,'secondary');more.onclick=()=>{queueLimit+=100;renderQueue();};queue.append(more);}
}
function renderDetail(){
 const detail=$('detail');detail.replaceChildren();const finding=report.findings.find(f=>f.id===activeId),file=finding?fileOf(finding):report.files.find(f=>f.name===activeFile);
 if(!finding){
  if(file){detail.append(el('span','FILE EVIDENCE','eyebrow'),el('h3',file.name,'detail-title'),el('p','No candidate is selected. This source has not been declared safe.','quiet'));detail.append(sourcePanel(file,null));}
  else{detail.append(el('div','Select a candidate, choose a source file, or adjust the filters.','detail-placeholder'));}return;
 }
 const heading=el('div',undefined,'detail-heading');heading.append(el('span','SOURCE EVIDENCE','eyebrow'),el('span',ASSESSMENTS[assessment(finding).status],'detail-status'));detail.append(heading,el('h3',finding.title,'detail-title'),el('p',finding.reference,'source-reference'));
 const reason=el('div',undefined,'reason');reason.append(el('strong','Why this is in the queue'),el('p',finding.reason));detail.append(reason,sourcePanel(file,finding.line));
 const form=el('div',undefined,'assessment-form');form.append(el('span','YOUR ASSESSMENT','eyebrow'));
 const label=el('label','Decision');const select=el('select');select.id='assessment';select.setAttribute('aria-label',`Assessment for ${finding.reference}`);
 for(const [value,text]of Object.entries(ASSESSMENTS)){const option=el('option',text);option.value=value;select.append(option);}select.value=assessment(finding).status;label.append(select);
 const noteLabel=el('label','Review note');const note=el('textarea');note.id='review-note';note.rows=3;note.maxLength=1000;note.placeholder='What did you check? What should happen next? Do not include secrets.';note.value=assessment(finding).note;noteLabel.append(note);
 const count=el('span',`${note.value.length} / 1000`,'note-count');
 const save=()=>{assessments.set(finding.id,{status:select.value,note:note.value});setDirty(true);count.textContent=`${note.value.length} / 1000`;};
 select.onchange=()=>{save();renderQueue();detail.querySelector('.detail-status').textContent=ASSESSMENTS[select.value];};note.oninput=save;
 const next=el('button','Next not reviewed →','secondary next-button');next.id='next';next.onclick=()=>{const items=report.findings;const index=items.findIndex(f=>f.id===finding.id);const ordered=[...items.slice(index+1),...items.slice(0,index+1)];const pending=ordered.find(f=>assessment(f).status==='unreviewed'&&f.id!==finding.id);if(!pending){$('export-status').textContent='No other unreviewed candidates remain. Check your decisions and export the handoff.';return;}activeFile=null;$('search').value='';$('filter').value='all';activeId=pending.id;render();$('detail').querySelector('h3')?.scrollIntoView({block:'nearest'});};
 form.append(label,noteLabel,count,next);detail.append(form);
}
function sourcePanel(file,line){
 const panel=el('div',undefined,'source-panel');const source=sourceFiles.find(f=>f.name===file.name),lines=source.text.split(/\r?\n/);
 const head=el('div',undefined,'source-head');head.append(el('span',file.name),el('span',`${file.lines} lines`));panel.append(head);
 const code=el('div',undefined,'source-code');code.setAttribute('aria-label',line?`Numbered source around line ${line}`:'Numbered source');
 function show(all=false){code.replaceChildren();let start=line&&!all?Math.max(0,line-5):0,end=line&&!all?Math.min(lines.length,line+4):lines.length;for(let i=start;i<end;i++){const row=el('div',undefined,'code-line'+(i+1===line?' highlighted':''));row.append(el('span',String(i+1),'line-number'),el('code',lines[i]||' '));code.append(row);}}
 show();panel.append(code);
 if(line&&(line>5||line+4<lines.length)){const expand=el('button','Show full file','text-button expand-source');let all=false;expand.onclick=()=>{all=!all;show(all);expand.textContent=all?'Show surrounding lines':'Show full file';};panel.append(expand);}
 const hash=el('details',undefined,'fingerprint');hash.append(el('summary','Source fingerprint / SHA-256'),el('code',file.sha256));panel.append(hash);
 if(file.findingsLimited)panel.append(el('p','Candidate limit reached. Inspect the full source directly.','quiet'));return panel;
}
function render(){updateProgress();renderFiles();renderQueue();renderDetail();}
for(const id of ['search','filter'])$(id).addEventListener(id==='search'?'input':'change',()=>{if(!report)return;chooseFirst();renderQueue();renderDetail();});
function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type}));const a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);setDirty(false);$('export-status').textContent='Export prepared. Check browser downloads before closing this tab.';}
$('download').onclick=()=>{if(report)download(JSON.stringify(makeExport(report,assessments),null,2),'patchledger-local-review.json','application/json');};
$('download-markdown').onclick=()=>{if(report)download(markdownReport(report,assessments),'patchledger-review.md','text/markdown');};
$('restore-file').onchange=async event=>{
 const file=event.target.files[0];event.target.value='';if(!file)return;
 if(!report){error('Open the original source files first, then restore the JSON export.');return;}
 if(!allowReplace())return;
 try{if(file.size>20000000)throw Error('This restore file is too large (20 MB maximum).');const saved=JSON.parse(await file.text());const restored=restoreAssessments(report,saved);assessments=restored;dirty=false;render();error();$('export-status').textContent='Assessments restored against matching file names and SHA-256 hashes.';}catch(e){error('Restore stopped: '+e.message+' Your current assessments are unchanged.');}
};
$('clear').onclick=()=>{if(!allowReplace())return;report=undefined;sourceFiles=[];assessments.clear();dirty=false;activeId=null;activeFile=null;location.reload();};
