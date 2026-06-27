// RUNBOOK-06 Task 7 — enforce the WCAG AA contrast audit under `node --test`.
// The math + token parsing live in tools/contrast.mjs (also a CLI); this just
// asserts the live styles.css has zero sub-4.5:1 text/surface pairs, so a token
// edit that regresses contrast fails CI.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { auditThemes, contrastRatio, hexToRgb } from './tools/contrast.mjs';

test('contrast math matches known WCAG reference values', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF').toFixed(0), '21', 'black on white is 21:1');
  assert.equal(contrastRatio('#FFFFFF', '#FFFFFF').toFixed(0), '1', 'white on white is 1:1');
  assert.deepEqual(hexToRgb('#08090F'), { r: 8, g: 9, b: 15 });
  assert.deepEqual(hexToRgb('#fff'), { r: 255, g: 255, b: 255 }, '3-digit hex expands');
});

test('every theme token block is found', () => {
  const { checks, failures } = auditThemes();
  assert.ok(checks.length >= 30, `audited ${checks.length} pairs across the three themes`);
  for (const f of failures) assert.ok(!f.error, `theme block missing: ${f.theme} (${f.error})`);
});

test('all design-token text/surface pairs meet WCAG AA 4.5:1', () => {
  const { failures } = auditThemes();
  const msg = failures.map((f) => `${f.theme} ${f.fg} on ${f.bg}: ${f.ratio ? f.ratio.toFixed(2) + ':1' : f.error}`).join('\n  ');
  assert.equal(failures.length, 0, failures.length ? `contrast failures:\n  ${msg}` : '');
});
