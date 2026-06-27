// RUNBOOK-07 SP8 — lock the receipt fail-close contract that makes the
// in-browser L4 upgrade honest by construction: you cannot get an L4 badge
// without a real, recorded L0 confirmation (l0Verified + network + command).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href);

const { buildReceiptFromVerifier, validateReceipt } = await import('/lib/proofReceipt.js');

const PASS = { passed: true, checks: [{ name: 'anchor_proof', passed: true }] };

test('a complete L4 confirmation validates clean', () => {
  const r = buildReceiptFromVerifier(PASS, {
    subjectType: 'evidence', evidenceId: 'e1',
    l0Verified: true, proofLevel: 'L4',
    network: 'mainnet', command: 'accumulate tx get 0xabc',
    anchorTx: '0xabc', verifiedAt: new Date().toISOString(),
  });
  assert.equal(r.assurance.proofLevel, 'L4');
  assert.deepEqual(validateReceipt(r), [], 'no violations');
});

test('L4 without a verification.command is rejected → caller must fall back to L3', () => {
  const r = buildReceiptFromVerifier(PASS, {
    subjectType: 'evidence', evidenceId: 'e1',
    l0Verified: true, proofLevel: 'L4',
    network: 'mainnet', /* command omitted */
  });
  const errs = validateReceipt(r);
  assert.ok(errs.length > 0, 'validation catches the missing command');
  assert.ok(errs.some((e) => /command/i.test(e)), 'specifically the l0Verified-without-command rule');
});

test('L4 without l0Verified is impossible to validate', () => {
  // Force the label/level to claim L4 while l0Verified is false.
  const r = buildReceiptFromVerifier(PASS, { subjectType: 'evidence', proofLevel: 'L4', l0Verified: false, label: 'L4/G3' });
  const errs = validateReceipt(r);
  assert.ok(errs.some((e) => /L4 without l0Verified/i.test(e)));
});

test('the honest default without a cross-check is L3 and validates', () => {
  const r = buildReceiptFromVerifier(PASS, { subjectType: 'evidence', evidenceId: 'e1' });
  assert.equal(r.assurance.proofLevel, 'L3', 'no l0Verified → caps at L3');
  assert.deepEqual(validateReceipt(r), []);
});
