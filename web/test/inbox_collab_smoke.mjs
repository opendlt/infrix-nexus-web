// nextux-07 — Proof Inbox + Collaboration smoke test (no browser).
//
// Proves the browser twin (lib/inbox.js) reads the Go-generated inbox fixture
// and exposes the same redaction-safe summary + status lanes, and that the
// in-browser decision verifier reconstructs the exact canonical body pkg/inbox
// signs and re-checks the Ed25519 signature — trusting no node.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

const ib = await import(pathToFileURL(path.join(webRoot, 'lib', 'inbox.js')).href);
const fixture = JSON.parse(fs.readFileSync(path.join(webRoot, 'testdata', 'inbox.fixture.json'), 'utf8'));
ib.setInboxData(fixture);

test('the inbox fixture loads with verified, needs-review, and failed items', () => {
  const all = ib.items();
  assert.ok(all.length >= 3, 'expected at least three sample items');
  const lanes = new Set(all.map(ib.statusLane));
  assert.ok(lanes.has('approved'), 'an approved item');
  assert.ok(lanes.has('failed_verification'), 'a failed-verification item');
});

test('status lanes and isVerified are honest', () => {
  const approved = ib.itemById('inbox_escrow_release_01');
  assert.equal(ib.statusLane(approved), 'approved');
  assert.equal(ib.isVerified(approved), true);
  const failed = ib.itemById('inbox_tampered_story_03');
  assert.equal(ib.statusLane(failed), 'failed_verification');
  assert.equal(ib.isVerified(failed), false);
});

test('a Go-signed decision verifies in the browser twin (cross-language, no node trust)', async () => {
  const approved = ib.itemById('inbox_escrow_release_01');
  const verdicts = await ib.verifyItemDecisions(approved);
  assert.equal(verdicts.length, 1);
  assert.equal(verdicts[0].ok, true, JSON.stringify(verdicts[0].checks, null, 2));
  assert.equal(verdicts[0].bound, true, 'decision must bind the exact artifact hash');
});

test('a decision re-bound to a different artifact fails', async () => {
  const approved = ib.itemById('inbox_escrow_release_01');
  const tampered = JSON.parse(JSON.stringify(approved));
  tampered.artifactHash = 'sha256:deadbeef';
  const verdicts = await ib.verifyItemDecisions(tampered);
  assert.equal(verdicts[0].ok, false, 'a decision must not verify against a changed artifact');
});

test('the shared summary leaks no private payload', () => {
  const it = JSON.parse(JSON.stringify(ib.itemById('inbox_escrow_release_01')));
  it.comments = [{ id: 'c', author: 'a', body: 'PRIVATE_SECRET_XYZ', bodyHash: 'sha256:x', createdAt: 'now' }];
  const s = ib.summarize(it);
  assert.ok(!JSON.stringify(s).includes('PRIVATE_SECRET_XYZ'), 'summary must not leak a comment body');
  assert.equal(s.trustsNode, false, 'summary must surface that no node is trusted');
});
