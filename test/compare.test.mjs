import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectFiles } from '../src/inspect.mjs';
import { compareVersions, changeOf, CHANGE_STATUSES } from '../web/compare-core.mjs';

const baseSource = [
  { name: 'src/keep.js', text: 'eval(input);\n' },
  { name: 'src/edit.js', text: '// TODO old version\n' },
  { name: 'src/drop.js', text: 'export const gone = true;\n' },
];
const newSource = [
  { name: 'src/keep.js', text: 'eval(input);\n' },
  { name: 'src/edit.js', text: '// TODO new version\n' },
  { name: 'src/add.js', text: 'Math.random();\n' },
];

test('pairs files by path and classifies added, modified, unchanged and removed', () => {
  const change = compareVersions(inspectFiles(baseSource), inspectFiles(newSource));
  assert.equal(change.kind, 'patchledger-version-compare');
  const byName = Object.fromEntries(change.entries.map(e => [e.name, e.status]));
  assert.deepEqual(byName, {
    'src/keep.js': 'unchanged',
    'src/edit.js': 'modified',
    'src/add.js': 'added',
    'src/drop.js': 'removed',
  });
  assert.deepEqual(change.summary, { added: 1, modified: 1, unchanged: 1, removed: 1 });
});

test('change records carry hashes, never source text', () => {
  const change = compareVersions(inspectFiles(baseSource), inspectFiles(newSource));
  for (const entry of change.entries) {
    assert.equal('text' in entry, false);
    assert.equal(Object.keys(entry).sort().join(','), 'baseSha256,name,sha256,status');
  }
  const removed = changeOf(change, 'src/drop.js');
  assert.equal(removed.sha256, null);
  assert.equal(removed.baseSha256.length, 64);
  const added = changeOf(change, 'src/add.js');
  assert.equal(added.baseSha256, null);
  assert.equal(added.sha256.length, 64);
});

test('changeOf returns null outside a comparison or for unknown names', () => {
  const change = compareVersions(inspectFiles(baseSource), inspectFiles(newSource));
  assert.equal(changeOf(null, 'src/keep.js'), null);
  assert.equal(changeOf(change, 'src/nope.js'), null);
});

test('every status has a display label', () => {
  for (const status of ['added', 'modified', 'unchanged', 'removed']) assert.ok(CHANGE_STATUSES[status]);
});

test('rejects malformed reports instead of guessing', () => {
  assert.throws(() => compareVersions(null, inspectFiles(newSource)));
  assert.throws(() => compareVersions(inspectFiles(baseSource), { files: 'nope' }));
});
