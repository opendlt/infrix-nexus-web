// nextux-05 — Autopilot remediation smoke test (no browser).
//
// Proves the browser twin (lib/remediation.js) reads the Go-generated sample
// fixture and reports honestly: blocking findings, the auto-safe vs manual
// split (signer custody is external_required, never auto-safe), a dry-run diff
// that fixes the placeholder endpoint, and NO applied fix that demotes the
// profile or weakens a security requirement.

import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

const rem = await import(pathToFileURL(path.join(webRoot, 'lib', 'remediation.js')).href);

const fixture = JSON.parse(fs.readFileSync(path.join(webRoot, 'testdata', 'autopilot.fixture.json'), 'utf8'));
rem.setRemediationData(fixture);

{
  assert.ok(rem.findings().length > 0, 'expected findings');
  assert.ok(rem.blockingCount() > 0, 'expected blocking findings');
  console.log('✓ diagnosed plan has blocking findings');
}

{
  const auto = rem.autoSafeFindings();
  assert.ok(auto.length > 0, 'expected auto-safe findings');
  for (const f of auto) {
    const fix = rem.autoSafeFix(f);
    assert.ok(fix && fix.edit && Array.isArray(fix.edit.path), `${f.id} auto-safe fix needs an edit`);
  }
  const manual = rem.manualActions();
  assert.ok(manual.some((m) => m.fix.kind === 'external_required'), 'expected an external_required manual action (signer custody)');
  assert.ok(manual.every((m) => m.fix.kind !== 'auto_safe'), 'manual actions are never auto-safe');
  console.log('✓ auto-safe vs manual fixes are separated honestly');
}

{
  const rec = rem.receipt();
  assert.equal(rec.dryRun, true);
  assert.ok(rec.beforeStateHash && rec.afterStateHash && rec.beforeStateHash !== rec.afterStateHash, 'before/after state hashes differ');
  const ep = rec.appliedFixes.find((a) => a.path[a.path.length - 1] === 'endpoint');
  assert.ok(ep && /kermit\.accumulatenetwork\.io/.test(ep.newValue), 'endpoint fix sets Kermit');
  console.log('✓ dry-run receipt fixes the placeholder endpoint, with before/after hashes');
}

{
  const demotions = rem.findDemotions(rem.receipt(), rem.plan().profile);
  assert.deepEqual(demotions, [], 'no applied fix may demote the profile or weaken a security requirement');
  console.log('✓ no remediation demotes the profile / weakens a gate');
}

{
  // Honest fix badges: only auto_safe is "Infrix can do it".
  assert.equal(rem.fixBadge('auto_safe').role, 'positive');
  assert.equal(rem.fixBadge('operator_required').role, 'caution');
  assert.equal(rem.fixBadge('external_required').role, 'caution');
  console.log('✓ fix-kind badges are honest');
}

console.log('\n✓ All autopilot checks passed.');
