// Nexus — Capabilities view (registry + per-identity + grant detail).
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 3: per-identity capability
// inventory + grant/revoke audit trail + capability manifest viewer.
//
// Subpaths:
//   #/capabilities                — distinct capability names + recent grants
//   #/capabilities/_identity/<id> — per-identity grant inventory
//   #/capabilities/<grantID>      — single-grant detail with delegation chain

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

export const capabilitiesView = {
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
  } else if (currentSubpath[0] === '_identity' && currentSubpath[1]) {
    renderByIdentity(currentSubpath[1]);
  } else {
    renderDetail(currentSubpath[0]);
  }
}

// -----------------------------------------------------------------
// Registry
// -----------------------------------------------------------------
async function renderRegistry() {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const h = document.createElement('h2');
  h.textContent = 'Capabilities';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent = 'Capability grants — distinct capability names + the grants in flight, with per-identity drilldown and per-grant delegation chain inspection.';
  head.appendChild(sub);

  // Identity lookup form
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
  idBtn.textContent = 'Show capabilities';
  idBtn.addEventListener('click', () => {
    const v = idInput.value.trim();
    if (v) window.location.hash = '#/capabilities/_identity/' + encodeURIComponent(v);
  });
  lookup.appendChild(idLabel);
  lookup.appendChild(idBtn);
  head.appendChild(lookup);
  rootEl.appendChild(head);

  // Two parallel calls: distinct names, plus full grant list.
  const [names, grants] = await Promise.all([
    rpcWithDisclosure('capability.list', {}).catch((e) => ({ error: e })),
    rpcWithDisclosure('explorer.capabilityGrants', { limit: 100 }).catch((e) => ({ error: e })),
  ]);

  const namesCard = document.createElement('section');
  namesCard.className = 'spine-card';
  const nTitle = document.createElement('h3');
  nTitle.className = 'spine-card-title';
  nTitle.textContent = 'Distinct capability names';
  namesCard.appendChild(nTitle);
  if (names && names.error) {
    namesCard.appendChild(errorNode(names.error));
  } else {
    const namesArr = capabilityNames(names);
    if (namesArr.length === 0) {
      namesCard.appendChild(emptyState('No capabilities discovered.'));
    } else {
      const list = document.createElement('ul');
      list.className = 'plain-list';
      for (const n of namesArr) {
        const li = document.createElement('li');
        li.className = 'mono';
        li.textContent = n;
        list.appendChild(li);
      }
      namesCard.appendChild(list);
    }
  }
  rootEl.appendChild(namesCard);

  const grantsCard = document.createElement('section');
  grantsCard.className = 'spine-card';
  const gTitle = document.createElement('h3');
  gTitle.className = 'spine-card-title';
  gTitle.textContent = 'Recent grants';
  grantsCard.appendChild(gTitle);
  if (grants && grants.error) {
    grantsCard.appendChild(errorNode(grants.error));
  } else {
    const items = (grants && Array.isArray(grants.items)) ? grants.items : [];
    if (items.length === 0) {
      grantsCard.appendChild(emptyState('No grants yet.'));
    } else {
      grantsCard.appendChild(buildGrantTable(items));
    }
  }
  rootEl.appendChild(grantsCard);
}

function capabilityNames(resp) {
  if (!resp) return [];
  if (Array.isArray(resp.names)) return resp.names;
  if (Array.isArray(resp.capabilities)) return resp.capabilities;
  if (Array.isArray(resp.items)) return resp.items;
  if (Array.isArray(resp)) return resp;
  return [];
}

function buildGrantTable(items) {
  const table = document.createElement('table');
  table.className = 'spine-table';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of ['ID', 'Capability', 'Grantee', 'Delegated from', 'State', 'Created']) {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const g of items) {
    const r = document.createElement('tr');
    r.style.cursor = 'pointer';
    r.addEventListener('click', () => { window.location.hash = '#/capabilities/' + encodeURIComponent(g.id || g.ID); });

    const idCell = document.createElement('td');
    idCell.className = 'mono';
    idCell.textContent = shortHash(g.id || g.ID, 14, 6);
    idCell.title = g.id || g.ID;
    r.appendChild(idCell);

    r.appendChild(tdMono(readField(g, 'Capability') || readField(g, 'capability')));
    r.appendChild(tdMono(readField(g, 'Grantee') || readField(g, 'grantee') || readField(g, 'Identity')));
    r.appendChild(tdMono(readField(g, 'DelegatedFrom') || readField(g, 'delegatedFrom') || '—'));

    const state = g.state || g.State || readField(g, 'State') || 'active';
    r.appendChild(tdPill(state, state === 'active' || state === 'granted' ? 'ok' : 'alert'));

    const created = document.createElement('td');
    created.textContent = formatTime(g.created || g.Created);
    r.appendChild(created);

    tbody.appendChild(r);
  }
  table.appendChild(tbody);
  return table;
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
  back.href = '#/capabilities';
  back.textContent = '← Capabilities';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.textContent = 'Capabilities for identity';
  head.appendChild(h);
  const sp = document.createElement('p');
  sp.className = 'spine-section-sub mono';
  sp.textContent = identity;
  head.appendChild(sp);
  rootEl.appendChild(head);

  const wrap = document.createElement('div');
  wrap.appendChild(loadingNode('Loading…'));
  rootEl.appendChild(wrap);
  let resp;
  try {
    resp = await rpcWithDisclosure('explorer.capabilityByIdentity', { identity });
  } catch (err) {
    wrap.replaceChildren(errorNode(err));
    return;
  }
  const items = (resp && Array.isArray(resp.grants)) ? resp.grants : [];
  if (items.length === 0) {
    wrap.replaceChildren(emptyState('No capabilities granted to this identity.'));
    return;
  }
  wrap.replaceChildren(buildGrantTable(items));
  const meta = document.createElement('div');
  meta.className = 'spine-table-meta';
  meta.textContent = `${items.length} grant${items.length === 1 ? '' : 's'}`;
  rootEl.appendChild(meta);
}

// -----------------------------------------------------------------
// Detail
// -----------------------------------------------------------------
async function renderDetail(grantID) {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/capabilities';
  back.textContent = '← Capabilities';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.className = 'mono';
  h.textContent = grantID;
  head.appendChild(h);
  rootEl.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  rootEl.appendChild(grid);

  // Use the generic browse helper via approval-by-plan? No — capability
  // detail isn't covered by a dedicated method. Use capability.list?
  // capability.check requires identity+capability. The cleanest read
  // path is the grant list → filter by ID.
  let grant;
  try {
    const resp = await rpcWithDisclosure('explorer.capabilityGrants', { limit: 1000 });
    const items = (resp && Array.isArray(resp.items)) ? resp.items : [];
    grant = items.find((g) => (g.id || g.ID) === grantID);
  } catch (err) {
    grid.appendChild(errorNode(err));
    return;
  }
  if (!grant) {
    grid.appendChild(errorNode(new Error('grant not found')));
    return;
  }

  const cap = readField(grant, 'Capability') || readField(grant, 'capability');
  const grantee = readField(grant, 'Grantee') || readField(grant, 'grantee') || readField(grant, 'Identity');
  const delegFrom = readField(grant, 'DelegatedFrom') || readField(grant, 'delegatedFrom');
  const expires = readField(grant, 'ExpiresAt') || readField(grant, 'expiresAt');

  // Header
  const headerBody = document.createElement('div');
  headerBody.appendChild(kvRow('Capability', cap || '—'));
  headerBody.appendChild(kvRow('Grantee', grantee || '—'));
  headerBody.appendChild(kvRow('Delegated from', delegFrom || '—'));
  if (expires) headerBody.appendChild(kvRow('Expires at', formatTime(expires)));
  headerBody.appendChild(kvRow('State', statusPill(grant.state || grant.State || 'active', 'ok')));
  headerBody.appendChild(kvRow('Created', formatTime(grant.created || grant.Created)));
  headerBody.appendChild(kvRow('Updated', formatTime(grant.updated || grant.Updated)));
  grid.appendChild(card('Grant envelope', headerBody));

  // Cross-links
  const linksBody = document.createElement('div');
  linksBody.className = 'action-row';
  if (grantee) linksBody.appendChild(deeplinkButton('All capabilities for grantee', 'capabilities', '_identity', grantee));
  grid.appendChild(card('Cross-links', linksBody));

  // Raw
  const rawBody = document.createElement('details');
  rawBody.className = 'raw-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Raw managed object';
  rawBody.appendChild(summary);
  rawBody.appendChild(jsonBlock(grant));
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
