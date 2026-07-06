// RUNBOOK-04 Task 6 (Gate 0) — the paste placeholder must advertise the version
// the verifier actually accepts. The old "3" placeholder produced an instant
// "version mismatch" for anyone who typed the example.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadVerifier, loadFixture } from './_verifier_harness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

test('the paste placeholder advertises the version the verifier requires', () => {
  const src = fs.readFileSync(path.join(webRoot, 'views', 'prove.js'), 'utf8');
  // The placeholder line (not a comment) must say version "4".
  assert.match(src, /placeholder = '\{ "version": "4"/, 'placeholder must advertise version "4"');
  assert.ok(!/placeholder = '\{ "version": "3"/.test(src), 'placeholder must not advertise the rejected version "3"');
});

// Pass-17 audit P1-6: the smoke previously only covered prove.js, so the nested
// Operate-console Verify tab (views/verify.js) kept advertising the rejected
// "version":"3" placeholder. This test covers EVERY live verifier UI: any view
// whose paste placeholder pins a bundle version must pin the accepted version
// ("4"), and none may advertise the rejected "3".
test('every live verifier UI advertises the accepted version, not the rejected one', () => {
  const viewsDir = path.join(webRoot, 'views');
  const views = fs.readdirSync(viewsDir).filter((f) => f.endsWith('.js'));
  // The nested Operate-console Verify tab must be among the checked surfaces.
  assert.ok(views.includes('verify.js'), 'views/verify.js (Operate console Verify tab) must exist and be covered');

  const placeholderVersion = /placeholder\s*=\s*'\{\s*"version":\s*"(\d+)"/;
  let checkedAny = false;
  for (const file of views) {
    const src = fs.readFileSync(path.join(viewsDir, file), 'utf8');
    // No live verifier UI may advertise the rejected "3" in a placeholder.
    assert.ok(
      !/placeholder\s*=\s*'\{\s*"version":\s*"3"/.test(src),
      `${file} must not advertise the rejected bundle version "3" in its paste placeholder`,
    );
    const m = src.match(placeholderVersion);
    if (m) {
      checkedAny = true;
      assert.equal(m[1], '4', `${file} paste placeholder must advertise the accepted version "4", got "${m[1]}"`);
    }
  }
  assert.ok(checkedAny, 'at least one verifier UI must pin a bundle version in its placeholder');
});

test('portable verifier rejects version "3" and accepts version "4"', async () => {
  const v = await loadVerifier();

  const bad = await v.verifyPortablePackage({ version: '3', bundleData: '' });
  const verCheckBad = bad.checks.find((c) => c.name === 'version');
  assert.ok(verCheckBad, 'a version check runs');
  assert.equal(verCheckBad.passed, false, 'version "3" fails the version check');
  assert.equal(bad.passed, false);

  // The checked-in Go-generated fixture is v4 and its version check passes.
  const { pkg } = loadFixture();
  assert.equal(pkg.version, '4', 'fixture is v4');
  const good = await v.verifyPortablePackage(pkg);
  const verCheckGood = good.checks.find((c) => c.name === 'version');
  assert.ok(verCheckGood && verCheckGood.passed, 'the v4 fixture passes the version check');
});
