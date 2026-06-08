// Nexus browser-verifier acceptance test (Priority 03).
//
// Proves the browser verifier accepts the checked-in, Go-generated portable
// fixture from a CLEAN checkout — no user-specific temp path, no manual
// staging. Run with: node --test pkg/nexus/web/test/*.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  loadVerifier,
  loadFixture,
  manifestPath,
  sha256Hex,
  usingDefaultFixture,
} from './_verifier_harness.mjs';

test('browser verifier accepts the checked-in portable fixture', async () => {
  const { pkg } = loadFixture();
  const v = await loadVerifier();
  try {
    const result = await v.verifyPortablePackage(pkg);
    if (!result.passed) {
      for (const c of result.checks) {
        if (!c.passed) console.error(`  ✗ ${c.name}: ${c.detail || c.error || ''}`);
      }
    }
    assert.equal(result.passed, true, 'browser verifier must accept the Go-generated fixture');
    // Every check must have run + passed (no silently skipped checks).
    assert.ok(result.checks.length >= 10, `expected >=10 checks, got ${result.checks.length}`);
    for (const c of result.checks) {
      assert.equal(c.passed, true, `check ${c.name} must pass`);
    }
  } finally {
    v.cleanup();
  }
});

test('fixture integrity matches the manifest sha256', () => {
  if (!usingDefaultFixture()) return; // manifest pins the default fixture only
  const { bytes } = loadFixture();
  const manifest = JSON.parse(fs.readFileSync(manifestPath(), 'utf8'));
  for (const key of ['fixture', 'sha256', 'generatedBy', 'portableVersion', 'goVerifier', 'browserVerifier']) {
    assert.ok(manifest[key] !== undefined, `manifest must declare ${key}`);
  }
  assert.equal(sha256Hex(bytes), manifest.sha256, 'fixture bytes must hash to the manifest sha256');
  assert.equal(manifest.portableVersion, '4', 'manifest must record the portable version');
  assert.equal(manifest.goVerifier, 'passed');
  assert.equal(manifest.browserVerifier, 'passed');
});
