import { inspectFiles } from './inspect-browser.mjs?v=1.2.0';
import { ASSESSMENTS, EMPTY_ASSESSMENT, makeExport, restoreAssessments, markdownReport } from './ledger.mjs?v=1.2.0';
import { compareVersions, CHANGE_STATUSES, changeOf } from './compare-core.mjs?v=1.2.0';
import { SEVERITIES } from './inspect-core.mjs?v=1.2.0';

const $ = id => document.getElementById(id);

// Workspace state. Source text and notes live only in this tab's memory.
let report, change = null, sourceFiles = [], assessments = new Map(), findingFiles = new Map();
let queueLimit = 100, activeId = null, activeFile = null, dirty = false, sample = false, busy = false;
let mode = 'single';
const pending = { base: null, new: null };
let expandToggle = null;

const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const assessment = f => assessments.get(f.id) || EMPTY_ASSESSMENT;
const fileOf = f => findingFiles.get(f.id);
const activeFinding = () => report?.findings.find(f => f.id === activeId) || null;
const allowReplace = () => !dirty || confirm('Your assessments have not been exported. Replace this workspace and discard them?');

function error(message = '') { $('error').textContent = message; $('error').hidden = !message; }
function setDirty(value) { dirty = value; updateProgress(); }
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });

$('about-button').onclick = () => { const open = $('about').hidden; $('about').hidden = !open; $('about-button').setAttribute('aria-expanded', String(open)); };

// ---------- Intake ----------

const allowed = /\.(?:[cm]?js|[cm]?ts|tsx|jsx|py|go|rs|java|rb|php|[ch]|cpp|hpp|md|txt|json|ya?ml|css|html?|sql|sh|vue|svelte|kt|swift|cs)$/i;
const excluded = /(^|\/)(?:node_modules|\.git|\.venv|\.next|coverage|dist)(\/|$)|(^|\/)(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx))$/i;

function setMode(next) {
  mode = next;
  $('mode-single').setAttribute('aria-pressed', String(next === 'single'));
  $('mode-compare').setAttribute('aria-pressed', String(next === 'compare'));
  $('single-pane').hidden = next !== 'single';
  $('compare-pane').hidden = next !== 'compare';
  $('intake-copy').innerHTML = next === 'compare'
    ? 'Pick the base and the updated version.<br>Each side: 30 UTF-8 files, 750 KB.'
    : 'Up to 30 UTF-8 text files, 750 KB total.<br>Your source never leaves this browser.';
}
$('mode-single').onclick = () => setMode('single');
$('mode-compare').onclick = () => setMode('compare');

async function readSources(list, folderMode) {
  const files = list.filter(f => !folderMode || (allowed.test(f.name) && !excluded.test(f.webkitRelativePath || f.name)));
  const skipped = list.length - files.length;
  if (!files.length) throw new Error('No supported source files found. Choose UTF-8 text files; do not include credentials.');
  if (files.length > 30 || files.reduce((n, f) => n + f.size, 0) > 750000) throw new Error('This selection is too large. Choose up to 30 files, 750 KB total per version.');
  const sources = await Promise.all(files.map(async f => ({ name: f.webkitRelativePath || f.name, text: new TextDecoder('utf-8', { fatal: true }).decode(await f.arrayBuffer()) })));
  return { sources, skipped };
}

async function importFiles(list, folderMode = false) {
  if (busy || !list.length) return;
  if (!allowReplace()) return;
  let read;
  try { read = await readSources(list, folderMode); }
  catch (e) { error(e.message); return; }
  busy = true; error(); $('intake-status').textContent = 'Reading and hashing locally...';
  try {
    const data = await inspectFiles(read.sources);
    commit(read.sources, data, false, null);
    $('intake-status').textContent = `${read.sources.length} files opened locally${read.skipped ? `; ${read.skipped} unsupported, generated or credential files skipped` : ''}.`;
  } catch (e) {
    error((e instanceof TypeError ? 'A file is not valid UTF-8 text.' : e.message) + ' The previous workspace is unchanged.');
    $('intake-status').textContent = 'Could not open this selection.';
  } finally { busy = false; }
}

for (const id of ['files', 'folder']) $(id).addEventListener('change', event => { const files = [...event.target.files]; event.target.value = ''; void importFiles(files, id === 'folder'); });
$('choose-files').onclick = () => $('files').click();
$('choose-folder').onclick = () => $('folder').click();
$('restore').onclick = () => $('restore-file').click();

// Compare mode: each side is read when picked, inspected only on Compare.
async function pickSlot(which, list, folderMode) {
  if (busy || !list.length) return;
  try {
    const { sources, skipped } = await readSources(list, folderMode);
    pending[which] = { sources };
    $(which + '-status').textContent = `${sources.length} files ready${skipped ? ` · ${skipped} skipped` : ''}.`;
  } catch (e) {
    pending[which] = null;
    $(which + '-status').textContent = e.message;
  }
  $('compare-run').disabled = !(pending.base && pending.new);
}
const slots = [
  ['choose-base-files', 'base-files', 'base', false],
  ['choose-base-folder', 'base-folder', 'base', true],
  ['choose-new-files', 'new-files', 'new', false],
  ['choose-new-folder', 'new-folder', 'new', true],
];
for (const [buttonId, inputId, which, folderMode] of slots) {
  $(buttonId).onclick = () => $(inputId).click();
  $(inputId).addEventListener('change', event => { const files = [...event.target.files]; event.target.value = ''; void pickSlot(which, files, folderMode); });
}

$('compare-run').onclick = async () => {
  if (busy || !pending.base || !pending.new) return;
  if (!allowReplace()) return;
  busy = true; error(); $('intake-status').textContent = 'Reading, hashing and comparing locally...';
  try {
    const [baseReport, newReport] = await Promise.all([inspectFiles(pending.base.sources), inspectFiles(pending.new.sources)]);
    commit(pending.new.sources, newReport, false, compareVersions(baseReport, newReport));
    $('intake-status').textContent = `Compared ${pending.base.sources.length} base files with ${pending.new.sources.length} updated files locally.`;
  } catch (e) {
    error((e instanceof TypeError ? 'A file is not valid UTF-8 text.' : e.message) + ' The previous workspace is unchanged.');
    $('intake-status').textContent = 'Could not compare these versions.';
  } finally { busy = false; }
};

// Sample: a small before/after change that exercises the whole desk. The code
// is illustrative, displayed and checked as text, and never executed.
const SAMPLE_BASE = [
  { name: 'src/preview.js', text: '// Sample only. This code is displayed, never executed.\nexport function renderPreview(container, userHtml) {\n  container.innerHTML = userHtml;\n}\n\nexport function calculate(expression) {\n  return eval(expression);\n}\n' },
  { name: 'src/request.js', text: '// Sample only. Review environment and caller context.\nexport const requestOptions = {\n  rejectUnauthorized: false,\n};\n\n// TODO: document the development-only behavior.\n' },
  { name: 'src/format.js', text: '// Sample only. No configured pattern matches this file.\nexport const formatTotal = value => value.toFixed(2);\n' },
  { name: 'src/legacy.js', text: '// Sample only. This file is dropped in the updated version.\n// TODO: retire after the migration window closes.\nexport const legacyMode = true;\n' },
];
const SAMPLE_UPDATED = [
  { name: 'src/preview.js', text: '// Sample only. This code is displayed, never executed.\nexport function renderPreview(container, userHtml) {\n  container.innerHTML = userHtml;\n}\n\nexport function calculate(expression) {\n  return eval(expression);\n}\n' },
  { name: 'src/request.js', text: '// Sample only. TLS verification stays enabled in this revision.\nexport const requestOptions = {\n  timeout: 5000,\n};\n\n// TODO: document the timeout chosen for development.\n' },
  { name: 'src/format.js', text: '// Sample only. No configured pattern matches this file.\nexport const formatTotal = value => value.toFixed(2);\n' },
  { name: 'src/session.js', text: '// Sample only. New session helpers introduced by this change.\nconst api_key = "demo-not-a-real-secret-1234";\n\nexport function sessionId() {\n  return Math.random().toString(36).slice(2);\n}\n\nexport function fingerprint(value) {\n  return md5(value);\n}\n' },
];

$('sample').onclick = async () => {
  if (busy || !allowReplace()) return;
  busy = true;
  try {
    const [baseReport, newReport] = await Promise.all([inspectFiles(SAMPLE_BASE), inspectFiles(SAMPLE_UPDATED)]);
    commit(SAMPLE_UPDATED, newReport, true, compareVersions(baseReport, newReport));
    $('intake-status').textContent = 'Sample change loaded. These files illustrate the review flow; they are not your project.';
    error();
  } catch (e) { error(e.message); } finally { busy = false; }
};

function commit(sources, data, isSample, changeResult) {
  sourceFiles = sources; report = data; change = changeResult; sample = isSample;
  assessments = new Map();
  findingFiles = new Map(data.files.flatMap(file => file.findings.map(f => [f.id, file])));
  queueLimit = 100; activeFile = null; dirty = false;
  $('search').value = ''; $('filter').value = 'all'; $('severity-filter').value = 'all'; $('scope').value = 'change';
  $('scope-label').hidden = !change;
  $('sample-label').hidden = !sample;
  $('workspace-description').textContent = sample ? 'A sample change to explore. Read a candidate, record a decision, and save the handoff.' : 'Your files are open. Work through the candidates and export the decisions you want to keep.';
  $('download').disabled = false; $('download-markdown').disabled = false; $('restore').disabled = false; $('clear').disabled = false;
  $('export-status').textContent = 'Export before closing. Source and notes stay in this tab only.';
  document.body.classList.add('has-workspace');
  chooseFirst();
  render();
}

// ---------- Review state ----------

function updateProgress() {
  if (!report) return;
  const done = report.findings.filter(f => assessment(f).status !== 'unreviewed').length;
  $('progress').max = Math.max(1, report.findings.length);
  $('progress').value = done;
  $('progress-label').textContent = `${done} / ${report.findings.length} assessed`;
  const counts = {};
  for (const key of Object.keys(ASSESSMENTS)) counts[key] = 0;
  for (const f of report.findings) counts[assessment(f).status]++;
  $('decisions').textContent = done ? `${counts['needs-fix']} to fix · ${counts['not-an-issue']} not an issue · ${counts['needs-context']} need context` : '';
  $('save-state').textContent = dirty ? 'Unexported changes' : done ? 'Changes exported or restored' : 'No decisions recorded yet';
  $('save-state').classList.toggle('unsaved', dirty);
  $('summary').textContent = change
    ? `${change.summary.added} added · ${change.summary.modified} modified · ${change.summary.unchanged} unchanged · ${change.summary.removed} removed · ${report.findings.length} candidates · local checks only`
    : `${report.files.length} files · ${report.totalLines} lines · ${report.findings.length} candidates · local checks only`;
}

function renderFiles() {
  const rail = $('file-list'); rail.replaceChildren();
  const entries = change ? change.entries : report.files.map(f => ({ name: f.name, status: null }));
  $('file-count').textContent = String(entries.length).padStart(2, '0');
  const all = el('button', undefined, 'file-button all-files'); all.type = 'button';
  all.append(el('span', change ? 'All compared files' : 'All source files'), el('span', String(report.findings.length), 'file-badge'));
  all.setAttribute('aria-pressed', String(activeFile === null));
  all.onclick = () => { activeFile = null; chooseFirst(); render(); };
  rail.append(all);
  for (const entry of entries) {
    const file = report.files.find(f => f.name === entry.name);
    const b = el('button', undefined, 'file-button'); b.type = 'button';
    b.setAttribute('aria-pressed', String(activeFile === entry.name));
    b.setAttribute('aria-label', `${entry.name}${entry.status ? ', ' + CHANGE_STATUSES[entry.status].toLowerCase() : ''}${file ? `, ${file.findings.length} candidates` : ', no source in the updated version'}`);
    const name = el('span', entry.name, 'filename');
    const meta = el('span', undefined, 'file-meta');
    if (entry.status) meta.append(el('span', CHANGE_STATUSES[entry.status][0], 'change-badge ' + entry.status));
    if (file) meta.append(el('span', String(file.findings.length), 'file-badge'));
    b.append(name, meta);
    b.onclick = () => { activeFile = entry.name; chooseFirst(); render(); };
    rail.append(b);
  }
}

function candidates() {
  const query = $('search').value.toLowerCase().trim(), status = $('filter').value, severity = $('severity-filter').value;
  const scope = change ? $('scope').value : 'all';
  return report.findings.filter(f => {
    if (activeFile && fileOf(f).name !== activeFile) return false;
    if (status !== 'all' && assessment(f).status !== status) return false;
    if (severity !== 'all' && f.severity !== severity) return false;
    if (scope === 'change') { const c = changeOf(change, fileOf(f).name); if (!c || c.status === 'unchanged') return false; }
    if (query && !`${f.reference} ${f.title} ${f.reason}`.toLowerCase().includes(query)) return false;
    return true;
  });
}

function chooseFirst() { queueLimit = 100; activeId = candidates()[0]?.id || null; }

function renderQueue() {
  const queue = $('candidate-list'); queue.replaceChildren();
  const filtered = candidates();
  $('queue-heading').textContent = `Review queue · ${filtered.length}`;
  if (!filtered.length) {
    const hasCandidates = activeFile ? (report.files.find(f => f.name === activeFile)?.findings.length || 0) : report.findings.length;
    const empty = el('div', undefined, 'queue-empty');
    empty.append(el('h3', hasCandidates ? 'No candidates in this view.' : 'No configured patterns matched.'), el('p', hasCandidates ? 'Change the search, file or assessment filter. This does not change your review.' : 'Read the source directly. An empty queue is not a security clearance.'));
    queue.append(empty); return;
  }
  const activeIndex = filtered.findIndex(f => f.id === activeId);
  if (activeIndex >= queueLimit) queueLimit = Math.ceil((activeIndex + 1) / 100) * 100;
  for (const [i, f] of filtered.slice(0, queueLimit).entries()) {
    const b = el('button', undefined, 'candidate'); b.type = 'button'; b.dataset.id = f.id;
    b.setAttribute('aria-current', String(activeId === f.id));
    const top = el('span', undefined, 'candidate-top');
    const left = el('span', undefined, 'candidate-index');
    left.append(el('span', `${String(i + 1).padStart(2, '0')} `), el('span', SEVERITIES[f.severity].toUpperCase(), 'sev sev-' + f.severity));
    top.append(left, el('span', assessment(f).status === 'unreviewed' ? '○' : '✓', 'assessment-mark'));
    b.append(top, el('strong', f.title), el('span', f.reference, 'candidate-ref'), el('span', ASSESSMENTS[assessment(f).status], 'candidate-status'));
    b.onclick = () => { activeId = f.id; renderQueue(); renderDetail(); if (matchMedia('(max-width:640px)').matches) $('detail').scrollIntoView({ block: 'start' }); };
    queue.append(b);
  }
  if (filtered.length > queueLimit) {
    const more = el('button', `Showing ${queueLimit} of ${filtered.length}. Show 100 more`, 'secondary');
    more.onclick = () => { queueLimit += 100; renderQueue(); };
    queue.append(more);
  }
}

function changeChip(entry) {
  return el('span', `${CHANGE_STATUSES[entry.status]} file`, 'change-badge ' + entry.status);
}

function renderDetail() {
  const detail = $('detail'); detail.replaceChildren(); expandToggle = null;
  const finding = activeFinding();
  const entry = change && activeFile ? changeOf(change, activeFile) : (change && finding ? changeOf(change, fileOf(finding).name) : null);
  const file = finding ? fileOf(finding) : (activeFile ? report.files.find(f => f.name === activeFile) : null);
  if (!finding) {
    if (file) {
      const heading = el('div', undefined, 'detail-heading');
      heading.append(el('span', 'FILE EVIDENCE', 'eyebrow'));
      if (entry) heading.append(changeChip(entry));
      detail.append(heading, el('h3', file.name, 'detail-title'), el('p', 'No candidate is selected. This source has not been declared safe.', 'quiet'));
      detail.append(sourcePanel(file, null));
      return;
    }
    if (entry && entry.status === 'removed') {
      const panel = el('div', undefined, 'removed-panel');
      panel.append(
        el('span', 'REMOVED FILE', 'eyebrow'),
        el('h3', entry.name, 'detail-title'),
        el('p', 'This file is absent from the updated version. Its base fingerprint stays in the export so the removal is on the record.', 'quiet'),
        el('code', `Base SHA-256: ${entry.baseSha256}`),
      );
      detail.append(panel);
      return;
    }
    detail.append(el('div', 'Select a candidate, choose a source file, or adjust the filters.', 'detail-placeholder'));
    return;
  }
  const heading = el('div', undefined, 'detail-heading');
  heading.append(el('span', 'SOURCE EVIDENCE', 'eyebrow'));
  const chips = el('span', undefined, 'detail-chips');
  if (entry) chips.append(changeChip(entry));
  chips.append(el('span', SEVERITIES[finding.severity], 'sev sev-' + finding.severity), el('span', ASSESSMENTS[assessment(finding).status], 'detail-status'));
  heading.append(chips);
  detail.append(heading, el('h3', finding.title, 'detail-title'), el('p', finding.reference, 'source-reference'));
  const reason = el('div', undefined, 'reason');
  reason.append(el('strong', 'Why this is in the queue'), el('p', finding.reason));
  detail.append(reason, sourcePanel(file, finding.line));

  const form = el('div', undefined, 'assessment-form');
  form.append(el('span', 'YOUR ASSESSMENT', 'eyebrow'));
  const label = el('label', 'Decision');
  const select = el('select'); select.id = 'assessment'; select.setAttribute('aria-label', `Assessment for ${finding.reference}`);
  for (const [value, text] of Object.entries(ASSESSMENTS)) { const option = el('option', text); option.value = value; select.append(option); }
  select.value = assessment(finding).status; label.append(select);
  const noteLabel = el('label', 'Review note');
  const note = el('textarea'); note.id = 'review-note'; note.rows = 3; note.maxLength = 1000;
  note.placeholder = 'What did you check? What should happen next? Do not include secrets.';
  note.value = assessment(finding).note; noteLabel.append(note);
  const count = el('span', `${note.value.length} / 1000`, 'note-count');
  const save = () => { assessments.set(finding.id, { status: select.value, note: note.value }); setDirty(true); count.textContent = `${note.value.length} / 1000`; };
  select.onchange = () => { save(); renderQueue(); detail.querySelector('.detail-status').textContent = ASSESSMENTS[select.value]; };
  note.oninput = save;
  const next = el('button', 'Next not reviewed →', 'secondary next-button'); next.id = 'next';
  next.onclick = () => {
    const items = report.findings;
    const index = items.findIndex(f => f.id === finding.id);
    const ordered = [...items.slice(index + 1), ...items.slice(0, index + 1)];
    const pendingItem = ordered.find(f => assessment(f).status === 'unreviewed' && f.id !== finding.id);
    if (!pendingItem) { $('export-status').textContent = 'No other unreviewed candidates remain. Check your decisions and export the handoff.'; return; }
    activeFile = null; $('search').value = ''; $('filter').value = 'all'; $('severity-filter').value = 'all';
    activeId = pendingItem.id; render();
    $('detail').querySelector('h3')?.scrollIntoView({ block: 'nearest' });
  };
  form.append(label, noteLabel, count, next);
  detail.append(form);
}

function sourcePanel(file, line) {
  const panel = el('div', undefined, 'source-panel');
  const source = sourceFiles.find(f => f.name === file.name), lines = source.text.split(/\r?\n/);
  const head = el('div', undefined, 'source-head');
  head.append(el('span', file.name), el('span', `${file.lines} lines`));
  panel.append(head);
  const code = el('div', undefined, 'source-code');
  code.setAttribute('aria-label', line ? `Numbered source around line ${line}` : 'Numbered source');
  function show(all = false) {
    code.replaceChildren();
    const start = line && !all ? Math.max(0, line - 5) : 0, end = line && !all ? Math.min(lines.length, line + 4) : lines.length;
    for (let i = start; i < end; i++) {
      const row = el('div', undefined, 'code-line' + (i + 1 === line ? ' highlighted' : ''));
      row.append(el('span', String(i + 1), 'line-number'), el('code', lines[i] || ' '));
      code.append(row);
    }
  }
  show(); panel.append(code);
  if (line && (line > 5 || line + 4 < lines.length)) {
    const expand = el('button', 'Show full file', 'text-button expand-source');
    let all = false;
    expand.onclick = () => { all = !all; show(all); expand.textContent = all ? 'Show surrounding lines' : 'Show full file'; };
    expandToggle = expand;
    panel.append(expand);
  }
  const hash = el('details', undefined, 'fingerprint');
  hash.append(el('summary', 'Source fingerprint / SHA-256'), el('code', file.sha256));
  panel.append(hash);
  if (file.findingsLimited) panel.append(el('p', 'Candidate limit reached. Inspect the full source directly.', 'quiet'));
  return panel;
}

function render() { updateProgress(); renderFiles(); renderQueue(); renderDetail(); }

for (const id of ['search', 'filter', 'severity-filter', 'scope']) {
  $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { if (!report) return; chooseFirst(); renderQueue(); renderDetail(); });
}

// ---------- Keyboard review ----------

$('shortcuts').onclick = () => $('shortcut-dialog').showModal();

document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  const t = event.target;
  if (t instanceof HTMLElement && (t.closest('input, textarea, select') || t.isContentEditable)) return;
  const key = event.key.toLowerCase();
  if (key === '?') { event.preventDefault(); const d = $('shortcut-dialog'); d.open ? d.close() : d.showModal(); return; }
  if (!report || $('shortcut-dialog').open) return;
  const list = candidates();
  if (key === 'j' || key === 'arrowdown' || key === 'k' || key === 'arrowup') {
    if (!list.length) return;
    event.preventDefault();
    const index = list.findIndex(f => f.id === activeId);
    const step = (key === 'j' || key === 'arrowdown') ? 1 : -1;
    const next = list[Math.min(list.length - 1, Math.max(0, (index < 0 ? 0 : index) + step))];
    if (next && next.id !== activeId) {
      activeId = next.id; renderQueue(); renderDetail();
      document.querySelector(`.candidate[data-id="${CSS.escape(activeId)}"]`)?.scrollIntoView({ block: 'nearest' });
    }
    return;
  }
  if (key === 'n') { event.preventDefault(); $('next')?.click(); return; }
  if (key === 'f') { event.preventDefault(); expandToggle?.click(); return; }
  const keyed = { '1': 'needs-fix', '2': 'not-an-issue', '3': 'needs-context', '0': 'unreviewed' }[key];
  if (keyed) {
    const finding = activeFinding();
    if (!finding) return;
    event.preventDefault();
    assessments.set(finding.id, { status: keyed, note: assessment(finding).note });
    setDirty(true);
    renderQueue(); renderDetail();
  }
});

// ---------- Export / restore ----------

function download(data, name, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = el('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  setDirty(false);
  $('export-status').textContent = 'Export prepared. Check browser downloads before closing this tab.';
}
$('download').onclick = () => { if (report) download(JSON.stringify(makeExport(report, assessments, change), null, 2), 'patchledger-local-review.json', 'application/json'); };
$('download-markdown').onclick = () => { if (report) download(markdownReport(report, assessments, change), 'patchledger-review.md', 'text/markdown'); };

$('restore-file').onchange = async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  if (!report) { error('Open the original source files first, then restore the JSON export.'); return; }
  if (!allowReplace()) return;
  try {
    if (file.size > 20000000) throw Error('This restore file is too large (20 MB maximum).');
    const saved = JSON.parse(await file.text());
    const restored = restoreAssessments(report, saved);
    assessments = restored; dirty = false; render(); error();
    $('export-status').textContent = 'Assessments restored against matching file names and SHA-256 hashes.';
  } catch (e) { error('Restore stopped: ' + e.message + ' Your current assessments are unchanged.'); }
};

$('clear').onclick = () => {
  if (!allowReplace()) return;
  report = undefined; change = null; sourceFiles = []; assessments.clear(); dirty = false; activeId = null; activeFile = null;
  location.reload();
};
