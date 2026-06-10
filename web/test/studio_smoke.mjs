// nextux-12 — Visual Workflow Studio smoke test (no browser).
//
// Proves the browser twin (lib/studioGraph.js) reads the Go-generated studio
// fixture and reports honest results: a local flow caps at L3 (never L4), a
// simulation never trusts the node and is never a live proof, every export is
// validated + safe, and the generated SDK snippet never skips approval or
// dry-run.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

const s = await import(pathToFileURL(path.join(webRoot, 'lib', 'studioGraph.js')).href);
const fixture = JSON.parse(fs.readFileSync(path.join(webRoot, 'testdata', 'studio.fixture.json'), 'utf8'));
s.setStudioData(fixture);

test('the flow loads with its nodes, edges, and a valid validation report', () => {
  assert.ok(s.nodes().length >= 3, 'the flow has several nodes');
  assert.ok(s.edges().length >= 1, 'the flow has edges');
  assert.equal(s.validation().valid, true, 'the starter flow is valid');
});

test('a local simulation caps at L3 — never L4, never node-trusted, never live', () => {
  const sim = s.simulation();
  assert.ok(sim, 'a simulation is present');
  assert.equal(sim.simulated, true, 'a simulation is marked simulated');
  assert.equal(sim.nodeTrusted, false, 'a simulation never trusts the node');
  assert.notEqual(sim.proofLevelCap, 'L4', 'a local flow never previews L4');
  assert.equal(sim.proofLevelCap, 'L3', 'a local governed proof caps at L3');
  assert.equal(s.isHonest(), true, 'the simulation satisfies the honesty invariants');
});

test('the assurance badge does not overclaim a live proof', () => {
  const badge = s.assuranceBadge();
  assert.ok(!/l4|fully verified/i.test(badge.label), `badge must not overclaim: ${badge.label}`);
  assert.match(badge.label, /simulated/i, 'the badge states it is a simulation');
});

test('every export is validated and the generated SDK is safe by construction', () => {
  const ex = s.exportsMap();
  for (const fmt of ['scenario', 'task', 'sdk-ts', 'agent-plan', 'markdown']) {
    assert.ok(ex[fmt], `export ${fmt} is present`);
    assert.equal(ex[fmt].validation.valid, true, `export ${fmt} is validated`);
    assert.equal(ex[fmt].safety.mainnetDisabled, true, `export ${fmt} disables mainnet`);
    assert.equal(ex[fmt].safety.nodeTrusted, false, `export ${fmt} does not trust the node`);
    assert.ok((ex[fmt].verifierCommand || '').trim().length > 0, `export ${fmt} carries a verifier command`);
  }
  assert.equal(s.generatedSdkIsSafe(), true, 'the generated SDK snippet dry-runs + approves before running');
});
