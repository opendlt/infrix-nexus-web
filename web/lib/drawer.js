// Nexus — side drawer system.
//
// Every plugin / policy / trust / role / capability reference inside
// the Inspect view is clickable. Clicking opens a side drawer with
// that entity's full detail. Drawers stack: clicking a trust profile
// inside a plugin drawer pushes another drawer on top of the first.
// Esc / outside-click pops the topmost drawer.
//
// The drawer NEVER navigates away from the current intent — the
// user stays inside the spine flow they're inspecting. Drawers are
// lateral lookups, not page changes.

import { rpcWithDisclosure, formatTime, hashChip, jsonBlock, kvRow, statusPill, loadingNode, errorNode, emptyState, shortHash } from '/lib/spineCommon.js';

let host = null;
let stack = [];   // open drawer elements, top-of-stack last

function ensureHost() {
  if (host) return host;
  host = document.createElement('div');
  host.className = 'drawer-host';
  host.id = 'drawer-host';
  document.body.appendChild(host);

  // Esc pops the topmost drawer
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && stack.length > 0) popDrawer();
  });
  return host;
}

function pushDrawer(titleText, render) {
  ensureHost();
  // Backdrop (only created once)
  if (stack.length === 0) {
    const back = document.createElement('div');
    back.className = 'drawer-backdrop';
    back.addEventListener('click', () => popDrawer());
    host.appendChild(back);
    requestAnimationFrame(() => back.classList.add('open'));
  }
  const drawer = document.createElement('aside');
  drawer.className = 'drawer';
  drawer.style.right = `${stack.length * 28}px`;
  drawer.style.zIndex = String(1000 + stack.length);
  // Header
  const header = document.createElement('div');
  header.className = 'drawer-header';
  const title = document.createElement('h3');
  title.className = 'drawer-title';
  title.textContent = titleText;
  header.appendChild(title);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'drawer-close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close drawer');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => popDrawer());
  header.appendChild(closeBtn);
  drawer.appendChild(header);
  // Body
  const body = document.createElement('div');
  body.className = 'drawer-body';
  drawer.appendChild(body);
  host.appendChild(drawer);
  stack.push(drawer);
  requestAnimationFrame(() => drawer.classList.add('open'));
  // Render content
  body.appendChild(loadingNode('Loading…'));
  Promise.resolve(render(body)).catch((err) => {
    body.replaceChildren(errorNode(err));
  });
}

function popDrawer() {
  if (stack.length === 0) return;
  const drawer = stack.pop();
  drawer.classList.remove('open');
  setTimeout(() => drawer.remove(), 240);
  if (stack.length === 0) {
    const back = host.querySelector('.drawer-backdrop');
    if (back) {
      back.classList.remove('open');
      setTimeout(() => back.remove(), 240);
    }
  }
}

export function closeAllDrawers() {
  while (stack.length > 0) popDrawer();
}

// =================================================================
// Public openers — one per entity kind. Each fetches the canonical
// detail from the existing RPCs and renders into the drawer body.
// =================================================================

export function openPluginDrawer(pluginID) {
  pushDrawer(`Plugin · ${pluginID}`, async (body) => {
    const data = await rpcWithDisclosure('explorer.pluginGet', { id: pluginID });
    body.replaceChildren(renderPluginDetail(data));
  });
}

function renderPluginDetail(p) {
  const wrap = document.createElement('div');
  if (!p) { wrap.appendChild(emptyState('Plugin not found.')); return wrap; }
  wrap.appendChild(kvRow('Plugin ID', p.pluginId));
  wrap.appendChild(kvRow('Name', p.name));
  wrap.appendChild(kvRow('Version', p.version));
  wrap.appendChild(kvRow('Family', p.family));
  wrap.appendChild(kvRow('Provider', p.provider));
  wrap.appendChild(kvRow('Backend class', statusPill(p.backendClass || 'unknown', p.backendClass === 'production' ? 'ok' : 'warn')));
  wrap.appendChild(kvRow('Lifecycle', statusPill(p.lifecycleState || '—', p.lifecycleState === 'active' ? 'ok' : 'warn')));
  wrap.appendChild(kvRow('Timing class', p.timingClass));
  wrap.appendChild(kvRow('Confidentiality', p.confidentialityProfile));
  wrap.appendChild(kvRow('Cost tier', p.costTier));
  if (typeof p.reliability === 'number') {
    wrap.appendChild(kvRow('Reliability', `${(p.reliability * 100).toFixed(2)}%`));
  }
  if (p.implementationHash) wrap.appendChild(kvRow('Implementation hash', hashChip(p.implementationHash, { head: 12, tail: 8 })));
  if (p.capabilityManifest && p.capabilityManifest.length > 0) {
    wrap.appendChild(sectionHeader('Capability manifest'));
    wrap.appendChild(plainList(p.capabilityManifest));
  }
  if (p.evidenceProfile && p.evidenceProfile.length > 0) {
    wrap.appendChild(sectionHeader('Evidence profile'));
    wrap.appendChild(plainList(p.evidenceProfile));
  }
  if (p.sideEffectLimits && p.sideEffectLimits.length > 0) {
    wrap.appendChild(sectionHeader('Side-effect limits'));
    wrap.appendChild(plainList(p.sideEffectLimits));
  }
  return wrap;
}

export function openTrustDrawer(profileID) {
  pushDrawer(`Trust profile · ${profileID}`, async (body) => {
    const [p, history] = await Promise.all([
      rpcWithDisclosure('explorer.trustGet', { id: profileID }).catch(() => null),
      rpcWithDisclosure('trust.history', { id: profileID }).catch(() => null),
    ]);
    body.replaceChildren(renderTrustDetail(p, history));
  });
}

function renderTrustDetail(p, history) {
  const wrap = document.createElement('div');
  if (!p) { wrap.appendChild(emptyState('Trust profile not found.')); return wrap; }
  wrap.appendChild(kvRow('Profile ID', p.profileId));
  wrap.appendChild(kvRow('State', statusPill(p.state, stateKind(p.state))));
  wrap.appendChild(kvRow('Proof type', p.proofType || '—'));
  wrap.appendChild(kvRow('Trust assumption', p.trustAssumption || '—'));
  wrap.appendChild(kvRow('Finality model', p.finalityModel || '—'));
  wrap.appendChild(kvRow('Min confirmations', p.minConfirmations));
  wrap.appendChild(kvRow('Freshness window', p.freshnessWindow || '—'));
  wrap.appendChild(kvRow('Version', p.version));
  if (p.degradedAt) wrap.appendChild(kvRow('Degraded at', formatTime(p.degradedAt)));
  if (p.degradedReason) wrap.appendChild(kvRow('Degraded reason', statusPill(p.degradedReason, 'alert')));
  const events = historyEvents(history);
  if (events.length > 0) {
    wrap.appendChild(sectionHeader(`Audit trail (${events.length})`));
    const list = document.createElement('div');
    list.className = 'history-list';
    for (const e of events) {
      const row = document.createElement('div');
      row.className = 'history-row';
      const ts = document.createElement('span');
      ts.className = 'history-ts mono';
      ts.textContent = formatTime(e.timestamp || e.Timestamp || e.at);
      row.appendChild(ts);
      const tp = document.createElement('span');
      tp.className = 'history-type';
      tp.textContent = e.type || e.Type || e.kind || '—';
      row.appendChild(tp);
      const det = document.createElement('span');
      det.className = 'history-detail';
      det.textContent = e.detail || e.Detail || '';
      row.appendChild(det);
      list.appendChild(row);
    }
    wrap.appendChild(list);
  }
  return wrap;
}

export function openPolicyDecisionDrawer(decision) {
  pushDrawer(`Policy decision · ${decision.policyType || 'unknown'}`, async (body) => {
    body.replaceChildren(renderPolicyDecision(decision));
  });
}

function renderPolicyDecision(d) {
  const wrap = document.createElement('div');
  wrap.appendChild(kvRow('Policy type', d.policyType));
  wrap.appendChild(kvRow('Scope', d.scopeKey || '—'));
  wrap.appendChild(kvRow('Decision', statusPill(d.decision, d.decision === 'allow' ? 'ok' : 'alert')));
  wrap.appendChild(kvRow('Rule ID', d.ruleId || '—'));
  wrap.appendChild(kvRow('Audit message', d.auditMsg || '—'));
  wrap.appendChild(kvRow('Actor', d.actor || '—'));
  wrap.appendChild(kvRow('Block height', d.blockHeight));
  wrap.appendChild(kvRow('Timestamp', formatTime(d.timestamp)));
  return wrap;
}

export function openRoleDrawer(role) {
  pushDrawer(`Role · ${role}`, async (body) => {
    const r = await rpcWithDisclosure('explorer.roleHolders', { role }).catch(() => null);
    body.replaceChildren(renderRoleDetail(role, r));
  });
}

function renderRoleDetail(role, r) {
  const wrap = document.createElement('div');
  wrap.appendChild(kvRow('Role', role));
  const items = (r && r.bindings) || [];
  wrap.appendChild(kvRow('Holders', items.length));
  if (items.length > 0) {
    wrap.appendChild(sectionHeader('Holders'));
    const list = document.createElement('ul');
    list.className = 'plain-list';
    for (const b of items) {
      const li = document.createElement('li');
      li.className = 'mono';
      const fields = b.fields || b.Fields || {};
      li.textContent = fields.Identity || fields.identity || b.id || '—';
      list.appendChild(li);
    }
    wrap.appendChild(list);
  }
  return wrap;
}

export function openCapabilityDrawer(grantID) {
  pushDrawer(`Capability grant · ${shortHash(grantID, 16, 6)}`, async (body) => {
    const r = await rpcWithDisclosure('explorer.capabilityGrants', { limit: 1000 });
    const items = (r && r.items) || [];
    const grant = items.find((g) => (g.id || g.ID) === grantID);
    body.replaceChildren(renderCapability(grant));
  });
}

function renderCapability(g) {
  const wrap = document.createElement('div');
  if (!g) { wrap.appendChild(emptyState('Grant not found.')); return wrap; }
  const f = g.fields || g.Fields || {};
  wrap.appendChild(kvRow('Capability', f.Capability || f.capability));
  wrap.appendChild(kvRow('Grantee', f.Grantee || f.grantee || f.Identity || f.identity));
  wrap.appendChild(kvRow('Delegated from', f.DelegatedFrom || f.delegatedFrom || '—'));
  wrap.appendChild(kvRow('State', statusPill(g.state || g.State || 'active', 'ok')));
  wrap.appendChild(kvRow('Created', formatTime(g.created || g.Created)));
  return wrap;
}

// helpers
function sectionHeader(text) {
  const h = document.createElement('h4');
  h.className = 'drawer-section-head';
  h.textContent = text;
  return h;
}
function plainList(arr) {
  const ul = document.createElement('ul');
  ul.className = 'plain-list';
  for (const v of arr) {
    const li = document.createElement('li');
    li.className = 'mono';
    li.textContent = v;
    ul.appendChild(li);
  }
  return ul;
}
function stateKind(state) {
  switch (String(state).toLowerCase()) {
    case 'active': case 'granted': case 'completed': return 'ok';
    case 'degraded': case 'pending': return 'warn';
    case 'suspended': case 'revoked': case 'failed': return 'alert';
    default: return 'info';
  }
}
function historyEvents(resp) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp.events)) return resp.events;
  if (Array.isArray(resp.history)) return resp.history;
  if (Array.isArray(resp.items)) return resp.items;
  return [];
}
