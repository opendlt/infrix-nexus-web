// Nexus — Phase 7 Operate console renderer.
//
// NEXUS-REIMAGINED-2026-05-10 Phase 7 — Operate As Governed Action Console.
//
// Renders two RPC payloads into the operator console:
//
//   nexus.operateHealth       → 8 health panels arranged in a grid
//   nexus.operatorTemplates   → action cards grouped by class
//
// Every action card click navigates to #/compose/<GOAL_TYPE> with
// the seed customParams persisted to localStorage so Intent Studio
// can pre-populate the form. The Phase 7 invariant — "every mutating
// control becomes a previewable intent" — is enforced here: there
// are no direct-mutation buttons on this view.

import { shortHash, jsonBlock } from '/lib/spineCommon.js';
import { severityBadge, sortBySeverity } from '/lib/severity.js';

const SEED_LOCALSTORAGE_KEY = 'nexus.compose.operatorSeed';

const PANEL_LABELS = {
  anchorBacklog:    'Anchor backlog',
  trustDrift:       'Trust drift',
  pluginHealth:     'Plugin health',
  policyDenials:    'Policy denials',
  pendingApprovals: 'Pending approvals',
  gasRegime:        'Gas regime',
  rateLimitRegime:  'Rate-limit regime',
  subsystemState:   'Subsystem state',
};

const CLASS_LABELS = {
  anchor:    'Anchor',
  rate:      'Rate-limit',
  gas:       'Gas schedule',
  sponsor:   'Sponsor',
  trust:     'Trust',
  plugin:    'Plugin',
  subsystem: 'Subsystem',
};

/**
 * Render the Phase 7 operator console.
 * @param {Object} health    — nexus.operateHealth response
 * @param {Object} templates — nexus.operatorTemplates response
 * @returns {HTMLElement}
 */
export function renderOperatePanel(health, templates) {
  const root = document.createElement('div');
  root.className = 'operate-console';

  const banner = document.createElement('div');
  banner.className = 'operate-governed-banner';
  banner.innerHTML = '<strong>No direct changes here.</strong> Every action below opens a preview, gets the required approvals, runs through the workflow, and produces verifiable proof — same as any other governed action.';
  root.appendChild(banner);

  if (health) root.appendChild(renderHealthGrid(health));
  if (templates && Array.isArray(templates.templates)) root.appendChild(renderTemplatesRail(templates.templates));

  const raw = document.createElement('details');
  raw.className = 'raw-details';
  const rawSum = document.createElement('summary');
  rawSum.textContent = 'Raw operate state JSON';
  raw.appendChild(rawSum);
  raw.appendChild(jsonBlock({ health, templates }));
  root.appendChild(raw);

  return root;
}

// =================================================================
// Health grid — 8 panels
// =================================================================
function renderHealthGrid(h) {
  const sec = panelSection('System health');
  const grid = document.createElement('div');
  grid.className = 'operate-health-grid';
  grid.appendChild(renderAnchorBacklogPanel(h.anchorBacklog));
  grid.appendChild(renderTrustDriftPanel(h.trustDrift));
  grid.appendChild(renderPluginHealthPanel(h.pluginHealth));
  grid.appendChild(renderPolicyDenialsPanel(h.policyDenials));
  grid.appendChild(renderPendingApprovalsPanel(h.pendingApprovals));
  grid.appendChild(renderGasRegimePanel(h.gasRegime));
  grid.appendChild(renderRateLimitRegimePanel(h.rateLimitRegime));
  grid.appendChild(renderSubsystemStatePanel(h.subsystemState));
  grid.appendChild(renderExpiringAuthorityPanel(h.expiringAuthority));
  sec.body.appendChild(grid);

  if (h.network) {
    const nf = document.createElement('div');
    nf.className = 'operate-network-footer mono';
    nf.textContent = `network · block ${h.network.blockHeight} · anchor ${h.network.anchorMode || '—'}${h.network.l0Endpoint ? ' · ' + h.network.l0Endpoint : ''}`;
    sec.body.appendChild(nf);
  }
  return sec.element;
}

function renderAnchorBacklogPanel(b) {
  const card = healthPanelCard('anchorBacklog');
  if (!b) { card.appendChild(emptyText('no data')); return card; }
  card.appendChild(headlineRow(b.count || 0, 'anchors pending'));
  card.appendChild(severityRow(b.severity || 'normal'));
  if (Array.isArray(b.recent) && b.recent.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'operate-panel-list';
    for (const r of b.recent.slice(0, 5)) {
      const li = document.createElement('li');
      li.className = 'mono';
      li.textContent = `${r.artifactType || '—'} · ${shortHash(r.id || '', 22, 6)}`;
      ul.appendChild(li);
    }
    card.appendChild(ul);
  }
  return card;
}

function renderTrustDriftPanel(rows) {
  const card = healthPanelCard('trustDrift');
  const list = Array.isArray(rows) ? rows : [];
  card.appendChild(headlineRow(list.length, 'profiles drifted'));
  if (list.length === 0) {
    card.appendChild(severityRow('normal'));
    card.appendChild(emptyText('All profiles active.'));
    return card;
  }
  card.appendChild(severityRow(list[0].severity || 'attention'));
  const ul = document.createElement('ul');
  ul.className = 'operate-panel-list';
  for (const r of sortBySeverity(list).slice(0, 5)) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="mono">${shortHash(r.profileId || '', 22, 6)}</span> · ${r.state}${r.degradedReason ? ' — ' + r.degradedReason : ''}`;
    // RUNBOOK-04 Task 3 — drill into the Atlas trust drawer for this profile.
    if (r.profileId) {
      makeNavigable(li, () => '#/govern/trustProfiles/' + encodeURIComponent(r.profileId));
    }
    ul.appendChild(li);
  }
  card.appendChild(ul);
  return card;
}

function renderPluginHealthPanel(p) {
  const card = healthPanelCard('pluginHealth');
  if (!p) { card.appendChild(emptyText('no data')); return card; }
  const total = p.total || 0;
  const active = p.active || 0;
  const degraded = Array.isArray(p.degraded) ? p.degraded : [];
  card.appendChild(headlineRow(`${active}/${total}`, 'plugins active'));
  card.appendChild(severityRow(degraded.length > 0 ? 'attention' : 'normal'));
  if (degraded.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'operate-panel-list';
    for (const d of degraded.slice(0, 5)) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="mono">${shortHash(d.pluginId || '', 22, 6)}</span> · ${d.lifecycleState || '—'}`;
      ul.appendChild(li);
    }
    card.appendChild(ul);
  }
  return card;
}

function renderPolicyDenialsPanel(d) {
  const card = healthPanelCard('policyDenials');
  if (!d) { card.appendChild(emptyText('no data')); return card; }
  card.appendChild(headlineRow(d.count || 0, 'recent denials'));
  card.appendChild(severityRow((d.count || 0) > 0 ? 'attention' : 'normal'));
  // RUNBOOK-04 Task 3 — drill into governance. Degraded fallback to the policies
  // list until operateHealth emits the denying-policy id.
  // TODO(RUNBOOK-04 T3 / backend operateHealth): emit recent[].policyId to deep-link the exact node.
  if ((d.count || 0) > 0) {
    makeNavigable(card, () => (d.recent && d.recent[0] && d.recent[0].policyId)
      ? '#/govern/policies/' + encodeURIComponent(d.recent[0].policyId)
      : '#/govern/policies');
  }
  return card;
}

function renderPendingApprovalsPanel(a) {
  const card = healthPanelCard('pendingApprovals');
  if (!a) { card.appendChild(emptyText('no data')); return card; }
  card.appendChild(headlineRow(a.count || 0, 'awaiting signature'));
  card.appendChild(severityRow((a.count || 0) > 0 ? 'attention' : 'normal'));
  // RUNBOOK-04 Task 3 — one click from "3 awaiting signature" to the approvals lane.
  makeNavigable(card, () => '#/inbox/approvals');
  return card;
}

function renderGasRegimePanel(g) {
  const card = healthPanelCard('gasRegime');
  if (!g) { card.appendChild(emptyText('no data')); return card; }
  card.appendChild(headlineRow(g.scheduleVersion || '—', 'schedule'));
  card.appendChild(severityRow('normal'));
  if (g.description) {
    const p = document.createElement('p');
    p.className = 'operate-panel-desc';
    p.textContent = g.description;
    card.appendChild(p);
  }
  return card;
}

function renderRateLimitRegimePanel(r) {
  const card = healthPanelCard('rateLimitRegime');
  if (!r) { card.appendChild(emptyText('no data')); return card; }
  card.appendChild(headlineRow(r.scope || '—', 'scope'));
  card.appendChild(severityRow('normal'));
  if (r.description) {
    const p = document.createElement('p');
    p.className = 'operate-panel-desc';
    p.textContent = r.description;
    card.appendChild(p);
  }
  return card;
}

function renderSubsystemStatePanel(s) {
  const card = healthPanelCard('subsystemState');
  const list = (s && Array.isArray(s.subsystems)) ? s.subsystems : [];
  const paused = list.filter((x) => x.state !== 'active').length;
  card.appendChild(headlineRow(`${list.length - paused}/${list.length}`, 'subsystems active'));
  card.appendChild(severityRow(paused > 0 ? 'attention' : 'normal'));
  if (list.length > 0) {
    const ul = document.createElement('ul');
    ul.className = 'operate-panel-list';
    for (const x of list) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="mono">${x.name}</span> · <span class="operate-subsystem-state operate-subsystem-state-${x.state}">${x.state}</span>`;
      ul.appendChild(li);
    }
    card.appendChild(ul);
  }
  return card;
}

// =================================================================
// Templates rail
// =================================================================
function renderTemplatesRail(rows) {
  const sec = panelSection('Operator action templates');
  const byClass = new Map();
  for (const r of rows) {
    if (!byClass.has(r.class)) byClass.set(r.class, []);
    byClass.get(r.class).push(r);
  }
  for (const [cls, items] of byClass) {
    const block = document.createElement('div');
    block.className = 'operate-template-block';
    const head = document.createElement('h4');
    head.className = 'operate-template-block-head';
    head.textContent = CLASS_LABELS[cls] || cls;
    block.appendChild(head);
    const grid = document.createElement('div');
    grid.className = 'operate-template-grid';
    for (const t of items) grid.appendChild(renderTemplateCard(t));
    block.appendChild(grid);
    sec.body.appendChild(block);
  }
  return sec.element;
}

function renderTemplateCard(t) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = `operate-template-card severity-${t.severity || 'normal'}`;

  const head = document.createElement('div');
  head.className = 'operate-template-card-head';
  const name = document.createElement('span');
  name.className = 'operate-template-card-name';
  name.textContent = t.displayName;
  head.appendChild(name);
  head.appendChild(severityBadge(t.severity || 'normal'));
  card.appendChild(head);

  const desc = document.createElement('p');
  desc.className = 'operate-template-card-desc';
  desc.textContent = t.description;
  card.appendChild(desc);

  const goal = document.createElement('div');
  goal.className = 'operate-template-card-goal mono';
  goal.textContent = `goalType: ${t.goalType}`;
  card.appendChild(goal);

  const cta = document.createElement('div');
  cta.className = 'operate-template-card-cta';
  cta.textContent = 'Open in Intent Studio →';
  card.appendChild(cta);

  card.addEventListener('click', () => {
    try {
      localStorage.setItem(SEED_LOCALSTORAGE_KEY, JSON.stringify({
        goalType:     t.goalType,
        customParams: t.customParams || {},
        source:       'operator-template',
        templateId:   t.id,
        capturedAt:   new Date().toISOString(),
      }));
    } catch (e) { /* localStorage unavailable */ }
    window.location.hash = '#/compose/' + encodeURIComponent(t.goalType);
  });

  return card;
}

// =================================================================
// Helpers
// =================================================================
function panelSection(title) {
  const wrap = document.createElement('details');
  wrap.className = 'dossier-section operate-section';
  wrap.open = true;
  const sum = document.createElement('summary');
  sum.className = 'dossier-section-head';
  sum.textContent = title;
  wrap.appendChild(sum);
  const body = document.createElement('div');
  body.className = 'dossier-section-body';
  wrap.appendChild(body);
  return { element: wrap, body };
}
function healthPanelCard(key) {
  const card = document.createElement('div');
  card.className = 'operate-health-panel';
  card.dataset.panel = key;
  const head = document.createElement('div');
  head.className = 'operate-health-panel-head';
  head.textContent = PANEL_LABELS[key] || key;
  card.appendChild(head);
  return card;
}
function headlineRow(big, label) {
  const wrap = document.createElement('div');
  wrap.className = 'operate-health-headline';
  const num = document.createElement('span');
  num.className = 'operate-health-headline-num';
  num.textContent = String(big);
  wrap.appendChild(num);
  const lbl = document.createElement('span');
  lbl.className = 'operate-health-headline-label';
  lbl.textContent = label;
  wrap.appendChild(lbl);
  return wrap;
}
function severityRow(sev) {
  const wrap = document.createElement('div');
  wrap.className = 'operate-health-severity';
  wrap.appendChild(severityBadge(sev));
  return wrap;
}
function emptyText(text) {
  const p = document.createElement('p');
  p.className = 'operate-panel-empty';
  p.textContent = text;
  return p;
}

// RUNBOOK-04 Task 3 — make a health element navigable (mouse + keyboard) so an
// operator is one click from acting on what they see. `hashFn` is evaluated at
// activation so per-row ids resolve correctly.
function makeNavigable(el, hashFn) {
  el.classList.add('operate-panel-clickable');
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  const go = () => { const h = hashFn(); if (h) window.location.hash = h; };
  el.addEventListener('click', go);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
  });
}

// RUNBOOK-04 Task 3 (G3.4) — expiring-authority panel + renew seed. Lists
// capabilities/roles the backend flags as expiring; each row seeds a previewable
// renew intent (never mutates directly — same operator-template loop the Console
// already uses). BACKEND DEP: operateHealth must expose expiringAuthority[]
// (id, kind, expiresAtBlock, renewGoalType). Until then this renders "no data" —
// no crash, no fabricated numbers.
function renderExpiringAuthorityPanel(list) {
  const card = healthPanelCard('expiringAuthority');
  const rows = Array.isArray(list) ? list.filter((r) => r && r.expiryState === 'expires_soon' || (r && r.expiresAtBlock)) : [];
  card.appendChild(headlineRow(rows.length, 'expiring soon'));
  if (rows.length === 0) {
    card.appendChild(severityRow('normal'));
    card.appendChild(emptyText('no data'));
    return card;
  }
  card.appendChild(severityRow('attention'));
  const ul = document.createElement('ul');
  ul.className = 'operate-panel-list';
  for (const r of rows.slice(0, 5)) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'mono';
    label.textContent = `${r.kind || 'capability'} · ${shortHash(r.id || '', 18, 6)}` +
      (r.expiresAtBlock ? ` · @${r.expiresAtBlock}` : '');
    li.appendChild(label);
    if (r.renewGoalType) {
      const renew = document.createElement('button');
      renew.type = 'button';
      renew.className = 'operate-renew-btn';
      renew.textContent = 'Renew →';
      renew.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          localStorage.setItem(SEED_LOCALSTORAGE_KEY, JSON.stringify({
            goalType: r.renewGoalType,
            customParams: { capabilityId: r.id },
            source: 'operate-expiring',
            capturedAt: new Date().toISOString(),
          }));
        } catch (_) { /* localStorage unavailable */ }
        window.location.hash = '#/compose/' + encodeURIComponent(r.renewGoalType);
      });
      li.appendChild(renew);
    }
    ul.appendChild(li);
  }
  card.appendChild(ul);
  return card;
}

/** localStorage seed key the compose view reads on mount. */
export const SEED_KEY = SEED_LOCALSTORAGE_KEY;
