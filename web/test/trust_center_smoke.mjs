// plan-12 — Trust Center smoke test (no browser).
//
// Proves the browser twin (lib/trustCenter.js) reads the Go-generated fixture
// and reports honest results: every required section is present, the
// release-evidence section links to the current commit, and the five "what we do
// not claim" boundaries plus the mainnet status are present.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

const m = await import(pathToFileURL(path.join(webRoot, 'lib', 'trustCenter.js')).href);
const fixture = JSON.parse(fs.readFileSync(path.join(webRoot, 'testdata', 'trust-center.fixture.json'), 'utf8'));
m.setTrustCenterData(fixture);

test('every required trust-center section is present', () => {
  const ids = m.sections().map((s) => s.id);
  for (const id of ['release-evidence', 'launch-check', 'ux-matrix', 'human-study', 'provider-matrix', 'threat-model']) {
    assert.ok(ids.includes(id), `section ${id} present`);
  }
});

test('the trust center links to release evidence for the current commit', () => {
  assert.ok(m.commit(), 'a commit is present');
  assert.equal(m.linksToCommit(), true, 'release-evidence section references the commit');
});

test('the five non-claims and the mainnet status are present', () => {
  assert.equal(m.boundaries().length, 5, 'five boundaries');
  assert.ok(m.mainnetStatus().length > 0, 'mainnet status stated');
});
