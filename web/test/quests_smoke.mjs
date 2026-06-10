// nextux-11 — Proof Quest Mode smoke test (no browser).
//
// Proves the browser twin (lib/quests.js) reads the Go-generated quest fixture,
// reports honest badges (a local proof is L3, never L4; a learning step is not a
// proof), and exposes the progress trail + receipt the view renders.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

const q = await import(pathToFileURL(path.join(webRoot, 'lib', 'quests.js')).href);
const fixture = JSON.parse(fs.readFileSync(path.join(webRoot, 'testdata', 'quests.fixture.json'), 'utf8'));
q.setQuestData(fixture);

test('the quest trail loads with the ten missions and a catalog', () => {
  assert.equal(q.trail().length, 10, 'ten quests in the trail');
  assert.equal(q.catalog().length, 10, 'ten quests in the catalog');
  for (const id of ['first-proof', 'verify-without-node', 'kermit-l0-upgrade']) {
    assert.ok(q.questById(id), `trail has ${id}`);
  }
});

test('progress counts are honest', () => {
  const c = q.counts();
  assert.ok(c.total === 10, 'total is ten');
  assert.ok(c.completed >= 1 && c.completed <= 10, 'completed within range');
});

test('a local proof receipt is an honest L3 — verified, no node trust, never L4', () => {
  const rc = q.receipt();
  assert.ok(rc && rc.proof, 'a proof receipt is present');
  assert.equal(rc.proof.verified, true, 'the proof verified');
  assert.equal(rc.proof.trustsNode, false, 'the node was not trusted');
  assert.equal(rc.proof.l0Verified, false, 'no live L0 was claimed locally');
  assert.ok(!/L4/i.test(rc.proof.proofLevel || ''), 'a local proof never claims L4');
});

test('proofBadge never mints L4 / "Fully verified" for a local proof', () => {
  const badge = q.proofBadge();
  assert.ok(!/L4|fully verified/i.test(badge.label), `badge must not overclaim: ${badge.label}`);
  assert.ok(/locally verified|live L0/i.test(badge.label), 'badge states the honest scope');
});

test('a learning mission is not reported as a verified proof', () => {
  const learn = q.trail().flatMap((quest) => quest.missions).find((m) => m.learning);
  if (learn) {
    assert.ok(!/verified L[0-9]/i.test(q.missionStateWord(learn)), 'a learning step is not a proof');
    assert.match(q.missionStateWord(learn), /learned/i);
  }
});

test('the next quest is the first incomplete, unlocked quest (or none)', () => {
  const next = q.nextQuestId();
  if (next) {
    const entry = q.questById(next);
    assert.ok(entry, 'next quest resolves');
    assert.equal(entry.completed, false, 'next quest is not already complete');
    assert.equal(entry.locked, false, 'next quest is unlocked');
  }
});
