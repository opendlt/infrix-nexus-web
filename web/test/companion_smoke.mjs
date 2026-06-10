// nextux-10 — Zero-Context Local Companion smoke test (no browser).
//
// Proves the browser twin (lib/companion.js) reads the Go-generated companion
// context, reports honest verification status (a "not verified yet" default),
// and exposes the read-only suggestions + allowed actions.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

const cp = await import(pathToFileURL(path.join(webRoot, 'lib', 'companion.js')).href);
const fixture = JSON.parse(fs.readFileSync(path.join(webRoot, 'testdata', 'companion.fixture.json'), 'utf8'));
cp.setCompanionData(fixture);

test('the companion context loads with artifacts, suggestions, and allowed actions', () => {
  assert.ok(cp.artifacts().length >= 3, 'indexed artifacts');
  assert.ok(cp.suggestions().length >= 3, 'suggestions');
  assert.ok(cp.allowedActions().length > 0, 'read-only allowed actions');
});

test('status is honest — unverified artifacts read "not verified yet"', () => {
  assert.equal(cp.statusWords('unverified'), 'not verified yet');
  assert.equal(cp.statusWords('verified'), 'verified');
  const c = cp.counts();
  assert.ok(c.unverified >= 1, 'a not-yet-verified artifact is present');
  assert.ok(c.verified >= 1, 'a verified artifact is present');
});

test('every suggestion carries reason, command, risk, approval, and docs', () => {
  for (const s of cp.suggestions()) {
    assert.ok(s.title && s.reason && s.command && s.docs, `incomplete suggestion: ${JSON.stringify(s)}`);
    assert.ok(s.riskLevel === 'read_only' || s.riskLevel === 'local_write');
    if (s.riskLevel === 'local_write') {
      assert.equal(s.needsApproval, true, 'a write suggestion must need approval');
    }
  }
});

test('the allowed actions are read-only (no mutating action leaks in)', () => {
  for (const a of cp.allowedActions()) {
    assert.ok(!/publish|execute|signDecision|requestSession|\.apply|\.package|\.make/i.test(a), `mutating action in allowedActions: ${a}`);
  }
});

test('the resume line names the most recent artifact', () => {
  assert.match(cp.resumeLine(), /You were working on/);
});
