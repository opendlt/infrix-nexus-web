// nextux-16 — Prompt-to-Proof App Studio smoke test (no browser).
//
// Proves the browser twin (lib/app.js) reads the hand-authored app fixture and
// upholds the honesty rails the CLI/SDK/agent also enforce: the assurance comes
// from the verifier and never trusts the node, a local run never claims L0 or
// L4, deferred requirements are disclosed (not hidden), and every generated
// artifact is mainnet-disabled.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

const a = await import(pathToFileURL(path.join(webRoot, 'lib', 'app.js')).href);
const fixture = JSON.parse(fs.readFileSync(path.join(webRoot, 'testdata', 'app.fixture.json'), 'utf8'));
a.setAppData(fixture);

test('the assurance comes from the verifier and never trusts the node', () => {
  const as = a.assurance();
  assert.ok(as, 'an assurance is present');
  assert.equal(as.source, 'verifykit', 'assurance is sourced from the verifier');
  assert.equal(as.nodeTrusted, false, 'the node is never trusted');
  assert.equal(a.assuranceIsHonest(), true, 'the assurance respects the rails');
});

test('a local run never claims L0 confirmation or L4', () => {
  const r = a.latestRun();
  assert.equal(r.network, 'local');
  assert.equal(r.l0Verified, false, 'local never confirms L0');
  assert.notEqual(String(r.proofLevel).toUpperCase(), 'L4', 'local never reaches L4');
  assert.equal(a.localRunIsHonest(), true, 'the local run is honest');
});

test('deferred requirements are disclosed, not hidden', () => {
  const def = a.deferred();
  assert.ok(def.length >= 1, 'at least one deferred requirement is disclosed');
  assert.ok(def.join(' ').toLowerCase().includes('witness'), 'the witness quorum is disclosed as deferred');
});

test('every generated artifact is mainnet-disabled', () => {
  const arts = a.artifacts();
  assert.equal(arts.length, 5, 'all five artifacts are present');
  for (const art of arts) {
    assert.equal(art.mainnetDisabled, true, `artifact ${art.format} is mainnet-disabled`);
  }
});

test('the assurance label is honest about local L0', () => {
  const label = a.assuranceLabel();
  assert.ok(label.includes('Locally verified'), 'a local run is labeled locally verified');
  assert.ok(label.includes('Live L0 not checked'), 'a local run discloses L0 was not checked');
});
