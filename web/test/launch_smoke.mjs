// plan-12 — Public Launch Page smoke test (no browser).
//
// Proves the browser twin (lib/launch.js) reads the Go-generated launch fixture
// and reports honest results: the hero path is present (prompt, three examples,
// the build action, an honest receipt preview), every required below-fold
// section exists, the claim boundary is stated, and the five "what we do not
// claim" boundaries are present.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

const m = await import(pathToFileURL(path.join(webRoot, 'lib', 'launch.js')).href);
const fixture = JSON.parse(fs.readFileSync(path.join(webRoot, 'testdata', 'launch.fixture.json'), 'utf8'));
m.setLaunchData(fixture);

test('the hero carries the prompt path: three examples + the build action', () => {
  const h = m.hero();
  assert.ok(h.headline && h.subhead, 'hero has a headline and subhead');
  assert.equal((h.examplePrompts || []).length, 3, 'three example prompts');
  assert.ok(/new verifiable-app/.test(h.primaryAction.command), 'primary action builds a verifiable app');
  assert.ok((h.cinemaPreview.frames || []).length > 0, 'cinema preview has frames');
});

test('the proof receipt preview passes the honesty rails', () => {
  assert.equal(m.receiptIsHonest(), true, 'the previewed receipt is honest');
  const r = m.receiptPreview();
  assert.equal(r.source, 'verifykit', 'assurance from the verifier');
  assert.equal(r.nodeTrusted, false, 'node never trusted');
  assert.equal(r.l0Verified, false, 'a local preview does not claim L0');
});

test('every required below-fold section is present', () => {
  const ids = m.sections().map((s) => s.id);
  for (const id of ['verify-without-trust', 'l0-anchor', 'vs-conventional', 'developer-one-liner', 'agent-one-liner', 'wallet-status']) {
    assert.ok(ids.includes(id), `section ${id} present`);
  }
});

test('the claim boundary and the five non-claims are stated', () => {
  const cb = m.claimBoundary();
  assert.ok(cb.kermit && cb.mainnet, 'Kermit-vs-mainnet boundary present');
  const bs = m.boundaries();
  assert.equal(bs.length, 5, 'five boundaries');
  for (const b of bs) {
    assert.ok(b.weDoNotClaim && b.honest, `boundary ${b.id} states what we do not claim and the honest replacement`);
  }
});
