// Nexus — Plugins view (inventory + per-family detail + admission status).
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 3-J: PluginInventory snapshot
// with per-family detail (descriptor + capability manifest +
// evidence profile + timing class + reliability), admission status
// (production / devnet stub / deferred), and family-level health.
//
// Subpaths:
//   #/plugins              — inventory list with filters
//   #/plugins/<pluginID>   — single-plugin detail

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
} from '/lib/spineCommon.js';

let rootEl = null;
let currentSubpath = [];

export const pluginsView = {
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
    renderInventory();
  } else {
    renderDetail(currentSubpath[0]);
  }
}

const filterState = {
  family: '',
  backendClass: '',
  lifecycle: '',
};

async function renderInventory() {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const h = document.createElement('h2');
  h.textContent = 'Plugins';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent = 'Plugin inventory snapshot — every registered execution plugin with its descriptor, capability manifest, evidence profile, timing class, and reliability score.';
  head.appendChild(sub);
  rootEl.appendChild(head);

  const filterBar = renderFilterBar(() => renderInventory());
  rootEl.appendChild(filterBar);

  const wrap = document.createElement('div');
  wrap.appendChild(loadingNode('Loading inventory…'));
  rootEl.appendChild(wrap);

  let resp;
  try {
    resp = await rpcWithDisclosure('explorer.pluginInventory', {});
  } catch (err) {
    wrap.replaceChildren(errorNode(err));
    return;
  }
  let entries = (resp && Array.isArray(resp.entries)) ? resp.entries : [];
  entries = applyFilters(entries);
  if (entries.length === 0) {
    wrap.replaceChildren(emptyState('No plugins registered.'));
    return;
  }

  const table = document.createElement('table');
  table.className = 'spine-table';
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  for (const c of ['Plugin ID', 'Family', 'Backend', 'Lifecycle', 'Timing', 'Cost', 'Reliability', 'Capabilities']) {
    const th = document.createElement('th');
    th.textContent = c;
    tr.appendChild(th);
  }
  thead.appendChild(tr);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const e of entries) tbody.appendChild(buildRow(e));
  table.appendChild(tbody);
  wrap.replaceChildren(table);

  const meta = document.createElement('div');
  meta.className = 'spine-table-meta';
  meta.textContent = `${entries.length} plugin${entries.length === 1 ? '' : 's'}`;
  rootEl.appendChild(meta);
}

function renderFilterBar(onChange) {
  const bar = document.createElement('div');
  bar.className = 'spine-filter-bar';
  bar.appendChild(textFilter('Family', filterState.family, (v) => {
    filterState.family = v;
    onChange();
  }));
  bar.appendChild(selectFilter('Backend', filterState.backendClass, [
    { value: '', label: 'all' },
    { value: 'production', label: 'production' },
    { value: 'reference', label: 'reference' },
    { value: 'devnet_stub', label: 'devnet stub' },
  ], (v) => {
    filterState.backendClass = v;
    onChange();
  }));
  bar.appendChild(selectFilter('Lifecycle', filterState.lifecycle, [
    { value: '', label: 'all' },
    { value: 'active', label: 'active' },
    { value: 'degraded', label: 'degraded' },
    { value: 'suspended', label: 'suspended' },
    { value: 'deprecated', label: 'deprecated' },
  ], (v) => {
    filterState.lifecycle = v;
    onChange();
  }));
  return bar;
}

function applyFilters(entries) {
  return entries.filter((e) => {
    if (filterState.family && !(e.family || '').toLowerCase().includes(filterState.family.toLowerCase())) return false;
    if (filterState.backendClass && e.backendClass !== filterState.backendClass) return false;
    if (filterState.lifecycle && e.lifecycleState !== filterState.lifecycle) return false;
    return true;
  });
}

function buildRow(e) {
  const tr = document.createElement('tr');
  tr.style.cursor = 'pointer';
  tr.addEventListener('click', () => {
    window.location.hash = '#/plugins/' + encodeURIComponent(e.pluginId);
  });

  const idCell = document.createElement('td');
  idCell.className = 'mono';
  idCell.textContent = shortHash(e.pluginId, 26, 6);
  idCell.title = e.pluginId;
  tr.appendChild(idCell);

  const famCell = document.createElement('td');
  famCell.textContent = e.family || '—';
  tr.appendChild(famCell);

  const beCell = document.createElement('td');
  beCell.appendChild(statusPill(e.backendClass || '—', backendKind(e.backendClass)));
  tr.appendChild(beCell);

  const lifeCell = document.createElement('td');
  lifeCell.appendChild(statusPill(e.lifecycleState || 'unknown', lifecycleKind(e.lifecycleState)));
  tr.appendChild(lifeCell);

  const timingCell = document.createElement('td');
  timingCell.textContent = e.timingClass || '—';
  tr.appendChild(timingCell);

  const costCell = document.createElement('td');
  costCell.textContent = e.costTier || '—';
  tr.appendChild(costCell);

  const relCell = document.createElement('td');
  if (typeof e.reliability === 'number') {
    relCell.textContent = `${(e.reliability * 100).toFixed(1)}%`;
    relCell.appendChild(document.createElement('span'));
  } else {
    relCell.textContent = '—';
  }
  tr.appendChild(relCell);

  const capCell = document.createElement('td');
  const caps = e.capabilityManifest || [];
  capCell.textContent = caps.length === 0 ? '—' : caps.length + ' (' + caps.slice(0, 2).join(', ') + (caps.length > 2 ? '…' : '') + ')';
  tr.appendChild(capCell);

  return tr;
}

function backendKind(b) {
  switch (b) {
    case 'production': return 'ok';
    case 'reference': return 'info';
    case 'devnet_stub': return 'warn';
    default: return 'neutral';
  }
}
function lifecycleKind(s) {
  switch (s) {
    case 'active': return 'ok';
    case 'degraded': return 'warn';
    case 'suspended':
    case 'deprecated': return 'alert';
    default: return 'neutral';
  }
}

function textFilter(label, value, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'spine-filter';
  const span = document.createElement('span');
  span.textContent = label;
  wrap.appendChild(span);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value || '';
  input.addEventListener('input', () => onChange(input.value));
  wrap.appendChild(input);
  return wrap;
}
function selectFilter(label, value, options, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'spine-filter';
  const span = document.createElement('span');
  span.textContent = label;
  wrap.appendChild(span);
  const sel = document.createElement('select');
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  wrap.appendChild(sel);
  return wrap;
}

// -----------------------------------------------------------------
// Detail
// -----------------------------------------------------------------
async function renderDetail(pluginID) {
  rootEl.replaceChildren();
  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const back = document.createElement('a');
  back.className = 'spine-back';
  back.href = '#/plugins';
  back.textContent = '← All plugins';
  head.appendChild(back);
  const h = document.createElement('h2');
  h.className = 'mono';
  h.textContent = pluginID;
  head.appendChild(h);
  rootEl.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  rootEl.appendChild(grid);

  let plugin;
  try {
    plugin = await rpcWithDisclosure('explorer.pluginGet', { id: pluginID });
  } catch (err) {
    grid.appendChild(errorNode(err));
    return;
  }
  if (!plugin) {
    grid.appendChild(errorNode(new Error('plugin not found')));
    return;
  }

  // Descriptor
  const descBody = document.createElement('div');
  descBody.appendChild(kvRow('Plugin ID', plugin.pluginId));
  descBody.appendChild(kvRow('Name', plugin.name));
  descBody.appendChild(kvRow('Version', plugin.version));
  descBody.appendChild(kvRow('Family', plugin.family));
  descBody.appendChild(kvRow('Family status', plugin.familyStatus));
  descBody.appendChild(kvRow('Provider', plugin.provider));
  descBody.appendChild(kvRow('Primary category', plugin.primaryCategory));
  descBody.appendChild(kvRow('Backend class', statusPill(plugin.backendClass || '—', backendKind(plugin.backendClass))));
  descBody.appendChild(kvRow('Production admissible', plugin.productionAdmissible ? statusPill('yes', 'ok') : statusPill('no', 'alert')));
  grid.appendChild(card('Descriptor', descBody));

  // Operational
  const opBody = document.createElement('div');
  opBody.appendChild(kvRow('Lifecycle state', statusPill(plugin.lifecycleState || 'unknown', lifecycleKind(plugin.lifecycleState))));
  opBody.appendChild(kvRow('Timing class', plugin.timingClass || '—'));
  opBody.appendChild(kvRow('Cost tier', plugin.costTier || '—'));
  opBody.appendChild(kvRow('Confidentiality profile', plugin.confidentialityProfile || '—'));
  opBody.appendChild(kvRow('Finality model', plugin.finalityModel || '—'));
  opBody.appendChild(kvRow('Simulation support', plugin.simulationSupport || '—'));
  opBody.appendChild(kvRow('Approval sensitivity', plugin.approvalSensitivity || '—'));
  if (typeof plugin.reliability === 'number') {
    opBody.appendChild(kvRow('Reliability', `${(plugin.reliability * 100).toFixed(2)}%`));
  }
  grid.appendChild(card('Operational profile', opBody));

  // Capability manifest
  const capBody = document.createElement('div');
  if (!plugin.capabilityManifest || plugin.capabilityManifest.length === 0) {
    capBody.appendChild(emptyState('No declared capabilities.'));
  } else {
    const list = document.createElement('ul');
    list.className = 'plain-list';
    for (const c of plugin.capabilityManifest) {
      const li = document.createElement('li');
      li.className = 'mono';
      li.textContent = c;
      list.appendChild(li);
    }
    capBody.appendChild(list);
  }
  grid.appendChild(card('Capability manifest', capBody));

  // Evidence profile
  const evBody = document.createElement('div');
  if (!plugin.evidenceProfile || plugin.evidenceProfile.length === 0) {
    evBody.appendChild(emptyState('No declared evidence kinds.'));
  } else {
    const list = document.createElement('ul');
    list.className = 'plain-list';
    for (const ev of plugin.evidenceProfile) {
      const li = document.createElement('li');
      li.className = 'mono';
      li.textContent = ev;
      list.appendChild(li);
    }
    evBody.appendChild(list);
  }
  grid.appendChild(card('Evidence profile', evBody));

  // Side effects
  if (plugin.sideEffectLimits && plugin.sideEffectLimits.length > 0) {
    const seBody = document.createElement('div');
    const list = document.createElement('ul');
    list.className = 'plain-list';
    for (const s of plugin.sideEffectLimits) {
      const li = document.createElement('li');
      li.className = 'mono';
      li.textContent = s;
      list.appendChild(li);
    }
    seBody.appendChild(list);
    grid.appendChild(card('Side-effect limits', seBody));
  }

  // Implementation hash
  if (plugin.implementationHash) {
    const ihBody = document.createElement('div');
    ihBody.appendChild(kvRow('Implementation hash', plugin.implementationHash));
    ihBody.appendChild(document.createTextNode(
      'Auditors verify the deployed binary against this hash to confirm the running plugin matches the certified source.'
    ));
    grid.appendChild(card('Implementation hash', ihBody));
  }

  // Raw
  const rawBody = document.createElement('details');
  rawBody.className = 'raw-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Raw inventory entry';
  rawBody.appendChild(summary);
  rawBody.appendChild(jsonBlock(plugin));
  grid.appendChild(card('Inspect', rawBody));
}
