// Nexus — Migration & Comparison Lab data + honest helpers (nextux-15).
//
// Reads the Go-generated compare fixture (the pattern catalog + a worked report)
// and exposes the same honest, read-only view the CLI, SDK, and agent see. Every
// external claim carries a source/date or is marked an assumption, every cost
// line carries a basis (no invented numbers), and Infrix is never labeled
// "better" without a measured basis — the browser mirrors those rules.

let _data = null;

/** setCompareData injects the data (used by the no-browser smoke test). */
export function setCompareData(obj) {
  _data = obj;
}

/** getCompareData returns the loaded data. */
export function getCompareData() {
  if (!_data) throw new Error('compare: data not loaded — call loadCompare() first');
  return _data;
}

/** loadCompare fetches a live compare context if served, falling back to the
 *  deterministic fixture. */
export async function loadCompare(liveUrl = '/v1/compare/context', fixtureUrl = '/testdata/compare.fixture.json') {
  try {
    const res = await fetch(liveUrl, { cache: 'no-cache' });
    if (res.ok) {
      _data = await res.json();
      _data._live = true;
      return _data;
    }
  } catch (_) {
    /* no live compare endpoint — fall back to the fixture */
  }
  const res = await fetch(fixtureUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error('compare: failed to load ' + fixtureUrl + ' (' + res.status + ')');
  _data = await res.json();
  _data._live = false;
  return _data;
}

export function isLive() { return !!getCompareData()._live; }
export function patterns() { return getCompareData().patterns || []; }
export function report() { return getCompareData().report || null; }
export function capabilities() { return getCompareData().capabilities || []; }

/** isExternalClaim reports whether a claim is about another chain. */
export function isExternalClaim(c) {
  return !!c.about && c.about !== 'infrix';
}

/** claimSourced reports whether an external claim is properly sourced (a dated
 *  source or an explicit assumption); Infrix claims are backed by a capability. */
export function claimSourced(c) {
  if (isExternalClaim(c)) {
    if (!c.source) return false;
    return !!c.source.assumption || !!c.source.date;
  }
  return !!c.backedBy;
}

/** reportIsHonest reports whether the worked report respects the honesty rails:
 *  every external claim is sourced/dated or an assumption, every Infrix claim is
 *  backed, and every cost line carries a basis. This mirrors the Go validator. */
export function reportIsHonest() {
  const r = report();
  if (!r) return true;
  for (const c of r.claims || []) {
    if (!claimSourced(c)) return false;
  }
  for (const cost of r.costComparison || []) {
    if (!cost.basis) return false;
  }
  return true;
}

/** whyItMatters returns the encouraging "why this matters" copy. */
export function whyItMatters() {
  return 'This lab meets you where you are — Ethereum, Solana, Cosmos, or plain Web2 — and maps your ' +
    'pattern onto an Infrix-native equivalent. Every claim about another chain carries a source and a ' +
    'date or is marked an assumption; cost lines never invent numbers; and the migration it scaffolds ' +
    'produces runnable, validated Infrix artifacts that route through governance — never a bypass, ' +
    'never an automated mainnet deploy.';
}
