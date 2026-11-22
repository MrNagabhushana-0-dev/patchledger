// PatchLedger version comparison.
//
// Pairs the files of two inspected versions by path and classifies each as
// added, modified, unchanged or removed using SHA-256 fingerprints. The result
// carries names, statuses and hashes only - never source text - so it can be
// embedded in an export without leaking code.

export const CHANGE_STATUSES = Object.freeze({
  added: 'Added',
  modified: 'Modified',
  unchanged: 'Unchanged',
  removed: 'Removed',
});

export function compareVersions(baseReport, newReport) {
  if (!baseReport || !newReport || !Array.isArray(baseReport.files) || !Array.isArray(newReport.files)) {
    throw new Error('Both versions need inspected files.');
  }
  const baseByName = new Map(baseReport.files.map(f => [f.name, f]));
  const covered = new Set();
  const entries = [];
  for (const f of newReport.files) {
    const base = baseByName.get(f.name);
    covered.add(f.name);
    entries.push({
      name: f.name,
      status: base ? (base.sha256 === f.sha256 ? 'unchanged' : 'modified') : 'added',
      baseSha256: base ? base.sha256 : null,
      sha256: f.sha256,
    });
  }
  for (const f of baseReport.files) {
    if (!covered.has(f.name)) entries.push({ name: f.name, status: 'removed', baseSha256: f.sha256, sha256: null });
  }
  const summary = { added: 0, modified: 0, unchanged: 0, removed: 0 };
  for (const entry of entries) summary[entry.status]++;
  return { kind: 'patchledger-version-compare', entries, summary };
}

// Look up one file's change record by path. Returns null outside compare mode
// or for unknown names, so callers can treat change context as optional.
export function changeOf(change, name) {
  return change?.entries.find(e => e.name === name) || null;
}
