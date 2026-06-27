// RUNBOOK-04 Task 1 (Gate 0) — bulk-approve safety gate.
//
// The bulk path used to sign blind with {intentId, rationale} and no plan
// binding / no invalidator gate. The gate logic now lives in the pure
// approvalGate module (dep-free) so the safety contract is unit-tested directly:
// a blocked dossier must NOT produce governed.approve args, and a clean one must
// carry planHash + stageId + role. The source-level checks confirm the live
// inbox wires it and no window.prompt remains.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const read = (rel) => fs.readFileSync(path.join(webRoot, rel), 'utf8');
const { approvalCallFromDossier } = await import(
  pathToFileURL(path.join(webRoot, 'lib', 'approvalGate.js')).href
);

const cleanDossier = {
  plan: { stepCount: 3 },
  planHash: 'ph-abc',
  intentId: 'intent-1',
  invalidators: [{ severity: 'info', reason: 'note' }],
  remaining: [{ role: 'treasurer', stageId: 'stage-approve' }],
  requiredRoles: ['treasurer'],
};

test('a blocked dossier yields no governed.approve binding', () => {
  for (const inv of ['blocked', 'failed']) {
    const d = { ...cleanDossier, invalidators: [{ severity: inv, reason: 'r' }] };
    const call = approvalCallFromDossier(d, { intentId: 'intent-1' });
    assert.equal(call.blocked, true, `severity ${inv} must block`);
    assert.equal(call.planHash, undefined, 'no planHash leaks from a blocked call');
  }
  // No plan at all also blocks.
  assert.equal(approvalCallFromDossier({ planHash: 'x' }, {}).blocked, true);
  assert.equal(approvalCallFromDossier(null, {}).blocked, true);
});

test('a clean dossier binds planHash, stageId, and role', () => {
  const call = approvalCallFromDossier(cleanDossier, { intentId: 'intent-1' });
  assert.equal(call.blocked, false);
  assert.equal(call.planHash, 'ph-abc');
  assert.equal(call.stageId, 'stage-approve');
  assert.equal(call.role, 'treasurer');
  assert.equal(call.intentId, 'intent-1');
});

test('role falls back to requiredRoles[0] when remaining has no role', () => {
  const d = { ...cleanDossier, remaining: [{ stageId: 's1' }] };
  const call = approvalCallFromDossier(d, {});
  assert.equal(call.role, 'treasurer', 'falls back to requiredRoles[0]');
  assert.equal(call.stageId, 's1');
});

test('the live inbox wires the gate + full binding, and drops window.prompt', () => {
  const src = read('views/inbox.js');
  assert.match(src, /approvalCallFromDossier/, 'inbox uses the shared gate');
  assert.match(src, /nexus\.approvalDossier/, 'bulk approve fetches the dossier per item');
  assert.match(src, /planHash: call\.planHash/, 'governed.approve sends planHash');
  assert.match(src, /stageId: call\.stageId/, 'governed.approve sends stageId');
  assert.match(src, /role: call\.role/, 'governed.approve sends role');
  // No raw prompts/alerts (a comment mentioning the word is fine).
  assert.ok(!/window\.prompt\(|window\.alert\(/.test(src), 'no window.prompt/alert calls');
  assert.ok(!/(^|[^.\w])alert\(/m.test(src.replace(/\/\/.*$/gm, '')), 'no bare alert() calls');
});
