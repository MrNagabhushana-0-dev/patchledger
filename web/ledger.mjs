import { CHANGE_STATUSES } from './compare-core.mjs?v=1.2.0';

// The four decisions a reviewer can record on a candidate.
export const ASSESSMENTS = { 'unreviewed': 'Not reviewed', 'needs-fix': 'Needs a fix', 'not-an-issue': 'Not an issue', 'needs-context': 'Need more context' };
export const EMPTY_ASSESSMENT = Object.freeze({ status: 'unreviewed', note: '' });

// Build the portable JSON export. Source text is deliberately excluded: the
// ledger carries file names, SHA-256 fingerprints, the pattern candidates and
// the human assessments, plus an optional version-comparison block.
export function makeExport(report, assessments, change) {
  const annotate = f => ({ ...f, localAssessment: { ...(assessments.get(f.id) || EMPTY_ASSESSMENT) } });
  const counts = {};
  for (const key of Object.keys(ASSESSMENTS)) counts[key] = 0;
  for (const f of report.findings) counts[(assessments.get(f.id) || EMPTY_ASSESSMENT).status]++;
  const out = {
    ...report,
    formatVersion: 3,
    files: report.files.map(f => ({ ...f, findings: f.findings.map(annotate) })),
    findings: report.findings.map(annotate),
    assessmentNote: 'Human assessments entered locally, not AI output or independently verified claims. Source text is excluded.',
    review: { generatedAt: new Date().toISOString(), counts },
  };
  if (change) out.change = change;
  return out;
}

// Restore assessments from a previous export. The binding is strict: the same
// file names, the same SHA-256 hashes and the same candidates must be open.
// Exports from formatVersion 2 and 3 both qualify; the change block, when
// present, is descriptive and not needed for the restore.
export function restoreAssessments(current, saved) {
  if (saved?.kind !== 'local-source-inspection' || saved.inferenceUsed !== false || !Array.isArray(saved.files)) throw Error('This is not a matching PatchLedger local-review export.');
  if (saved.files.length !== current.files.length) throw Error('Source does not match this export. Restore only against the same files and SHA-256 hashes.');
  const result = new Map(), seen = new Set();
  for (const old of saved.files) {
    const file = current.files.find(f => f.name === old.name);
    if (!file || file.sha256 !== old.sha256 || seen.has(old.name) || !Array.isArray(old.findings) || old.findings.length !== file.findings.length) throw Error('Source does not match this export. Restore only against the same files and SHA-256 hashes.');
    seen.add(old.name);
    for (const f of old.findings) {
      const target = file.findings.find(n => n.line === f.line && n.rule === f.rule);
      const a = f.localAssessment || EMPTY_ASSESSMENT;
      if (!target || result.has(target.id) || !Object.hasOwn(ASSESSMENTS, a.status) || typeof a.note !== 'string' || a.note.length > 1000) throw Error('The saved assessments are invalid or do not match the current candidates.');
      result.set(target.id, { status: a.status, note: a.note });
    }
  }
  return result;
}

function inline(value) {
  return String(value).replace(/[\r\n]/g, ' ').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/[\\`*_{}\[\]()#+.!|]/g, '\\$&');
}

// Readable Markdown handoff. Opens with the decision summary and, in compare
// mode, the shape of the change; then walks each file with its candidates and
// the reviewer's recorded decisions.
export function markdownReport(report, assessments, change) {
  const counts = {};
  for (const key of Object.keys(ASSESSMENTS)) counts[key] = 0;
  for (const f of report.findings) counts[(assessments.get(f.id) || EMPTY_ASSESSMENT).status]++;
  const done = report.findings.length - counts.unreviewed;
  const out = [
    '# PatchLedger review handoff', '',
    `${report.files.length} files | ${report.totalLines} lines | ${report.findings.length} candidates | ${done} assessed`, '',
    `Decisions: ${counts['needs-fix']} need a fix · ${counts['not-an-issue']} not an issue · ${counts['needs-context']} need more context · ${counts.unreviewed} not reviewed`, '',
    'Local pattern checks and human assessments. No AI inference. Pattern matches are not proven defects. No matches does not mean the code is safe. Source text is excluded.', '',
  ];
  if (change) {
    out.push('## The compared change', '');
    out.push(`${change.summary.added} added · ${change.summary.modified} modified · ${change.summary.unchanged} unchanged · ${change.summary.removed} removed`, '');
    for (const status of ['added', 'modified', 'removed']) {
      const names = change.entries.filter(e => e.status === status).map(e => e.name);
      if (names.length) out.push(`**${CHANGE_STATUSES[status]}:** ${names.map(inline).join(', ')}`, '');
    }
  }
  for (const file of report.files) {
    const status = change ? change.entries.find(e => e.name === file.name)?.status : null;
    out.push(`## ${inline(file.name)}${status ? ` (${CHANGE_STATUSES[status].toLowerCase()})` : ''}`, '', `SHA-256: ${file.sha256}`, '');
    if (!file.findings.length) out.push('No configured pattern matched.', '');
    for (const f of file.findings) {
      const a = assessments.get(f.id) || EMPTY_ASSESSMENT;
      out.push(`### ${inline(f.reference)}: ${inline(f.title)}`, '', `Assessment: ${ASSESSMENTS[a.status]}`, `Pattern: ${f.rule}`, f.reason, '');
      if (a.note) out.push('Reviewer note:', ...a.note.split(/\r?\n/).map(line => '> ' + inline(line)), '');
    }
    if (file.findingsLimited) out.push('Candidate limit reached. Inspect the full source directly.', '');
  }
  if (change) {
    const removed = change.entries.filter(e => e.status === 'removed');
    if (removed.length) {
      out.push('## Removed files', '');
      for (const e of removed) out.push(`- ${inline(e.name)} (base SHA-256: ${e.baseSha256})`);
      out.push('');
    }
  }
  return out.join('\n');
}
