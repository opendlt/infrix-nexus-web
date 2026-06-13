// plan-12 — Shareable Proof Receipt smoke test (no browser).
//
// Proves the browser twin (lib/receipt.js) reads the Go-generated fixture and
// reports honest results: the receipt comes from the verifier, never trusts the
// node, discloses what was not verified, gives an independent verification
// command, and a local receipt never claims L0/L4.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

const m = await import(pathToFileURL(path.join(webRoot, 'lib', 'receipt.js')).href);
const fixture = JSON.parse(fs.readFileSync(path.join(webRoot, 'testdata', 'receipt.fixture.json'), 'utf8'));
m.setReceiptData(fixture);

test('the receipt passes the honesty rails', () => {
  assert.equal(m.receiptIsHonest(), true, 'the receipt is honest');
  const r = m.receipt();
  assert.equal(r.source, 'verifykit', 'assurance from the verifier');
  assert.equal(r.nodeTrusted, false, 'node never trusted');
});

test('the receipt is better than a block explorer: it discloses and is verifiable', () => {
  const r = m.receipt();
  assert.ok((r.whatVerified || []).length > 0, 'states what was verified');
  assert.ok((r.whatNotVerified || []).length > 0, 'discloses what was not verified');
  assert.ok(r.independentCommand && r.independentCommand.length > 0, 'gives an independent verification command');
  assert.ok(r.l0AnchorStatus && r.witnessStatus, 'states the L0 anchor and witness status');
  assert.ok(r.downloadBundle && r.embedWidget, 'offers a download bundle and an embed widget');
});

test('a local receipt never claims L0/L4', () => {
  const r = m.receipt();
  assert.equal(r.l0Verified, false, 'no L0 confirmation on a local run');
  assert.ok(!String(r.assuranceLevel).toUpperCase().includes('L4'), 'no L4 on a local run');
});
