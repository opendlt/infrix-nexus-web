// Nexus — Policies view (registry + detail + conflicts + decision-trace + simulate).
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 3-H: the universal-gate
// surface for governance constraints. The view ships:
//   - Registry browser (every PolicySet across every scope)
//   - Per-policy detail rule-by-rule with effect / condition / priority
//   - Conflict analysis (calls policy.conflicts)
//   - Decision-trace viewer (calls explorer.policyDecisionTrace with
//     actor + scope filters; the redesign plan calls out this as
//     "show me why this intent's intent:submit policy returned allow")
//   - Simulate-change UI (calls policy.simulate with a counterfactual
//     rule diff and renders the resulting allow/deny delta)
//
// Subpaths:
//   #/policies                        — registry list across all scopes
//   #/policies/_conflicts             — global conflict analysis
//   #/policies/_decisions             — past decision trace browser
//   #/policies/_simulate              — counterfactual simulation
//   #/policies/<scopeKey>/<type>      — single policy detail

import {
  rpcWithDisclosure,
  shortHash,
  formatTime,
  jsonBlock,
  emptyState,
  kvRow,
  card,
  statusPill,
  loadingNode,
  errorNode,
  deeplinkButton,
} from '/lib/spineCommon.js';

let rootEl = null;
let currentSubpath = [];

export const policiesView = {
  mount(root, subpath) {
    rootEl = root;
    currentSubpath = Array.isArray(subpath) ? subpath : [];
    render();
  },
  onSubpathChange(subpath) {
    currentSubpath = Array.isArray(subpath) ? subpath : [];
    render();
  },
};

function render() {
  if (!rootEl) return;
  if (currentSubpath.length === 0) {
    renderRegistry();
  } else if (currentSubpath[0] === '_conflicts') {
    renderConflicts();
  } else if (currentSubpath[0] === '_decisions') {
    renderDecisionTrace();
  } else if (currentSubpath[0] === '_simulate') {
    renderSimulate();
  } else {
    renderDetail(currentSubpath[0], currentSubpath[1]);
  }
}

// -----------------------------------------------------------------
// Registry
// -----------------------------------------------------------------
async function renderRegistry() {
  rootEl.replaceChildren();
  rootEl.appendChild(headerWithActions('Policies', 'Every policy set the registry holds, grouped by scope. Each rule is operator-readable. Conflict analysis, decision trace, and counterfactual simulation are one click away.'));

  let resp;
  try {
    resp = await rpcWithDisclosure('explorer.policyList', {});
  } catch (err) {
    rootEl.appendChild(errorNode(err));
    return;
  }
  const scopes = (resp && Array.isArray(resp.scopes)) ? resp.scopes : [];
  const meta = document.createElement('div');
  meta.className = 'spine-table-meta';
  meta.textContent = `${resp.totalSets || 0} policy set${resp.totalSets === 1 ? '' : 's'} across ${scopes.length} scope${scopes.length === 1 ? '' : 's'}`;
  rootEl.appendChild(meta);

  if (scopes.length === 0) {
    rootEl.appendChild(emptyState('No policies registered yet.'));
    return;
  }

  for (const sc of scopes) {
    const wrap = document.createElement('section');
    wrap.className = 'spine-card';
    const title = document.createElement('h3');
    title.className = 'spine-card-title';
    title.textContent = `Scope: ${sc.scope}`;
    wrap.appendChild(title);
    const sets = (sc.sets || []);
    for (const ps of sets) {
      const row = document.createElement('div');
      row.className = 'policy-set-row';
      const a = document.createElement('a');
      a.className = 'spine-link mono';
      a.href = '#/policies/' + encodeURIComponent(sc.scope) + '/' + encodeURIComponent(ps.type);
      a.textContent = ps.type;
      row.appendChild(a);
      const info = document.createElement('span');
      info.className = 'policy-set-meta';
      info.textContent = ` ${ps.ruleCount} rule${ps.ruleCount === 1 ? '' : 's'} · default ${ps.defaultEffect} · v${ps.version}`;
      row.appendChild(info);
      wrap.appendChild(row);
    }
    rootEl.appendChild(wrap);
  }
}

function headerWithActions(titleText, subText) {
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const h = document.createElement('h2');
  h.textContent = titleText;
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent = subText;
  head.appendChild(sub);
  const actions = document.createElement('div');
  actions.className = 'action-row';
  actions.appendChild(deeplinkButton('Conflicts', 'policies', '_conflicts'));
  actions.appendChild(deeplinkButton('Decision trace', 'policies', '_decisions'));
  actions.appendChild(deeplinkButton('Simulate change', 'policies', '_simulate'));
  head.appendChild(actions);
  return head;
}

// -----------------------------------------------------------------
// Detail
// -----------------------------------------------------------------
async function renderDetail(scopeKey, policyType) {
  rootEl.replaceChildren();

  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/policies';
  back.textContent = '← All policies';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.textContent = `${policyType}`;
  head.appendChild(h);
  const sp = document.createElement('p');
  sp.className = 'spine-section-sub mono';
  sp.textContent = scopeKey;
  head.appendChild(sp);
  rootEl.appendChild(head);

  // Build the params from scopeKey: "global", "contract:<url>", or "object:<url>"
  const params = parseScopeKey(scopeKey);
  params.type = policyType;

  let policy;
  try {
    policy = await rpcWithDisclosure('explorer.policyGet', params);
  } catch (err) {
    rootEl.appendChild(errorNode(err));
    return;
  }
  if (!policy) {
    rootEl.appendChild(errorNode(new Error('policy not found')));
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  rootEl.appendChild(grid);

  // Header card
  const headerBody = document.createElement('div');
  headerBody.appendChild(kvRow('Type', policy.type));
  headerBody.appendChild(kvRow('Scope', policy.scope));
  headerBody.appendChild(kvRow('Default effect', statusPill(policy.defaultEffect, policy.defaultEffect === 'allow' ? 'ok' : 'alert')));
  headerBody.appendChild(kvRow('Version', policy.version));
  headerBody.appendChild(kvRow('Rule count', (policy.rules || []).length));
  grid.appendChild(card('Policy envelope', headerBody));

  // Rule-by-rule view
  const rulesBody = document.createElement('div');
  if (!policy.rules || policy.rules.length === 0) {
    rulesBody.appendChild(emptyState('No rules — defaultEffect applies.'));
  } else {
    const list = document.createElement('div');
    list.className = 'policy-rule-list';
    for (const r of policy.rules) {
      list.appendChild(renderRule(r));
    }
    rulesBody.appendChild(list);
  }
  grid.appendChild(card('Rules', rulesBody));

  // Decision-trace shortcut for this scope. The canonical surface is
  // per-evidence-bundle (Gap 12 closure: DecisionProofStore is not
  // disclosure-gated, so traces are read from EvidenceBundle.PolicyDecisions
  // — the bundle's own redacted read path). The Policies "Decision
  // trace" sub-route accepts an intentId or bundleId; this card is a
  // pointer to that workflow.
  const traceBody = document.createElement('div');
  traceBody.appendChild(document.createTextNode(
    'Decision traces are recorded inside each intent\'s EvidenceBundle as the PolicyDecisions field. To inspect why this policy returned allow/deny for a specific intent, paste an intentId or bundleId into the Decision trace tab.'
  ));
  const goBtn = document.createElement('button');
  goBtn.type = 'button';
  goBtn.className = 'deeplink-btn';
  goBtn.textContent = 'Open Decision trace tab';
  goBtn.addEventListener('click', () => {
    window.location.hash = '#/policies/_decisions';
  });
  traceBody.appendChild(document.createElement('br'));
  traceBody.appendChild(goBtn);
  grid.appendChild(card('Decision trace', traceBody));

  // Raw envelope
  const rawBody = document.createElement('details');
  rawBody.className = 'raw-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Raw policy envelope';
  rawBody.appendChild(summary);
  rawBody.appendChild(jsonBlock(policy));
  grid.appendChild(card('Inspect', rawBody));
}

function renderRule(r) {
  const wrap = document.createElement('div');
  wrap.className = 'policy-rule';
  const hdr = document.createElement('div');
  hdr.className = 'policy-rule-head';
  const id = document.createElement('span');
  id.className = 'mono';
  id.textContent = r.id;
  hdr.appendChild(id);
  hdr.appendChild(statusPill(r.effect, r.effect === 'allow' ? 'ok' : 'alert'));
  if (r.priority !== undefined) {
    const pr = document.createElement('span');
    pr.className = 'policy-rule-priority';
    pr.textContent = `priority ${r.priority}`;
    hdr.appendChild(pr);
  }
  if (r.enabled === false) {
    hdr.appendChild(statusPill('disabled', 'warn'));
  }
  wrap.appendChild(hdr);
  if (r.name) {
    const n = document.createElement('div');
    n.className = 'policy-rule-name';
    n.textContent = r.name;
    wrap.appendChild(n);
  }
  if (r.description) {
    const d = document.createElement('div');
    d.className = 'policy-rule-desc';
    d.textContent = r.description;
    wrap.appendChild(d);
  }
  if (r.condition) {
    const c = document.createElement('pre');
    c.className = 'policy-rule-cond';
    c.textContent = r.condition;
    wrap.appendChild(c);
  }
  if (r.auditMsg) {
    const a = document.createElement('div');
    a.className = 'policy-rule-audit';
    a.textContent = `audit: ${r.auditMsg}`;
    wrap.appendChild(a);
  }
  return wrap;
}

function parseScopeKey(scopeKey) {
  if (scopeKey === 'global') return { global: true };
  if (scopeKey.startsWith('contract:')) return { contractUrl: scopeKey.slice('contract:'.length) };
  if (scopeKey.startsWith('object:')) return { objectUrl: scopeKey.slice('object:'.length) };
  return { global: true };
}

// -----------------------------------------------------------------
// Conflicts
// -----------------------------------------------------------------
async function renderConflicts() {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/policies';
  back.textContent = '← All policies';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.textContent = 'Policy conflicts';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent = 'Surfaces contradictory rules across the registry. A rule conflict means two rules with different effects could simultaneously match the same context.';
  head.appendChild(sub);
  rootEl.appendChild(head);

  const wrap = document.createElement('div');
  wrap.appendChild(loadingNode('Analysing conflicts…'));
  rootEl.appendChild(wrap);
  let resp;
  try {
    resp = await rpcWithDisclosure('policy.conflicts', {});
  } catch (err) {
    wrap.replaceChildren(errorNode(err));
    return;
  }
  wrap.replaceChildren();
  const conflicts = (resp && (resp.conflicts || resp.items)) || [];
  if (conflicts.length === 0) {
    wrap.appendChild(emptyState('No conflicts detected. Every rule pair resolves to a single effect.'));
    return;
  }
  for (const c of conflicts) {
    const cardEl = document.createElement('section');
    cardEl.className = 'spine-card';
    const title = document.createElement('h3');
    title.className = 'spine-card-title';
    title.textContent = c.scopeKey || c.scope || 'conflict';
    cardEl.appendChild(title);
    cardEl.appendChild(jsonBlock(c));
    wrap.appendChild(cardEl);
  }
}

// -----------------------------------------------------------------
// Decision trace
// -----------------------------------------------------------------
async function renderDecisionTrace() {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/policies';
  back.textContent = '← All policies';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.textContent = 'Decision trace';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent = 'Past policy decisions recorded in the DecisionProofStore. Filter by actor and/or scope to drill from an evidence bundle into the rule that allowed (or denied) the operation.';
  head.appendChild(sub);
  rootEl.appendChild(head);

  // Filter form — decision trace is per-evidence-bundle (Gap 12
  // closure). Either an intentId or a bundleId resolves the trace.
  const form = document.createElement('div');
  form.className = 'spine-filter-bar';

  const intentWrap = labelInput('Intent ID', '', 'intent-acc://...');
  const bundleWrap = labelInput('Bundle ID', '', 'ev-intent-...');
  const typeWrap = labelInput('Policy type (filter)', '', 'intent:submit, contract:call, ...');
  for (const w of [intentWrap, bundleWrap, typeWrap]) form.appendChild(w);

  const goBtn = document.createElement('button');
  goBtn.type = 'button';
  goBtn.className = 'verify-btn';
  goBtn.textContent = 'Query';
  form.appendChild(goBtn);
  rootEl.appendChild(form);

  const out = document.createElement('div');
  rootEl.appendChild(out);

  goBtn.addEventListener('click', async () => {
    const intentId = intentWrap.input.value.trim();
    const bundleId = bundleWrap.input.value.trim();
    if (!intentId && !bundleId) {
      out.replaceChildren(emptyState('Provide an intent ID or bundle ID to load the decision trace embedded inside that intent\'s evidence bundle.'));
      return;
    }
    goBtn.disabled = true;
    out.replaceChildren(loadingNode('Loading decisions…'));
    try {
      const r = await rpcWithDisclosure('explorer.policyDecisionTrace', {
        intentId,
        bundleId,
        policyType: typeWrap.input.value.trim(),
      });
      const head = document.createElement('div');
      head.className = 'verify-init';
      head.textContent = `bundle ${r.bundleId || '—'} (${r.total || 0} decisions recorded)`;
      const wrap = document.createElement('div');
      wrap.appendChild(head);
      wrap.appendChild(renderDecisions((r && r.decisions) || []));
      out.replaceChildren(wrap);
    } catch (err) {
      out.replaceChildren(errorNode(err));
    } finally {
      goBtn.disabled = false;
    }
  });
}

function renderDecisions(decisions) {
  if (decisions.length === 0) return emptyState('No matching decisions.');
  const table = document.createElement('table');
  table.className = 'spine-table';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of ['Time', 'Type', 'Scope', 'Decision', 'Rule', 'Actor', 'Block', 'Audit']) {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const d of decisions) {
    const r = document.createElement('tr');
    r.appendChild(td(formatTime(d.timestamp)));
    r.appendChild(tdMono(d.policyType));
    r.appendChild(tdMono(d.scopeKey));
    r.appendChild(tdPill(d.decision, d.decision === 'allow' ? 'ok' : 'alert'));
    r.appendChild(tdMono(d.ruleId || '—'));
    r.appendChild(tdMono(d.actor || '—'));
    r.appendChild(td(d.blockHeight));
    r.appendChild(td(d.auditMsg || ''));
    tbody.appendChild(r);
  }
  table.appendChild(tbody);
  return table;
}

// -----------------------------------------------------------------
// Simulate
// -----------------------------------------------------------------
async function renderSimulate() {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/policies';
  back.textContent = '← All policies';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.textContent = 'Simulate policy decision';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent = 'Counterfactual evaluation. Provide a scope + policy type + EvalContext and the registry returns the decision the rules would produce. Useful for "would this proposed call succeed?" queries before submission.';
  head.appendChild(sub);
  rootEl.appendChild(head);

  const form = document.createElement('div');
  form.className = 'spine-filter-bar';

  const scopeWrap = labelInput('Scope key', 'global', 'global, contract:<url>, object:<url>');
  const typeWrap = labelInput('Policy type', 'intent:submit', '');
  for (const w of [scopeWrap, typeWrap]) form.appendChild(w);

  const ctxLabel = document.createElement('label');
  ctxLabel.className = 'spine-filter';
  const ctxSpan = document.createElement('span');
  ctxSpan.textContent = 'EvalContext (JSON)';
  ctxLabel.appendChild(ctxSpan);
  const ctxInput = document.createElement('textarea');
  ctxInput.style.minWidth = '480px';
  ctxInput.style.minHeight = '120px';
  ctxInput.style.fontFamily = 'var(--mono)';
  ctxInput.placeholder = '{ "actor":"acc://test.acme", "function":"increment" }';
  ctxInput.value = '{}';
  ctxLabel.appendChild(ctxInput);
  form.appendChild(ctxLabel);

  const goBtn = document.createElement('button');
  goBtn.type = 'button';
  goBtn.className = 'verify-btn';
  goBtn.textContent = 'Evaluate';
  form.appendChild(goBtn);
  rootEl.appendChild(form);

  const out = document.createElement('div');
  rootEl.appendChild(out);

  goBtn.addEventListener('click', async () => {
    goBtn.disabled = true;
    out.replaceChildren(loadingNode('Evaluating…'));
    let ctxObj = {};
    try {
      ctxObj = JSON.parse(ctxInput.value || '{}');
    } catch (err) {
      out.replaceChildren(errorNode(new Error('EvalContext is not valid JSON: ' + err.message)));
      goBtn.disabled = false;
      return;
    }
    const params = parseScopeKey(scopeWrap.input.value.trim() || 'global');
    params.type = typeWrap.input.value.trim();
    params.context = ctxObj;
    try {
      const r = await rpcWithDisclosure('policy.simulate', params);
      out.replaceChildren(renderSimulationResult(r));
    } catch (err) {
      out.replaceChildren(errorNode(err));
    } finally {
      goBtn.disabled = false;
    }
  });
}

function renderSimulationResult(r) {
  const wrap = document.createElement('div');
  if (!r) {
    wrap.appendChild(emptyState('No result.'));
    return wrap;
  }
  const head = document.createElement('div');
  head.className = 'verify-summary';
  const decision = r.decision || r.effect || (r.allowed ? 'allow' : 'deny');
  head.classList.add(decision === 'allow' ? 'verify-pass' : 'verify-fail');
  head.textContent = `Decision: ${decision}`;
  wrap.appendChild(head);
  if (r.ruleId) {
    const rule = document.createElement('div');
    rule.className = 'verify-detail';
    rule.textContent = `matched rule: ${r.ruleId}`;
    wrap.appendChild(rule);
  }
  if (r.auditMsg) {
    const a = document.createElement('div');
    a.className = 'verify-detail';
    a.textContent = `audit: ${r.auditMsg}`;
    wrap.appendChild(a);
  }
  if (r.trace) {
    const block = document.createElement('details');
    block.className = 'raw-details';
    const summary = document.createElement('summary');
    summary.textContent = 'Decision trace';
    block.appendChild(summary);
    block.appendChild(jsonBlock(r.trace));
    wrap.appendChild(block);
  }
  const raw = document.createElement('details');
  raw.className = 'raw-details';
  const rawSum = document.createElement('summary');
  rawSum.textContent = 'Raw response';
  raw.appendChild(rawSum);
  raw.appendChild(jsonBlock(r));
  wrap.appendChild(raw);
  return wrap;
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------
function labelInput(label, defaultValue, placeholder) {
  const wrap = document.createElement('label');
  wrap.className = 'spine-filter';
  const span = document.createElement('span');
  span.textContent = label;
  wrap.appendChild(span);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = defaultValue || '';
  if (placeholder) input.placeholder = placeholder;
  wrap.appendChild(input);
  wrap.input = input;
  return wrap;
}

function td(text) {
  const t = document.createElement('td');
  t.textContent = (text === undefined || text === null) ? '—' : String(text);
  return t;
}
function tdMono(text) {
  const t = td(text);
  t.classList.add('mono');
  return t;
}
function tdPill(text, kind) {
  const t = document.createElement('td');
  t.appendChild(statusPill(text, kind));
  return t;
}
