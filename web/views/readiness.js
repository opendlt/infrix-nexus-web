// Nexus — Readiness view (platform-review-2 Epic C).
//
// The substrate readiness dashboard: every external dependency the node
// relies on, reported in the honest status vocabulary with a red/yellow/
// green light. Clicking a row reveals the evidence behind the status —
// config field, live probe result, cryptographic proof, last-checked
// time, and any blocking profile requirement.

import {
  rpcWithDisclosure,
  statusPill,
  kvRow,
  emptyState,
  loadingNode,
  errorNode,
} from '/lib/spineCommon.js';

let rootEl = null;

export const readinessView = {
  mount(root) {
    rootEl = root;
    render();
  },
  onSubpathChange() {
    render();
  },
};

function lightKind(light) {
  switch (light) {
    case 'green':
      return 'ok';
    case 'yellow':
      return 'warn';
    default:
      return 'alert';
  }
}

function render() {
  if (!rootEl) return;
  rootEl.replaceChildren();

  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const h = document.createElement('h2');
  h.textContent = 'Readiness';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent =
    'Substrate readiness — every external dependency, reported honestly: configured / live / cryptographically_verified / operator_attested / degraded / unavailable / misconfigured. Click a row for the evidence behind the status.';
  head.appendChild(sub);
  rootEl.appendChild(head);

  // Profile gate selector.
  const controls = document.createElement('div');
  controls.className = 'spine-controls';
  const profileSelect = document.createElement('select');
  for (const opt of [
    { v: '', label: 'No profile (status only)' },
    { v: 'public_production', label: 'Evaluate: public_production' },
  ]) {
    const o = document.createElement('option');
    o.value = opt.v;
    o.textContent = opt.label;
    profileSelect.appendChild(o);
  }
  controls.appendChild(profileSelect);
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'verify-btn';
  refresh.textContent = 'Refresh';
  controls.appendChild(refresh);
  rootEl.appendChild(controls);

  const verdict = document.createElement('div');
  rootEl.appendChild(verdict);

  const body = document.createElement('div');
  body.appendChild(loadingNode('Loading substrate readiness…'));
  rootEl.appendChild(body);

  const load = () => {
    body.replaceChildren(loadingNode('Loading substrate readiness…'));
    verdict.replaceChildren();
    rpcWithDisclosure('nexus.readiness', { profile: profileSelect.value })
      .then((resp) => renderReport(body, verdict, resp))
      .catch((e) => body.replaceChildren(errorNode(e)));
  };
  refresh.addEventListener('click', load);
  profileSelect.addEventListener('change', load);
  load();
}

function renderReport(body, verdict, resp) {
  body.replaceChildren();
  verdict.replaceChildren();
  if (!resp || !Array.isArray(resp.substrates)) {
    body.appendChild(emptyState('No readiness data.'));
    return;
  }

  if (resp.profile) {
    const met = resp.profileMet === true;
    const v = document.createElement('div');
    v.className = 'spine-section-sub';
    v.appendChild(document.createTextNode('Profile "' + resp.profile + '": '));
    v.appendChild(statusPill(met ? 'MET' : 'NOT MET', met ? 'ok' : 'alert'));
    verdict.appendChild(v);
  }

  const table = document.createElement('div');
  table.className = 'detail-grid';
  for (const s of resp.substrates) {
    table.appendChild(substrateRow(s));
  }
  body.appendChild(table);
}

function substrateRow(s) {
  const wrap = document.createElement('div');
  wrap.className = 'card';

  const header = document.createElement('div');
  header.className = 'kv-row';
  header.style.cursor = 'pointer';

  const label = document.createElement('span');
  label.textContent = s.name || s.category;
  header.appendChild(label);

  const pill = statusPill(s.status, lightKind(s.light));
  if (s.evidence && s.evidence.blockingProfileRequirement) {
    pill.title = 'blocks profile: needs ' + s.evidence.blockingProfileRequirement;
  }
  header.appendChild(pill);
  wrap.appendChild(header);

  const detail = document.createElement('div');
  detail.style.display = 'none';
  if (s.detail) {
    const d = document.createElement('p');
    d.className = 'spine-section-sub';
    d.textContent = s.detail;
    detail.appendChild(d);
  }
  const ev = s.evidence || {};
  if (ev.configField) detail.appendChild(kvRow('Config field', ev.configField));
  if (ev.liveProbeResult) detail.appendChild(kvRow('Live probe', ev.liveProbeResult));
  if (ev.cryptographicProof) detail.appendChild(kvRow('Cryptographic proof', ev.cryptographicProof));
  if (ev.blockingProfileRequirement)
    detail.appendChild(kvRow('Blocks profile — needs', statusPill(ev.blockingProfileRequirement, 'alert')));
  if (ev.lastCheckedUnix) {
    const when = new Date(ev.lastCheckedUnix * 1000).toISOString();
    detail.appendChild(kvRow('Last checked', when));
  }
  wrap.appendChild(detail);

  header.addEventListener('click', () => {
    detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
  });
  return wrap;
}
