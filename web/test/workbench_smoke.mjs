// nextux-06 — Intent Copilot Workbench smoke test (no browser).
//
// Proves the browser twin (lib/workbench.js) reads the Go-generated workbench
// fixture and exposes the same grounded plan + honest refusal the CLI + SDK use,
// and that the code-enforced safety invariants hold (never mainnet, refusals
// select nothing, every refusal carries a safe alternative, no invented selection).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

const wb = await import(pathToFileURL(path.join(webRoot, 'lib', 'workbench.js')).href);
const fixture = JSON.parse(fs.readFileSync(path.join(webRoot, 'testdata', 'workbench.fixture.json'), 'utf8'));
wb.setWorkbenchData(fixture);

test('the ask plan selects the grounded regulated-escrow task', () => {
  const plan = wb.askPlan();
  assert.ok(plan.selected, 'expected a selection');
  assert.equal(plan.selected.kind, 'task');
  assert.equal(plan.selected.id, 'infrix/regulated-escrow');
  assert.ok(plan.planHash.startsWith('sha256:'), 'plan must be hash-bound');
  assert.ok(wb.isActionable(plan));
});

test('every candidate is grounded with a sane confidence', () => {
  const plan = wb.askPlan();
  assert.ok((plan.candidates || []).length > 0, 'expected candidates');
  for (const c of plan.candidates) {
    assert.ok(c.id && c.kind && c.title, `candidate missing fields: ${JSON.stringify(c)}`);
    assert.ok(c.confidence >= 0 && c.confidence <= 1, `${c.id} confidence out of range`);
  }
});

test('the ask plan satisfies the workbench safety invariants', () => {
  assert.deepEqual(wb.verifyPlanHonesty(wb.askPlan()), []);
  assert.equal(wb.askPlan().safety.mainnetWrite, false);
  assert.notEqual(wb.askPlan().network, 'mainnet');
});

test('the refusal plan fails closed with a safe alternative', () => {
  const plan = wb.refusalPlan();
  assert.equal(wb.isRefused(plan), true);
  assert.equal(wb.isActionable(plan), false);
  assert.ok(!plan.selected, 'a refused plan must not select a capability');
  assert.ok((plan.refusals || []).some((r) => r.code === 'overclaim_l4_without_l0'));
  for (const r of plan.refusals) {
    assert.ok(r.safeAlternative && r.safeAlternative.length > 0, `${r.code} missing a safe alternative`);
  }
  assert.deepEqual(wb.verifyPlanHonesty(plan), []);
});

test('kind badges are honest (task is the front-door positive)', () => {
  assert.equal(wb.kindBadge('task').role, 'positive');
  assert.ok(wb.kindBadge('scenario').glyph);
  assert.ok(wb.kindBadge('action').glyph);
});
