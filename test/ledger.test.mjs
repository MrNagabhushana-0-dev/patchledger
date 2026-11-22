import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFiles} from '../src/inspect.mjs';
import {makeExport,restoreAssessments,markdownReport} from '../web/ledger.mjs';
import {compareVersions} from '../web/compare-core.mjs';
const source=[{name:'src/a.js',text:'eval(input);\n// TODO review'},{name:'test/a.js',text:'const fixture = "eval(x)";'}];
test('exports preserve local assessments in flat and per-file records without source text',()=>{
 const report=inspectFiles(source),notes=new Map([[report.findings[0].id,{status:'needs-fix',note:'Check the caller.'}]]);
 const out=makeExport(report,notes);
 assert.equal(out.findings[0].localAssessment.note,'Check the caller.');
 assert.equal(out.files[0].findings[0].localAssessment.status,'needs-fix');
 assert.equal(out.inferenceUsed,false);assert.equal('text' in out.files[0],false);
 assert.match(markdownReport(report,notes),/Reviewer note:\n> Check the caller/);
});
test('restore binds to source hash, path, rule and line even when input order changes',()=>{
 const first=inspectFiles(source),notes=new Map([[first.findings[0].id,{status:'not-an-issue',note:'Fixture only.'}]]);
 const saved=makeExport(first,notes),reordered=inspectFiles([...source].reverse());
 const restored=restoreAssessments(reordered,saved);
 const target=reordered.files.find(f=>f.name==='src/a.js').findings[0];
 assert.equal(restored.get(target.id).note,'Fixture only.');
 assert.equal(restored.get(target.id).status,'not-an-issue');
});
test('restore rejects changed content and duplicate files',()=>{
 const r=inspectFiles(source),saved=makeExport(r,new Map());
 const changed=inspectFiles([{...source[0],text:source[0].text+'\nchanged'},source[1]]);
 assert.throws(()=>restoreAssessments(changed,saved),/Source does not match/);
 saved.files[1]=saved.files[0];assert.throws(()=>restoreAssessments(r,saved),/Source does not match/);
});
test('restore refuses unknown assessment values, duplicate candidates and model reports',()=>{
 const r=inspectFiles(source);let s=makeExport(r,new Map());s.files[0].findings[0].localAssessment.status='approved';
 assert.throws(()=>restoreAssessments(r,s),/invalid/);
 s=makeExport(r,new Map());s.files[0].findings[1]=s.files[0].findings[0];assert.throws(()=>restoreAssessments(r,s),/invalid/);
 s=makeExport(r,new Map());s.inferenceUsed=true;assert.throws(()=>restoreAssessments(r,s),/not a matching/);
});
test('markdown preserves reviewer note newlines as quoted text and labels limits',()=>{
 const r=inspectFiles(source),notes=new Map([[r.findings[0].id,{status:'needs-context',note:'# not a heading\nsecond line'}]]);
 const md=markdownReport(r,notes);assert.match(md,/> \\# not a heading\n> second line/);assert.match(md,/No AI inference/);assert.match(md,/SHA-256/);
});
test('markdown treats filenames and note markup as literal text, not embedded HTML or images',()=>{
 const r=inspectFiles([{name:'src/<img>.js',text:'eval(input);'}]);
 const notes=new Map([[r.findings[0].id,{status:'needs-context',note:'<img src=x>\n![image](https://example.invalid)'}]]);
 const md=markdownReport(r,notes);
 assert.equal(md.includes('<img'),false);assert.equal(md.includes('![image]'),false);assert.ok(md.includes('&lt;img&gt;'));
});

test('exports carry decision counts and an optional change block, and still restore',()=>{
 const base=inspectFiles([{name:'src/a.js',text:'eval(input);\n'},{name:'src/old.js',text:'// TODO gone\n'}]);
 const next=inspectFiles([{name:'src/a.js',text:'eval(input);\n'},{name:'src/new.js',text:'Math.random();\n'}]);
 const change=compareVersions(base,next);
 const notes=new Map([[next.findings[0].id,{status:'needs-fix',note:'Keep the review.'}]]);
 const out=makeExport(next,notes,change);
 assert.equal(out.formatVersion,3);
 assert.equal(out.review.counts['needs-fix'],1);
 assert.equal(out.review.counts.unreviewed,1);
 assert.equal(out.change.summary.removed,1);
 assert.ok(Date.parse(out.review.generatedAt));
 const restored=restoreAssessments(inspectFiles([{name:'src/a.js',text:'eval(input);\n'},{name:'src/new.js',text:'Math.random();\n'}].reverse()),out);
 assert.equal([...restored.values()][0].note,'Keep the review.');
});
test('markdown opens with the decision summary and the shape of the change',()=>{
 const base=inspectFiles([{name:'src/a.js',text:'eval(input);\n'},{name:'src/old.js',text:'// TODO gone\n'}]);
 const next=inspectFiles([{name:'src/a.js',text:'eval(input);\n'}]);
 const change=compareVersions(base,next);
 const md=markdownReport(next,new Map(),change);
 assert.match(md,/Decisions: 0 need a fix/);
 assert.match(md,/## The compared change/);
 assert.match(md,/0 added · 0 modified · 1 unchanged · 1 removed/);
 assert.match(md,/\*\*Removed:\*\* src\/old/);
 assert.match(md,/## Removed files/);
 assert.match(md,/base SHA-256/);
});
test('markdown without a change stays a plain per-file handoff',()=>{
 const md=markdownReport(inspectFiles(source),new Map());
 assert.equal(md.includes('compared change'),false);
});
