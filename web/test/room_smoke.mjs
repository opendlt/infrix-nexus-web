// nextux-14 — Multiplayer Demo Rooms smoke test (no browser).
//
// Proves the browser twin (lib/roomClient.js) reads the Go-generated room
// fixture and reports honest results: a viewer can never approve, an
// undelegated agent can never approve, the private payload is hidden from
// unauthorized roles, the local room's proof never claims L4 / live L0 / node
// trust, and the shared replay binds to the event log.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

const c = await import(pathToFileURL(path.join(webRoot, 'lib', 'roomClient.js')).href);
const fixture = JSON.parse(fs.readFileSync(path.join(webRoot, 'testdata', 'room.fixture.json'), 'utf8'));
c.setRoomData(fixture);

test('the room loads with participants, roles, and required approvals', () => {
  assert.ok(c.participants().length >= 3, 'the room has several participants');
  assert.equal(c.roles().length, 7, 'all seven role policies are present');
  assert.ok(c.requiredApprovals().length >= 1, 'the room has required approvals');
});

test('a viewer can never approve and an undelegated agent can never approve', () => {
  const viewer = c.participants().find((p) => p.role === 'viewer');
  assert.ok(viewer, 'a viewer is present');
  assert.equal(viewer.canApprove, false, 'a viewer must not be able to approve');

  const agent = c.participants().find((p) => p.role === 'ai_assistant');
  assert.ok(agent, 'an AI assistant is present');
  if (!agent.delegated) {
    assert.equal(agent.canApprove, false, 'an undelegated agent must not be able to approve');
  }
});

test('the private payload is hidden from unauthorized roles', () => {
  assert.equal(c.canSeePrivatePayload('witness'), false, 'a witness must not see the private payload');
  assert.equal(c.canSeePrivatePayload('viewer'), false, 'a viewer must not see the private payload');
  assert.equal(c.canSeePrivatePayload('regulator'), true, 'a regulator may see the disclosed private payload');
});

test('a local room never claims L4, live L0, or node trust', () => {
  const r = c.room();
  const a = r.proof.assurance;
  assert.ok(!/l4/i.test(a.proofLevel), 'a local room must not claim L4');
  assert.equal(a.l0Verified, false, 'a local room must not claim live L0');
  assert.equal(a.trustsInfrixNode, false, 'a room must never trust the node');
  assert.equal(c.proofIsHonest(), true, 'the room proof must satisfy the honesty rails');
});

test('the shared replay binds to the event log', () => {
  assert.equal(c.replayBoundToLog(), true, 'the replay must bind to the event-log head');
  const rp = c.replay();
  const evs = c.events();
  assert.equal(rp.eventLogHash, evs[evs.length - 1].hash, 'the binding is the last event hash');
});
