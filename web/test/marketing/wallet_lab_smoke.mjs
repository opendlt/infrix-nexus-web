// plan-35 §6 — Wallet certification lab smoke test (no browser).
//
// Proves the operator wallet-lab surface reads the fixture and reports honestly:
// every required provider row is present, each row carries a LEVEL (not just
// PASS/pending), a pending row shows no evidence and no PASS, a verify command is
// always offered, and the lab never shows an overclaimed level (a level L3+ with
// no backing evidence hash).

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..', '..');

const m = await import(pathToFileURL(path.join(webRoot, 'marketing', 'lib', 'walletLab.js')).href);
const fixture = JSON.parse(fs.readFileSync(path.join(webRoot, 'testdata', 'wallet-lab.fixture.json'), 'utf8'));
m.setWalletLabData(fixture);

test('the required provider matrix is present, each row with a level', () => {
  const rows = m.providers();
  assert.ok(rows.length >= 4, 'at least the four required provider rows');
  const want = ['MetaMask|Chrome', 'MetaMask|Edge', 'Rabby|Chrome', 'Brave Wallet|Brave'];
  const have = rows.map((r) => r.provider + '|' + r.browser);
  for (const w of want) {
    assert.ok(have.includes(w), 'matrix includes ' + w);
  }
  for (const r of rows) {
    assert.match(r.level, /^L[0-5]$/, 'row carries a certification level: ' + r.provider);
    assert.ok(r.verifyCommand.length > 0, 'row offers a verify command: ' + r.provider);
  }
});

test('a pending row shows no evidence and is not a PASS', () => {
  for (const r of m.providers()) {
    if (r.result === 'pending') {
      assert.equal(r.evidenceHash, '', 'pending row has no evidence hash');
      assert.notEqual(r.result, 'PASS', 'pending row is not PASS');
      assert.equal(r.level, 'L0', 'a pending row certifies at L0');
    }
  }
});

test('the lab never shows an overclaimed level (L3+ without evidence)', () => {
  assert.equal(m.hasOverclaim(), false, 'no row claims L3+ without a backing evidence hash');
  assert.equal(m.certifiedProviders().length, 0, 'no provider is certified yet (honest pending state)');
});

test('the provenance note states the generated-from-sealed-bundles discipline', () => {
  assert.match(m.generatedNote(), /sealed/i, 'note explains rows come from sealed bundles');
});
