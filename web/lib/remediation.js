// Nexus — Autopilot remediation data + helpers (nextux-05).
//
// Loads the Go-generated sample autopilot fixture (a real diagnosed plan + its
// dry-run receipt) and exposes honest read helpers: findings, the auto-safe vs
// manual split, the dry-run diff, and a demotion guard. A Go drift test keeps
// the fixture byte-identical to pkg/remediation. The browser NEVER applies a
// plan — apply flows through the approval-gated CLI / agent action.

let _data = null;

export function setRemediationData(obj) {
  _data = obj || null;
  return _data;
}

export function getRemediationData() {
  if (!_data) throw new Error('remediation: data not loaded — call loadRemediation() first');
  return _data;
}

export async function loadRemediation(url = '/testdata/autopilot.fixture.json') {
  if (_data) return _data;
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`remediation: failed to load fixture (${res.status})`);
  return setRemediationData(await res.json());
}

export function plan() {
  return getRemediationData().plan || { findings: [] };
}
export function receipt() {
  return getRemediationData().receipt || null;
}

export function findings() {
  return (plan().findings || []).slice();
}
export function blockingCount() {
  return findings().filter((f) => f.severity === 'blocking').length;
}
export function autoSafeFix(finding) {
  return (finding.fixes || []).find((x) => x.kind === 'auto_safe') || null;
}
export function autoSafeFindings() {
  return findings().filter((f) => autoSafeFix(f) !== null);
}
export function manualActions() {
  const out = [];
  for (const f of findings()) {
    if (autoSafeFix(f)) continue;
    for (const fix of f.fixes || []) out.push({ finding: f, fix });
  }
  return out;
}

// FIX_BADGE maps a fix kind to a label + glyph + color role. Only auto_safe is
// "Infrix can do it"; everything else is honestly flagged as needing a human,
// an operator, or an external system. Glyph carries meaning without color.
export const FIX_BADGE = Object.freeze({
  auto_safe: { label: 'Auto-safe', glyph: '✔', role: 'positive' },
  guided: { label: 'Needs input', glyph: '•', role: 'info' },
  operator_required: { label: 'Operator required', glyph: '▲', role: 'caution' },
  external_required: { label: 'External required', glyph: '▲', role: 'caution' },
  not_fixable: { label: 'Not fixable', glyph: '✘', role: 'negative' },
});
export function fixBadge(kind) {
  return FIX_BADGE[kind] || FIX_BADGE.not_fixable;
}

export const ROLE_VARS = Object.freeze({
  positive: 'var(--ok)', info: 'var(--info)', caution: 'var(--warn)', negative: 'var(--alert)',
});

// findDemotions returns any applied fix that would demote the profile or weaken
// a security requirement — the browser-side mirror of the engine's policy. The
// honest fixture must return an empty array.
const securityBoolLeaves = new Set(['evidenceStrictMode', 'stateMirrorEnabled']);
export function findDemotions(rec, targetProfile) {
  const bad = [];
  for (const a of (rec && rec.appliedFixes) || []) {
    const leaf = a.path[a.path.length - 1] || '';
    if (securityBoolLeaves.has(leaf) && String(a.newValue).toLowerCase() === 'false') bad.push(a);
    if (leaf === 'profile' && a.newValue !== targetProfile) bad.push(a);
  }
  return bad;
}
