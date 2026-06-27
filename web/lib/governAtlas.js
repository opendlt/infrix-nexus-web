// Nexus — govern atlas renderer.
//
// NEXUS-REIMAGINED-2026-05-10 Phase 6 — Govern Atlas.
//
// Renders the projection returned by nexus.governAtlas + nexus.governNode
// into the dedicated authority atlas:
//
//   Sidebar      — kind chips (actors / roles / capabilities /
//                  policies / approvals / trust profiles / plugins)
//                  with live counts; click flips the active filter
//   Main grid    — list of nodes for the active kind
//   Drawer       — per-node deep panel rendering the spec-defined
//                  authority paths for that entity
//
// The atlas is a graph by way of relationships rather than a free-floating
// d3-style force layout: every node is a row, every relationship is a
// click-through into the drawer. Operators answer "who or what had
// authority to do this?" by walking the same paths the InvalidationChecker
// walks during governance enforcement.

import { shortHash, formatTime, jsonBlock, hashChip } from '/lib/spineCommon.js';
import { severityBadge } from '/lib/severity.js';
import { mountWhatIf } from '/lib/whatIfSimulator.js';

const KINDS = [
  { key: 'actors',         label: 'People & systems',  stage: 1 },
  { key: 'roles',          label: 'Roles',             stage: 2 },
  { key: 'capabilities',   label: 'Permissions',       stage: 3 },
  { key: 'policies',       label: 'Policies',          stage: 4 },
  { key: 'approvals',      label: 'Approvals',         stage: 5 },
  { key: 'trustProfiles',  label: 'Trust',             stage: 6 },
  { key: 'plugins',        label: 'Plugins',           stage: 7 },
];

const KIND_TO_NODE_KIND = {
  actors:        'actor',
  roles:         'role',
  capabilities:  'capability',
  policies:      'policy',
  approvals:     'approval',
  trustProfiles: 'trust',
  plugins:       'plugin',
};

/**
 * Render the govern atlas.
 * @param {Object} atlas      — nexus.governAtlas response
 * @param {Object} [opts]
 * @param {string} [opts.activeKind] — pre-select a kind tab
 * @param {(nodeKind, id) => void} [opts.onNodeOpen] — drawer trigger
 * @returns {HTMLElement}
 */
export function renderGovernAtlas(atlas, opts = {}) {
  const root = document.createElement('div');
  root.className = 'govern-atlas';
  if (!atlas || typeof atlas !== 'object') {
    root.appendChild(emptyText('No atlas data returned.'));
    return root;
  }

  const activeKind = opts.activeKind && KINDS.find((k) => k.key === opts.activeKind)
    ? opts.activeKind
    : KINDS[0].key;

  // Sidebar
  const layout = document.createElement('div');
  layout.className = 'govern-atlas-layout';
  root.appendChild(layout);

  const sidebar = document.createElement('aside');
  sidebar.className = 'govern-atlas-sidebar';
  for (const k of KINDS) {
    const a = document.createElement('a');
    a.className = 'govern-kind-chip';
    a.dataset.stage = String(k.stage);
    a.href = '#/govern/' + encodeURIComponent(k.key);
    if (k.key === activeKind) a.classList.add('active');
    const lbl = document.createElement('span');
    lbl.textContent = k.label;
    a.appendChild(lbl);
    const count = (atlas.counts && atlas.counts[k.key]) || (Array.isArray(atlas[k.key]) ? atlas[k.key].length : 0);
    const cnt = document.createElement('span');
    cnt.className = 'govern-kind-chip-count';
    cnt.textContent = String(count);
    a.appendChild(cnt);
    sidebar.appendChild(a);
  }
  layout.appendChild(sidebar);

  // Main column
  const main = document.createElement('section');
  main.className = 'govern-atlas-main';
  layout.appendChild(main);

  const head = document.createElement('header');
  head.className = 'govern-atlas-head';
  const title = document.createElement('h3');
  title.className = 'govern-atlas-title';
  title.textContent = (KINDS.find((k) => k.key === activeKind) || {}).label || activeKind;
  head.appendChild(title);
  if (atlas.disclosureContext) {
    const dc = document.createElement('div');
    dc.className = 'govern-atlas-disclosure mono';
    dc.textContent = `acting as ${atlas.disclosureContext.actor || '—'} · ${atlas.disclosureContext.purpose || '—'}`;
    head.appendChild(dc);
  }
  main.appendChild(head);

  const items = Array.isArray(atlas[activeKind]) ? atlas[activeKind] : [];
  if (items.length === 0) {
    main.appendChild(emptyText(`No ${(KINDS.find((k) => k.key === activeKind) || {}).label || activeKind} on this devnet.`));
  } else {
    const grid = document.createElement('div');
    grid.className = 'govern-node-grid';
    for (const node of items) {
      grid.appendChild(renderNodeRow(activeKind, node, opts));
    }
    main.appendChild(grid);
  }

  // Raw JSON details
  const rawDetails = document.createElement('details');
  rawDetails.className = 'raw-details govern-atlas-raw';
  const rawSum = document.createElement('summary');
  rawSum.textContent = 'Raw atlas JSON';
  rawDetails.appendChild(rawSum);
  rawDetails.appendChild(jsonBlock(atlas));
  root.appendChild(rawDetails);

  return root;
}

// RUNBOOK-07 SP4 — light/clear the atlas cards in a blast-radius set. The grid
// and the open drawer share the DOM, so this targets the live atlas cards by id.
function highlightAtlasCards(ids) {
  if (typeof document === 'undefined') return;
  const set = ids ? new Set(ids.map(String)) : null;
  document.querySelectorAll('.govern-node-card[data-node-id]').forEach((c) => {
    c.classList.toggle('atlas-blast-hot', !!set && set.has(c.dataset.nodeId));
  });
}

function renderNodeRow(kind, node, opts) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'govern-node-card';
  const nodeKind = KIND_TO_NODE_KIND[kind] || kind;
  card.dataset.kind = nodeKind;
  // RUNBOOK-07 SP4 — id handle so the blast-radius "highlight on graph" toggle
  // can light the affected atlas cards.
  if (node.id) card.dataset.nodeId = String(node.id);

  card.addEventListener('click', () => {
    if (typeof opts.onNodeOpen === 'function') {
      opts.onNodeOpen(nodeKind, node.id);
    } else {
      window.location.hash = `#/govern/${encodeURIComponent(kind)}/${encodeURIComponent(node.id)}`;
    }
  });

  const head = document.createElement('div');
  head.className = 'govern-node-head';
  const id = document.createElement('span');
  id.className = 'govern-node-id mono';
  id.textContent = shortHash(node.id || '', 28, 6);
  head.appendChild(id);
  // Severity / state pill
  if (node.state || node.lifecycleState || node.expiryState) {
    const st = document.createElement('span');
    st.className = 'govern-node-state';
    st.textContent = node.state || node.lifecycleState || node.expiryState;
    head.appendChild(st);
  }
  card.appendChild(head);

  const meta = document.createElement('div');
  meta.className = 'govern-node-meta';
  switch (kind) {
    case 'actors': {
      meta.appendChild(metaMicroRow('roles', (node.roles || []).join(', ') || '—'));
      meta.appendChild(metaMicroRow('capabilities', (node.capabilities || []).length ? `${node.capabilities.length} grant(s)` : '—'));
      break;
    }
    case 'roles': {
      meta.appendChild(metaMicroRow('role', node.role || '—'));
      meta.appendChild(metaMicroRow('identity', node.identity || '—'));
      meta.appendChild(metaMicroRow('derivation', node.derivationSource || 'explicit'));
      break;
    }
    case 'capabilities': {
      meta.appendChild(metaMicroRow('capability', node.capability || '—'));
      meta.appendChild(metaMicroRow('grantee', node.grantee || '—'));
      meta.appendChild(metaMicroRow('purpose', node.purpose || '—'));
      meta.appendChild(metaMicroRow('expiry', node.expiryState));
      if (node.expiresAtBlock) meta.appendChild(metaMicroRow('expires-at', String(node.expiresAtBlock)));
      break;
    }
    case 'policies': {
      meta.appendChild(metaMicroRow('type', node.policyType || '—'));
      meta.appendChild(metaMicroRow('target', shortHash(node.targetId || '', 22, 6)));
      meta.appendChild(metaMicroRow('rules', String(node.ruleCount || 0)));
      break;
    }
    case 'approvals': {
      meta.appendChild(metaMicroRow('plan', shortHash(node.planId || '', 22, 6)));
      meta.appendChild(metaMicroRow('identity', node.identity || '—'));
      meta.appendChild(metaMicroRow('role', node.role || '—'));
      break;
    }
    case 'trustProfiles': {
      meta.appendChild(metaMicroRow('state', node.state || '—'));
      if (node.degradedReason) meta.appendChild(metaMicroRow('reason', node.degradedReason));
      meta.appendChild(metaMicroRow('version', String(node.version || 0)));
      break;
    }
    case 'plugins': {
      meta.appendChild(metaMicroRow('family', node.family || '—'));
      meta.appendChild(metaMicroRow('version', node.version || '—'));
      meta.appendChild(metaMicroRow('lifecycle', node.lifecycleState || '—'));
      meta.appendChild(metaMicroRow('admissible', node.productionAdmissible ? 'yes' : 'no'));
      break;
    }
  }
  card.appendChild(meta);
  return card;
}

// =================================================================
// Drilldown drawer
// =================================================================
/**
 * Render a per-node deep panel from the nexus.governNode response.
 * @param {Object} response — { kind, id, actor|role|capability|... }
 * @returns {HTMLElement}
 */
export function renderGovernNode(response) {
  const root = document.createElement('div');
  root.className = 'govern-drawer';
  if (!response || typeof response !== 'object') {
    root.appendChild(emptyText('No node data.'));
    return root;
  }
  const kind = response.kind;
  const dKey = ({
    actor: 'actor', role: 'role', capability: 'capability',
    policy: 'policy', approval: 'approval',
    trust: 'trustProfile', plugin: 'plugin',
  })[kind] || kind;
  const data = response[dKey];
  if (!data) {
    root.appendChild(emptyText('Node not found in the atlas.'));
    return root;
  }

  const head = document.createElement('header');
  head.className = 'govern-drawer-head';
  const title = document.createElement('h3');
  title.className = 'govern-drawer-title';
  title.textContent = `${labelKind(kind)} · ${shortHash(data.id || response.id || '', 28, 6)}`;
  head.appendChild(title);
  root.appendChild(head);

  // Per-kind rendering
  switch (kind) {
    case 'actor': renderActorPanel(root, data); break;
    case 'role': renderRolePanel(root, data); break;
    case 'capability': renderCapabilityPanel(root, data); break;
    case 'policy': renderPolicyPanel(root, data); break;
    case 'trust': renderTrustPanel(root, data); break;
    case 'plugin': renderPluginPanel(root, data); break;
    case 'approval': renderApprovalPanel(root, data); break;
    default: root.appendChild(emptyText('Unknown kind.'));
  }

  // RUNBOOK-07 SP4 — the what-if blast-radius simulator on the authority drawers.
  // Trust degrade is exact (server dependentApprovals); capability/role are
  // derived from the atlas and badged "estimated".
  if (kind === 'trust' || kind === 'capability' || kind === 'role') {
    mountWhatIf(root, { kind, node: data, onHighlight: highlightAtlasCards });
  }

  // Raw JSON
  const raw = document.createElement('details');
  raw.className = 'raw-details govern-drawer-raw';
  const sum = document.createElement('summary');
  sum.textContent = 'Raw node JSON';
  raw.appendChild(sum);
  raw.appendChild(jsonBlock(response));
  root.appendChild(raw);

  return root;
}

function renderActorPanel(root, a) {
  root.appendChild(renderListPanel('Roles held', a.roles, (r) => `${r.role} (${r.id})`));
  root.appendChild(renderListPanel('Capabilities granted', a.capabilities, (c) => `${c.capability} — ${c.purpose || 'no purpose'}`));
  root.appendChild(renderListPanel('Approvals signed', a.approvals, (ap) => `${ap.role || '—'} on ${shortHash(ap.planId || '', 22, 6)} (${ap.state})`));
  root.appendChild(renderListPanel('Intents submitted', a.intents, (i) => `${shortHash(i.id, 22, 6)} (${i.state || '—'})`));
}

function renderRolePanel(root, r) {
  const sec = panelSection('Role binding');
  const grid = makeGrid();
  grid.appendChild(metaRow('Role', r.role || '—'));
  grid.appendChild(metaRow('Identity', r.identity || '—'));
  grid.appendChild(metaRow('Key page', r.keyPage || '—'));
  grid.appendChild(metaRow('Scope', r.scope || '—'));
  if (r.scopeTarget) grid.appendChild(metaRow('Scope target', r.scopeTarget));
  grid.appendChild(metaRow('Derivation source', r.derivationSource || 'explicit'));
  grid.appendChild(metaRow('State', r.state || '—'));
  if (r.expiresAtBlock) grid.appendChild(metaRow('Expires at block', String(r.expiresAtBlock)));
  sec.body.appendChild(grid);
  root.appendChild(sec.element);

  // Holders of the same role
  root.appendChild(renderListPanel(`Other holders of role "${r.role}"`, (r.holders || []).filter((h) => h.id !== r.id), (h) => `${h.identity} (${h.scope || 'global'})`));

  // Bound policies
  root.appendChild(renderListPanel('Bound policies', r.policies, (p) => `${p.policyType} → ${shortHash(p.targetId || '', 22, 6)}`));

  // RUNBOOK-04 Task 4 — seed a previewable re-assign/amend of this role binding
  // (ROLE_ASSIGN). No REVOKE goal type exists in the catalogue, so we do not
  // fabricate one — re-assign is the supported governed operation.
  root.appendChild(drawerActions([
    seedIntentAction('Re-assign / amend →', 'ROLE_ASSIGN', { role: r.role, identity: r.identity }),
  ]));
}

function renderCapabilityPanel(root, c) {
  const sec = panelSection('Capability grant');
  const grid = makeGrid();
  grid.appendChild(metaRow('Capability', c.capability || '—'));
  grid.appendChild(metaRow('Grantee', c.grantee || '—'));
  if (c.grantor) grid.appendChild(metaRow('Grantor', c.grantor));
  if (c.purpose) grid.appendChild(metaRow('Purpose', c.purpose));
  if (c.object) grid.appendChild(metaRow('Object', c.object));
  if (c.delegationDepth !== undefined) grid.appendChild(metaRow('Delegation depth', String(c.delegationDepth)));
  if (c.expiresAtBlock) grid.appendChild(metaRow('Expires at block', String(c.expiresAtBlock)));
  if (c.currentBlock !== undefined) grid.appendChild(metaRow('Current block', String(c.currentBlock)));
  // Expiry state pill
  const state = document.createElement('div');
  state.className = `govern-expiry-banner expiry-${c.expiryState || 'active'}`;
  state.textContent = ({
    active:       '✓ Capability is active',
    expires_soon: '⚠ Capability expires soon',
    expired:      '✗ Capability has expired',
  })[c.expiryState] || c.expiryState;
  sec.body.appendChild(state);
  sec.body.appendChild(grid);
  root.appendChild(sec.element);

  // Delegation chain
  if (Array.isArray(c.delegationChain) && c.delegationChain.length > 0) {
    root.appendChild(renderListPanel('Delegation chain', c.delegationChain.map((id) => ({ id })), (e) => e.id));
  }

  // RUNBOOK-04 Task 4 — act on an expiring/active grant without leaving the
  // governance model: seed a previewable renew intent (CAPABILITY_GRANT).
  root.appendChild(drawerActions([
    seedIntentAction('Renew capability →', 'CAPABILITY_GRANT', { capabilityId: c.id }),
  ]));
}

// RUNBOOK-04 Task 4 — seed a previewable governed intent from a drawer. NEVER
// mutates directly: it writes the operator seed Studio already reads, then opens
// the preview form. Reuses the exact SEED_KEY literal the Operate console uses
// (operatePanel SEED_LOCALSTORAGE_KEY) so Studio's seed reader picks it up.
const GOVERN_SEED_KEY = 'nexus.compose.operatorSeed';
function seedIntentAction(label, goalType, customParams) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'verify-btn govern-drawer-action';
  btn.textContent = label;
  btn.addEventListener('click', () => {
    try {
      localStorage.setItem(GOVERN_SEED_KEY, JSON.stringify({
        goalType, customParams, source: 'govern-drawer',
        capturedAt: new Date().toISOString(),
      }));
    } catch (_) { /* localStorage unavailable */ }
    window.location.hash = '#/compose/' + encodeURIComponent(goalType);
  });
  return btn;
}
function drawerActions(btns) {
  const sec = panelSection('Actions');
  const row = document.createElement('div');
  row.className = 'govern-drawer-actions';
  for (const b of btns) row.appendChild(b);
  sec.body.appendChild(row);
  return sec.element;
}

// RUNBOOK-04 Task 4 (G3.5) — render policy rules as a readable table instead of a
// raw JSON dump. Columns are the union of keys with stable leading ones.
function renderPolicyRulesTable(rules) {
  const tbl = document.createElement('table');
  tbl.className = 'dossier-table govern-policy-rules';
  const lead = ['effect', 'condition', 'action', 'target', 'priority'];
  const present = lead.filter((c) => rules.some((r) => r && r[c] !== undefined));
  const extras = [...new Set(rules.flatMap((r) => Object.keys(r || {})))].filter((k) => !present.includes(k));
  const head = [...present, ...extras];
  const thead = document.createElement('thead');
  const htr = document.createElement('tr');
  for (const h of head) { const th = document.createElement('th'); th.textContent = h; htr.appendChild(th); }
  thead.appendChild(htr);
  tbl.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const r of rules) {
    const tr = document.createElement('tr');
    for (const h of head) {
      const td = document.createElement('td');
      td.className = 'mono';
      const v = r ? r[h] : undefined;
      td.textContent = v === undefined ? '—' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
  return tbl;
}

function renderPolicyPanel(root, p) {
  const sec = panelSection('Policy binding');
  const grid = makeGrid();
  grid.appendChild(metaRow('Type', p.policyType || '—'));
  grid.appendChild(metaRow('Target', p.targetId || '—'));
  grid.appendChild(metaRow('Scope', p.scope || '—'));
  if (p.deadline) grid.appendChild(metaRow('Deadline', String(p.deadline)));
  grid.appendChild(metaRow('State', p.state || '—'));
  sec.body.appendChild(grid);
  root.appendChild(sec.element);

  // Rules — readable table, with the raw JSON kept under a <details> for experts.
  if (Array.isArray(p.rules) && p.rules.length > 0) {
    const rsec = panelSection(`Rules · ${p.rules.length}`);
    rsec.body.appendChild(renderPolicyRulesTable(p.rules));
    const raw = document.createElement('details');
    raw.className = 'govern-rules-raw';
    const sum = document.createElement('summary');
    sum.textContent = 'Raw rule JSON';
    raw.appendChild(sum);
    raw.appendChild(jsonBlock(p.rules));
    rsec.body.appendChild(raw);
    root.appendChild(rsec.element);
  }
  // Affected intents
  root.appendChild(renderListPanel('Affected intents', p.affected, (i) => `${shortHash(i.id, 22, 6)} (${i.state || '—'})`));

  // RUNBOOK-04 Task 4 — seed a previewable amend (POLICY_BIND re-bind).
  root.appendChild(drawerActions([
    seedIntentAction('Amend policy →', 'POLICY_BIND', { policyId: p.id || p.targetId }),
  ]));
}

function renderTrustPanel(root, t) {
  const sec = panelSection('Trust profile');
  const grid = makeGrid();
  grid.appendChild(metaRow('Profile ID', t.profileId || '—'));
  grid.appendChild(metaRow('State', t.state || '—'));
  grid.appendChild(metaRow('Version', String(t.version || 0)));
  if (t.degradedReason) grid.appendChild(metaRow('Degraded reason', t.degradedReason));
  if (t.degradedAt) grid.appendChild(metaRow('Degraded at', t.degradedAt));
  // Drift impact banner
  const banner = document.createElement('div');
  banner.className = `govern-trust-banner trust-${t.state || 'active'}`;
  banner.textContent = t.state === 'active'
    ? '✓ Trust profile is active — no drift impact.'
    : `⚠ Trust profile is ${t.state} — ${t.driftImpactCount || 0} dependent approval(s) structurally invalidated.`;
  sec.body.appendChild(banner);
  sec.body.appendChild(grid);
  root.appendChild(sec.element);

  // Dependent approvals + drift impact
  root.appendChild(renderListPanel(`Dependent approvals · ${t.dependentApprovalCount || 0}`, t.dependentApprovals || [], (a) =>
    `${a.role || '—'} on ${shortHash(a.planId || '', 22, 6)} ${a.invalidated ? '· INVALIDATED' : ''}`));
}

function renderPluginPanel(root, p) {
  const sec = panelSection('Plugin descriptor');
  const grid = makeGrid();
  grid.appendChild(metaRow('Plugin ID', p.pluginId || '—'));
  grid.appendChild(metaRow('Name', p.name || '—'));
  grid.appendChild(metaRow('Version', p.version || '—'));
  grid.appendChild(metaRow('Family', p.family || '—'));
  grid.appendChild(metaRow('Provider', p.provider || '—'));
  grid.appendChild(metaRow('Primary category', p.primaryCategory || '—'));
  grid.appendChild(metaRow('Backend class', p.backendClass || '—'));
  grid.appendChild(metaRow('Lifecycle', p.lifecycleState || '—'));
  grid.appendChild(metaRow('Production admissible', p.productionAdmissible ? 'yes' : 'no'));
  if (p.implementationHash) grid.appendChild(metaRowHash('Implementation hash', p.implementationHash));
  sec.body.appendChild(grid);
  root.appendChild(sec.element);

  // Lifecycle / capabilities
  const lsec = panelSection('Lifecycle & capabilities');
  const lgrid = makeGrid();
  if (p.timingClass) lgrid.appendChild(metaRow('Timing class', p.timingClass));
  if (p.commitModel) lgrid.appendChild(metaRow('Commit model', p.commitModel));
  if (p.finalityModel) lgrid.appendChild(metaRow('Finality model', p.finalityModel));
  if (p.simulationSupport) lgrid.appendChild(metaRow('Simulation support', p.simulationSupport));
  if (p.approvalSensitivity) lgrid.appendChild(metaRow('Approval sensitivity', p.approvalSensitivity));
  if (p.confidentialityProfile) lgrid.appendChild(metaRow('Confidentiality', p.confidentialityProfile));
  if (p.costTier) lgrid.appendChild(metaRow('Cost tier', p.costTier));
  if (p.isolationBoundary) lgrid.appendChild(metaRow('Isolation boundary', p.isolationBoundary));
  if (p.memoryBoundary) lgrid.appendChild(metaRow('Memory boundary', p.memoryBoundary));
  if (p.concurrencyModel) lgrid.appendChild(metaRow('Concurrency model', p.concurrencyModel));
  if (p.reentrancyModel) lgrid.appendChild(metaRow('Reentrancy', p.reentrancyModel));
  lsec.body.appendChild(lgrid);
  root.appendChild(lsec.element);

  // Upgrade report
  if (p.upgradeReport) {
    const usec = panelSection('Upgrade report');
    const ugrid = makeGrid();
    ugrid.appendChild(metaRow('Current version', p.upgradeReport.currentVersion || '—'));
    ugrid.appendChild(metaRow('Production admissible', p.upgradeReport.productionAdmissible ? 'yes' : 'no'));
    ugrid.appendChild(metaRow('Lifecycle state', p.upgradeReport.lifecycleState || '—'));
    if (p.upgradeReport.implementationHash) ugrid.appendChild(metaRowHash('Implementation hash', p.upgradeReport.implementationHash));
    usec.body.appendChild(ugrid);
    root.appendChild(usec.element);
  }
}

function renderApprovalPanel(root, a) {
  const sec = panelSection('Approval envelope');
  const grid = makeGrid();
  grid.appendChild(metaRow('Approval ID', a.id || '—'));
  if (a.intentId) grid.appendChild(metaRow('Intent', a.intentId));
  if (a.planId) grid.appendChild(metaRow('Plan', a.planId));
  grid.appendChild(metaRow('Identity', a.identity || '—'));
  grid.appendChild(metaRow('Role', a.role || '—'));
  if (a.keyPage) grid.appendChild(metaRow('Key page', a.keyPage));
  if (a.trustProfId) grid.appendChild(metaRow('Trust profile', a.trustProfId));
  grid.appendChild(metaRow('State', a.state || '—'));
  grid.appendChild(metaRow('Created', formatTime(a.created)));
  sec.body.appendChild(grid);
  root.appendChild(sec.element);

  // Open approval dossier link
  if (a.planId) {
    const cta = document.createElement('a');
    cta.className = 'govern-drawer-cta';
    cta.href = '#/approve/' + encodeURIComponent(a.planId);
    cta.textContent = 'Open approval dossier →';
    root.appendChild(cta);
  }
}

// =================================================================
// Helpers
// =================================================================
function panelSection(title) {
  const wrap = document.createElement('details');
  wrap.className = 'dossier-section govern-drawer-section';
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

function renderListPanel(title, items, fmt) {
  const sec = panelSection(`${title} · ${(items || []).length}`);
  if (!items || items.length === 0) {
    sec.body.appendChild(emptyText('—'));
    return sec.element;
  }
  const ul = document.createElement('ul');
  ul.className = 'govern-drawer-list';
  for (const e of items) {
    const li = document.createElement('li');
    li.textContent = fmt(e);
    ul.appendChild(li);
  }
  sec.body.appendChild(ul);
  return sec.element;
}

function makeGrid() {
  const g = document.createElement('div');
  g.className = 'dossier-summary-grid';
  return g;
}
function metaRow(label, value) {
  const row = document.createElement('div');
  row.className = 'cockpit-compose-meta-row';
  const l = document.createElement('span');
  l.className = 'cockpit-compose-meta-label';
  l.textContent = label;
  row.appendChild(l);
  const v = document.createElement('span');
  v.className = 'cockpit-compose-meta-value mono';
  v.textContent = String(value);
  row.appendChild(v);
  return row;
}
function metaRowHash(label, hashStr) {
  const row = document.createElement('div');
  row.className = 'cockpit-compose-meta-row';
  const l = document.createElement('span');
  l.className = 'cockpit-compose-meta-label';
  l.textContent = label;
  row.appendChild(l);
  const v = document.createElement('span');
  v.className = 'cockpit-compose-meta-value';
  if (hashStr) v.appendChild(hashChip(hashStr, { head: 8, tail: 6 }));
  else { v.classList.add('mono'); v.textContent = '—'; }
  row.appendChild(v);
  return row;
}
function metaMicroRow(label, value) {
  const row = document.createElement('div');
  row.className = 'execution-step-meta-row';
  const l = document.createElement('span');
  l.className = 'execution-step-meta-label';
  l.textContent = label;
  row.appendChild(l);
  const v = document.createElement('span');
  v.className = 'execution-step-meta-value mono';
  v.textContent = String(value == null ? '—' : value);
  row.appendChild(v);
  return row;
}
function emptyText(text) {
  const p = document.createElement('p');
  p.className = 'govern-empty';
  p.textContent = text;
  return p;
}
function labelKind(k) {
  return ({
    actor: 'Actor', role: 'Role', capability: 'Capability',
    policy: 'Policy', approval: 'Approval',
    trust: 'Trust profile', plugin: 'Plugin',
  })[k] || k;
}
