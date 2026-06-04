// Nexus — Roles view (registry + bindings + per-identity + holders).
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 3: typed RoleBinding browser
// with derivation-source proof and role-by-identity / role-holders
// drilldowns.
//
// Subpaths:
//   #/roles                       — distinct role names with holder counts
//   #/roles/_bindings             — every TypeRoleBinding (raw)
//   #/roles/_holders/<role>       — every binding for a role
//   #/roles/_identity/<idURL>     — every binding for an identity
//   #/roles/<bindingID>           — single binding detail with derivation source

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

export const rolesView = {
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
  } else if (currentSubpath[0] === '_bindings') {
    renderAllBindings();
  } else if (currentSubpath[0] === '_holders' && currentSubpath[1]) {
    renderHolders(currentSubpath[1]);
  } else if (currentSubpath[0] === '_identity' && currentSubpath[1]) {
    renderByIdentity(currentSubpath[1]);
  } else {
    renderDetail(currentSubpath[0]);
  }
}

// -----------------------------------------------------------------
// Registry (distinct roles)
// -----------------------------------------------------------------
async function renderRegistry() {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const h = document.createElement('h2');
  h.textContent = 'Roles';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent = 'Distinct role names with holder counts. Drill into any role to see its holders, or paste an identity URL to see every role bound to it.';
  head.appendChild(sub);

  // Quick lookups
  const lookup = document.createElement('div');
  lookup.className = 'spine-filter-bar';
  const idLabel = document.createElement('label');
  idLabel.className = 'spine-filter';
  const idSpan = document.createElement('span');
  idSpan.textContent = 'Lookup by identity URL';
  idLabel.appendChild(idSpan);
  const idInput = document.createElement('input');
  idInput.type = 'text';
  idInput.placeholder = 'acc://alice.acme';
  idLabel.appendChild(idInput);
  const idBtn = document.createElement('button');
  idBtn.type = 'button';
  idBtn.className = 'verify-btn';
  idBtn.textContent = 'Show roles';
  idBtn.addEventListener('click', () => {
    const v = idInput.value.trim();
    if (v) window.location.hash = '#/roles/_identity/' + encodeURIComponent(v);
  });
  lookup.appendChild(idLabel);
  lookup.appendChild(idBtn);
  head.appendChild(lookup);

  const actions = document.createElement('div');
  actions.className = 'action-row';
  actions.appendChild(deeplinkButton('All bindings (raw)', 'roles', '_bindings'));
  head.appendChild(actions);
  rootEl.appendChild(head);

  let resp;
  try {
    resp = await rpcWithDisclosure('role.list', {});
  } catch (err) {
    rootEl.appendChild(errorNode(err));
    return;
  }
  const items = roleListItems(resp);
  if (items.length === 0) {
    rootEl.appendChild(emptyState('No roles defined.'));
    return;
  }

  const table = document.createElement('table');
  table.className = 'spine-table';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of ['Role', 'Holders', '']) {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const r of items) {
    const tr2 = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.className = 'mono';
    nameCell.textContent = r.role || r.Role || r.name || '—';
    tr2.appendChild(nameCell);
    const holderCell = document.createElement('td');
    holderCell.textContent = r.holderCount !== undefined ? r.holderCount : (r.holders || '—');
    tr2.appendChild(holderCell);
    const linkCell = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'deeplink-btn';
    btn.textContent = 'Show holders';
    btn.addEventListener('click', () => {
      window.location.hash = '#/roles/_holders/' + encodeURIComponent(r.role || r.Role || r.name || '');
    });
    linkCell.appendChild(btn);
    tr2.appendChild(linkCell);
    tbody.appendChild(tr2);
  }
  table.appendChild(tbody);
  rootEl.appendChild(table);
}

function roleListItems(resp) {
  if (!resp) return [];
  if (Array.isArray(resp.roles)) return resp.roles;
  if (Array.isArray(resp.items)) return resp.items;
  if (Array.isArray(resp)) return resp;
  return [];
}

// -----------------------------------------------------------------
// All bindings (raw)
// -----------------------------------------------------------------
async function renderAllBindings() {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/roles';
  back.textContent = '← Roles';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.textContent = 'All role bindings';
  head.appendChild(h);
  rootEl.appendChild(head);

  let resp;
  try {
    resp = await rpcWithDisclosure('explorer.roleBindings', { limit: 200 });
  } catch (err) {
    rootEl.appendChild(errorNode(err));
    return;
  }
  const items = (resp && Array.isArray(resp.items)) ? resp.items : [];
  if (items.length === 0) {
    rootEl.appendChild(emptyState('No role bindings.'));
    return;
  }
  rootEl.appendChild(buildBindingTable(items));
  const meta = document.createElement('div');
  meta.className = 'spine-table-meta';
  meta.textContent = `${items.length} binding${items.length === 1 ? '' : 's'}`;
  rootEl.appendChild(meta);
}

function buildBindingTable(items) {
  const table = document.createElement('table');
  table.className = 'spine-table';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of ['ID', 'Role', 'Identity', 'State', 'Created']) {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const b of items) tbody.appendChild(buildBindingRow(b));
  table.appendChild(tbody);
  return table;
}

function buildBindingRow(b) {
  const tr = document.createElement('tr');
  tr.style.cursor = 'pointer';
  tr.addEventListener('click', () => {
    window.location.hash = '#/roles/' + encodeURIComponent(b.id || b.ID);
  });
  const idCell = document.createElement('td');
  idCell.className = 'mono';
  idCell.textContent = shortHash(b.id || b.ID, 14, 6);
  idCell.title = b.id || b.ID;
  tr.appendChild(idCell);
  tr.appendChild(tdMono(readField(b, 'Role') || readField(b, 'role')));
  tr.appendChild(tdMono(readField(b, 'Identity') || readField(b, 'identity')));
  const state = b.state || b.State || readField(b, 'State') || 'active';
  tr.appendChild(tdPill(state, state === 'active' ? 'ok' : 'alert'));
  const created = document.createElement('td');
  created.textContent = formatTime(b.created || b.Created);
  tr.appendChild(created);
  return tr;
}

// -----------------------------------------------------------------
// Holders of a role
// -----------------------------------------------------------------
async function renderHolders(role) {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/roles';
  back.textContent = '← Roles';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.textContent = 'Holders of role';
  head.appendChild(h);
  const sp = document.createElement('p');
  sp.className = 'spine-section-sub mono';
  sp.textContent = role;
  head.appendChild(sp);
  rootEl.appendChild(head);

  const wrap = document.createElement('div');
  wrap.appendChild(loadingNode('Loading holders…'));
  rootEl.appendChild(wrap);
  let resp;
  try {
    resp = await rpcWithDisclosure('explorer.roleHolders', { role });
  } catch (err) {
    wrap.replaceChildren(errorNode(err));
    return;
  }
  const items = (resp && Array.isArray(resp.bindings)) ? resp.bindings : [];
  if (items.length === 0) {
    wrap.replaceChildren(emptyState('No holders.'));
    return;
  }
  wrap.replaceChildren(buildBindingTable(items));
}

// -----------------------------------------------------------------
// By identity
// -----------------------------------------------------------------
async function renderByIdentity(identity) {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/roles';
  back.textContent = '← Roles';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.textContent = 'Roles for identity';
  head.appendChild(h);
  const sp = document.createElement('p');
  sp.className = 'spine-section-sub mono';
  sp.textContent = identity;
  head.appendChild(sp);
  rootEl.appendChild(head);

  const wrap = document.createElement('div');
  wrap.appendChild(loadingNode('Loading bindings…'));
  rootEl.appendChild(wrap);
  let resp;
  try {
    resp = await rpcWithDisclosure('explorer.roleByIdentity', { identity });
  } catch (err) {
    wrap.replaceChildren(errorNode(err));
    return;
  }
  const items = (resp && Array.isArray(resp.bindings)) ? resp.bindings : [];
  if (items.length === 0) {
    wrap.replaceChildren(emptyState('No bindings for this identity.'));
    return;
  }
  wrap.replaceChildren(buildBindingTable(items));
}

// -----------------------------------------------------------------
// Detail
// -----------------------------------------------------------------
async function renderDetail(bindingID) {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/roles';
  back.textContent = '← Roles';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.className = 'mono';
  h.textContent = bindingID;
  head.appendChild(h);
  rootEl.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  rootEl.appendChild(grid);

  // Find the binding via the all-bindings list
  let binding;
  try {
    const resp = await rpcWithDisclosure('explorer.roleBindings', { limit: 500 });
    const items = (resp && Array.isArray(resp.items)) ? resp.items : [];
    binding = items.find((b) => (b.id || b.ID) === bindingID);
  } catch (err) {
    grid.appendChild(errorNode(err));
    return;
  }
  if (!binding) {
    grid.appendChild(errorNode(new Error('binding not found')));
    return;
  }

  const role = readField(binding, 'Role') || readField(binding, 'role');
  const identity = readField(binding, 'Identity') || readField(binding, 'identity');
  const state = binding.state || binding.State || 'active';
  const derivationSource = readField(binding, 'DerivationSource') || readField(binding, 'derivationSource');
  const keyPage = readField(binding, 'KeyPage') || readField(binding, 'keyPage');
  const keyHash = readField(binding, 'KeyHash') || readField(binding, 'keyHash');

  // Header
  const headerBody = document.createElement('div');
  headerBody.appendChild(kvRow('Role', role || '—'));
  headerBody.appendChild(kvRow('Identity', identity || '—'));
  headerBody.appendChild(kvRow('State', statusPill(state, state === 'active' ? 'ok' : 'alert')));
  headerBody.appendChild(kvRow('Created', formatTime(binding.created || binding.Created)));
  headerBody.appendChild(kvRow('Updated', formatTime(binding.updated || binding.Updated)));
  if (binding.createdByIntentID || binding.CreatedByIntentID) {
    headerBody.appendChild(kvRow('Created by intent', shortHashLink(binding.createdByIntentID || binding.CreatedByIntentID, 'intents')));
  }
  grid.appendChild(card('Binding envelope', headerBody));

  // Derivation source — proof that this binding was minted by an
  // authorised act (e.g. ROLE_ASSIGN intent + signing key page on L0).
  const derBody = document.createElement('div');
  if (derivationSource) derBody.appendChild(kvRow('Source', derivationSource));
  if (keyPage) derBody.appendChild(kvRow('Key page', keyPage));
  if (keyHash) derBody.appendChild(kvRow('Key hash', keyHash));
  if (!derivationSource && !keyPage && !keyHash) {
    derBody.appendChild(emptyState('No explicit derivation source recorded on this binding.'));
  }
  derBody.appendChild(document.createTextNode(
    ' Bindings created via ROLE_ASSIGN intents carry their CreatedByIntentID provenance — click "Created by intent" above to see the original assignment.'
  ));
  grid.appendChild(card('Derivation source', derBody));

  // Cross-links
  const linksBody = document.createElement('div');
  linksBody.className = 'action-row';
  if (role) linksBody.appendChild(deeplinkButton('Other holders', 'roles', '_holders', role));
  if (identity) linksBody.appendChild(deeplinkButton('All roles for identity', 'roles', '_identity', identity));
  grid.appendChild(card('Cross-links', linksBody));

  // Raw
  const rawBody = document.createElement('details');
  rawBody.className = 'raw-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Raw managed object';
  rawBody.appendChild(summary);
  rawBody.appendChild(jsonBlock(binding));
  grid.appendChild(card('Inspect', rawBody));
}

// Helpers
function readField(obj, key) {
  if (!obj) return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  const fields = obj.fields;
  if (fields && Object.prototype.hasOwnProperty.call(fields, key)) return fields[key];
  return undefined;
}
function tdMono(text) {
  const t = document.createElement('td');
  t.className = 'mono';
  t.textContent = (text === undefined || text === null) ? '—' : String(text);
  return t;
}
function tdPill(text, kind) {
  const t = document.createElement('td');
  t.appendChild(statusPill(text, kind));
  return t;
}
function shortHashLink(value, route) {
  const a = document.createElement('a');
  a.className = 'mono spine-link';
  a.href = `#/${route}/${encodeURIComponent(value)}`;
  a.textContent = shortHash(value, 14, 6);
  a.title = value;
  return a;
}
