// RUNBOOK-06 Task 7 (WCAG 1.4.3 Contrast Minimum) — a dependency-free contrast
// auditor for the design tokens in styles.css.
//
// It parses the per-theme custom-property blocks (:root[data-theme="…"]) and
// checks every text token against every surface it can render on, asserting the
// WCAG 2.1 AA 4.5:1 minimum for normal text. Run it directly for a report:
//
//     node web/test/tools/contrast.mjs
//
// or import { auditThemes } from it (web/test/contrast_smoke.mjs does, so the
// thresholds are enforced by `node --test`). Exits non-zero on any failure.
//
// This is a token-level guard, not a substitute for axe/Lighthouse on the live
// DOM (component-level overrides aren't covered) — see the runbook for CI notes.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const STYLES = path.resolve(here, '..', '..', 'styles.css');

// --- color math (sRGB → relative luminance → WCAG contrast ratio) ---

export function hexToRgb(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`not a hex color: ${hex}`);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function channelLuminance(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

export function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

// --- token extraction ---

// Pull the `--name: #hex;` declarations out of a single theme's rule block.
// Only solid hex tokens are kept (rgba()/var()/gradients are skipped — they
// aren't a flat fg/bg this static check can reason about).
function parseBlock(css, selector) {
  const start = css.indexOf(selector);
  if (start < 0) return null;
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  if (open < 0 || close < 0) return null;
  const body = css.slice(open + 1, close);
  const tokens = {};
  const re = /(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g;
  let m;
  while ((m = re.exec(body))) tokens[m[1]] = m[2];
  return tokens;
}

export function parseThemes(css = readFileSync(STYLES, 'utf8')) {
  return {
    dark: parseBlock(css, ':root[data-theme="dark"]'),
    light: parseBlock(css, ':root[data-theme="light"]'),
    contrast: parseBlock(css, ':root[data-theme="contrast"]'),
  };
}

// --- the audit ---

const AA_NORMAL = 4.5;

// Text tokens used for real (≥ normal-size) copy must clear AA against every
// surface they can sit on. The lightest/darkest surface is the worst case, so
// checking all of them covers it.
const TEXT_TOKENS = ['--text', '--text-secondary', '--text-dim'];
const SURFACE_TOKENS = ['--bg', '--bg-alt', '--surface', '--surface-alt', '--surface-hover'];

// --accent doubles as a button background with --bg-colored text; verify that
// pairing too (it failed AA before RUNBOOK-05 bumped the accent).
const FG_ON_ACCENT = '--bg';

export function auditThemes(themes = parseThemes()) {
  const failures = [];
  const checks = [];
  for (const [name, tokens] of Object.entries(themes)) {
    if (!tokens) { failures.push({ theme: name, error: 'theme block not found' }); continue; }
    for (const t of TEXT_TOKENS) {
      if (!tokens[t]) continue;
      for (const s of SURFACE_TOKENS) {
        if (!tokens[s]) continue;
        const ratio = contrastRatio(tokens[t], tokens[s]);
        const rec = { theme: name, fg: t, bg: s, fgHex: tokens[t], bgHex: tokens[s], ratio, min: AA_NORMAL, pass: ratio >= AA_NORMAL };
        checks.push(rec);
        if (!rec.pass) failures.push(rec);
      }
    }
    if (tokens['--accent'] && tokens[FG_ON_ACCENT]) {
      const ratio = contrastRatio(tokens[FG_ON_ACCENT], tokens['--accent']);
      const rec = { theme: name, fg: FG_ON_ACCENT, bg: '--accent (button bg)', fgHex: tokens[FG_ON_ACCENT], bgHex: tokens['--accent'], ratio, min: AA_NORMAL, pass: ratio >= AA_NORMAL };
      checks.push(rec);
      if (!rec.pass) failures.push(rec);
    }
  }
  return { checks, failures };
}

// --- CLI ---

const isMain = (() => {
  try { return fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || ''); }
  catch { return false; }
})();

if (isMain) {
  const { checks, failures } = auditThemes();
  const fmt = (r) => `${r.ratio.toFixed(2)}:1`;
  for (const c of checks) {
    const mark = c.pass ? 'PASS' : 'FAIL';
    console.log(`[${mark}] ${c.theme.padEnd(8)} ${c.fg} on ${c.bg.padEnd(22)} ${c.fgHex} / ${c.bgHex}  ${fmt(c)}`);
  }
  console.log(`\n${checks.length} pairs checked, ${failures.length} below ${AA_NORMAL}:1.`);
  if (failures.length) {
    console.error('\nWCAG AA contrast failures:');
    for (const f of failures) console.error(`  ${f.theme} ${f.fg} on ${f.bg}: ${f.error || fmt(f) + ' < ' + f.min + ':1'}`);
    process.exit(1);
  }
}
