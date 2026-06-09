// Nexus — Intent Copilot Workbench data + helpers (nextux-06).
//
// Loads the Go-generated workbench fixture (a grounded ask plan + a hard-refused
// overclaim plan) and exposes honest read helpers: candidates, the selection,
// missing inputs, the safety envelope, and the refusal + nearest safe
// alternative. A Go drift test keeps the fixture byte-identical to pkg/workbench.
// The browser NEVER runs a plan — run flows through the approval-gated CLI / agent.

let _data = null;

export function setWorkbenchData(obj) {
  _data = obj || null;
  return _data;
}

export function getWorkbenchData() {
  if (!_data) throw new Error('workbench: data not loaded — call loadWorkbench() first');
  return _data;
}

export async function loadWorkbench(url = '/testdata/workbench.fixture.json') {
  if (_data) return _data;
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`workbench: failed to load fixture (${res.status})`);
  return setWorkbenchData(await res.json());
}

export function askCase() {
  return getWorkbenchData().ask || { request: '', plan: { candidates: [] } };
}
export function refusalCase() {
  return getWorkbenchData().refusal || { request: '', plan: { candidates: [], refusals: [] } };
}
export function askPlan() {
  return askCase().plan || { candidates: [] };
}
export function refusalPlan() {
  return refusalCase().plan || { candidates: [], refusals: [] };
}

export function isRefused(plan) {
  return Array.isArray(plan.refusals) && plan.refusals.length > 0;
}
export function isActionable(plan) {
  return !!plan.selected && !isRefused(plan);
}
export function missingInputs(plan) {
  if (!plan.selected) return [];
  const c = (plan.candidates || []).find((x) => x.kind === plan.selected.kind && x.id === plan.selected.id);
  return (c && c.missingInputs) || [];
}

// verifyPlanHonesty mirrors the code-enforced workbench invariants in the browser:
// never mainnet, a refused plan selects nothing, every refusal carries a safe
// alternative, and the selection is one of the grounded candidates. The honest
// fixture returns an empty array.
export function verifyPlanHonesty(plan) {
  const issues = [];
  if (plan.safety && plan.safety.mainnetWrite) issues.push('plan claims a mainnet write');
  if (plan.network === 'mainnet') issues.push('plan targets mainnet');
  if (isRefused(plan) && plan.selected) issues.push('a refused plan must not select a capability');
  for (const r of plan.refusals || []) {
    if (!r.safeAlternative) issues.push(`refusal ${r.code} has no safe alternative`);
  }
  if (plan.selected) {
    const found = (plan.candidates || []).find((c) => c.kind === plan.selected.kind && c.id === plan.selected.id);
    if (!found) issues.push('selected capability is not among the grounded candidates');
  }
  return issues;
}

// KIND_BADGE maps a grounding kind to a label + glyph + color role. Glyph carries
// meaning without color.
export const KIND_BADGE = Object.freeze({
  task: { label: 'Task', glyph: '◆', role: 'positive' },
  scenario: { label: 'Scenario', glyph: '◇', role: 'info' },
  action: { label: 'Action', glyph: '•', role: 'info' },
});
export function kindBadge(kind) {
  return KIND_BADGE[kind] || KIND_BADGE.action;
}

export const ROLE_VARS = Object.freeze({
  positive: 'var(--ok)', info: 'var(--info)', caution: 'var(--warn)', negative: 'var(--alert)',
});
