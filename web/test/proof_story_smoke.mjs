// nextux-02 — in-browser proof-story verifier smoke test (no browser).
//
// Verifies the checked-in sample story bundle in-process (the same code path the
// Scenario Builder runs in the browser), and proves it CATCHES tampering, an
// unmanifested file, and an L4 overclaim.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { webcrypto } from 'node:crypto';

if (typeof globalThis.crypto === 'undefined') globalThis.crypto = webcrypto;

const here = path.dirname(fileURLToPath(import.meta.url));
const ps = await import(pathToFileURL(path.join(here, '..', 'lib', 'proofStory.js')).href);

function loadBundle() {
  const p = path.join(here, '..', 'testdata', 'sample.infrixstory.bundle.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

test('the checked-in sample story verifies in-browser', async () => {
  const bundle = loadBundle();
  const res = await ps.verifyShareBundle(bundle);
  assert.ok(res.ok, JSON.stringify(res.checks, null, 2));
});

test('a tampered artifact fails the manifest check', async () => {
  const bundle = loadBundle();
  // Corrupt the receipt file's base64 contents.
  bundle.files['receipt.infrix.json'] = Buffer.from('{"tampered":true}').toString('base64');
  const res = await ps.verifyShareBundle(bundle);
  assert.equal(res.ok, false);
  assert.ok(res.checks.some((c) => c.name === 'manifest' && !c.ok));
});

test('an unmanifested artifact is rejected', async () => {
  const bundle = loadBundle();
  bundle.files['extra.infrix.json'] = Buffer.from('{}').toString('base64');
  const res = await ps.verifyShareBundle(bundle);
  assert.equal(res.ok, false);
  assert.ok(res.checks.some((c) => c.name.startsWith('unmanifested:')));
});

test('an L4 claim without l0Verified is rejected as overclaiming', async () => {
  const bundle = loadBundle();
  bundle.story.assurance.proofLevel = 'L4';
  const res = await ps.verifyShareBundle(bundle);
  assert.equal(res.ok, false);
  assert.ok(res.checks.some((c) => c.name === 'honesty:l4' && !c.ok));
});

test('a Cinema binding mismatch is rejected', async () => {
  const bundle = loadBundle();
  bundle.story.cinemaBinding = 'deadbeef';
  const res = await ps.verifyShareBundle(bundle);
  assert.equal(res.ok, false);
  assert.ok(res.checks.some((c) => c.name === 'cinema-binding' && !c.ok));
});
