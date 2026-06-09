// nextux-02 — Scenario Builder helpers smoke test (no browser).
//
// Verifies the template catalog, the "what do you want to prove" entry choices,
// and the client-side structural validator that gives the builder instant
// feedback.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = await import(pathToFileURL(path.join(here, '..', 'lib', 'scenarioBuilder.js')).href);

test('the eight built-in templates and entry choices load', () => {
  assert.equal(lib.TEMPLATE_SUMMARIES.length, 8);
  for (const id of ['regulated-escrow', 'witness-quorum', 'ai-agent-approved-workflow']) {
    assert.ok(lib.templateById(id), `template ${id} present`);
  }
  assert.ok(lib.ENTRY_CHOICES.length >= 5, 'at least five entry choices');
  for (const c of lib.ENTRY_CHOICES) {
    assert.ok(lib.templateById(c.templateId), `entry choice maps to a real template: ${c.templateId}`);
  }
});

test('validateScenarioShape accepts a good scenario and rejects bad ones', () => {
  const good = {
    version: 1, id: 'x', title: 'x', network: 'local',
    actors: { buyer: { kind: 'user' } },
    policy: {}, steps: [{ id: 's', action: 'a', actor: 'buyer' }], proof: {},
  };
  assert.deepEqual(lib.validateScenarioShape(good), []);

  const badActor = { ...good, steps: [{ id: 's', action: 'a', actor: 'ghost' }] };
  assert.ok(lib.validateScenarioShape(badActor).some((e) => /unknown actor/.test(e)));

  const mainnet = { ...good, network: 'mainnet' };
  assert.ok(lib.validateScenarioShape(mainnet).some((e) => /mainnet/.test(e)));

  const noAuthority = {
    ...good,
    actors: { owner: { kind: 'user' } },
    policy: { disclosure: { encryptedAtRest: true, regulatorCanView: ['invoice'] } },
  };
  assert.ok(lib.validateScenarioShape(noAuthority).some((e) => /disclosureAuthority/.test(e)));
});

test('assurancePreview is honest about local vs kermit', () => {
  assert.match(lib.assurancePreview('regulated-escrow', 'local'), /L3/);
  assert.match(lib.assurancePreview('regulated-escrow', 'local'), /never claims L4/);
  assert.match(lib.assurancePreview('regulated-escrow', 'kermit'), /L4/);
});
