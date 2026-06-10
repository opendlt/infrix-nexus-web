// nextux-15 — Migration & Comparison Lab smoke test (no browser).
//
// Proves the browser twin (lib/compare.js) reads the Go-generated compare
// fixture and reports honest results: the catalog carries the eight patterns,
// every external claim in the worked report carries a source/date or is marked
// an assumption, every Infrix claim is backed, every cost line carries a basis
// (no invented numbers), and the report passes the honesty rails.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');

const c = await import(pathToFileURL(path.join(webRoot, 'lib', 'compare.js')).href);
const fixture = JSON.parse(fs.readFileSync(path.join(webRoot, 'testdata', 'compare.fixture.json'), 'utf8'));
c.setCompareData(fixture);

test('the catalog carries the eight patterns, each mapped to an Infrix equivalent', () => {
  const ps = c.patterns();
  assert.equal(ps.length, 8, 'all eight patterns are present');
  for (const p of ps) {
    assert.ok(p.infrixEquivalent && p.infrixEquivalent.length > 0, `pattern ${p.id} maps to an Infrix equivalent`);
  }
});

test('every external claim in the worked report is sourced/dated or an assumption', () => {
  const r = c.report();
  assert.ok(r, 'a worked report is present');
  for (const claim of r.claims) {
    if (c.isExternalClaim(claim)) {
      assert.ok(claim.source, `external claim has a source: ${claim.text}`);
      assert.ok(claim.source.assumption || claim.source.date, `external claim is dated or an assumption: ${claim.text}`);
    } else {
      assert.ok(claim.backedBy, `Infrix claim is backed: ${claim.text}`);
    }
  }
});

test('every cost line carries an explicit basis (no invented numbers)', () => {
  const r = c.report();
  assert.ok(r.costComparison.length >= 1, 'the report has a cost estimate');
  for (const cost of r.costComparison) {
    assert.ok(cost.basis && cost.basis.length > 0, `cost line ${cost.label} carries a basis`);
  }
});

test('the worked report satisfies the honesty rails', () => {
  assert.equal(c.reportIsHonest(), true, 'the report is honest');
  // The report maps ethereum-multisig to a real Infrix scenario.
  assert.equal(c.report().infrixEquivalent, 'regulated-escrow');
});
