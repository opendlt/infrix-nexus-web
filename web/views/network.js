// Nexus — Network view.
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 6: anchor mode + L0 endpoint,
// block height + chain head, Cinema deep-link, operator identity +
// capability map, plugin admission summary, workflow-engine health
// counters. The view is a single-page dashboard — no detail
// drilldown — that surfaces the operator-facing health surface in
// one screen.

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

export const networkView = {
  mount(root) {
    rootEl = root;
    render();
  },
  onSubpathChange() {
    render();
  },
};

function render() {
  if (!rootEl) return;
  rootEl.replaceChildren();

  const head = document.createElement('div');
  head.className = 'spine-section-head';
  const h = document.createElement('h2');
  h.textContent = 'Network';
  head.appendChild(h);
  const sub = document.createElement('p');
  sub.className = 'spine-section-sub';
  sub.textContent = 'Operator dashboard — anchor mode, L0 endpoint, block height, plugin admission, trust drift, workflow health, and Cinema deep-link.';
  head.appendChild(sub);
  rootEl.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'detail-grid';
  rootEl.appendChild(grid);

  // ── Anchor posture ──
  const anchorBody = document.createElement('div');
  anchorBody.appendChild(loadingNode('Loading anchor posture…'));
  grid.appendChild(card('Anchor posture', anchorBody));

  // ── L0 endpoint ──
  const l0Body = document.createElement('div');
  l0Body.appendChild(loadingNode('Loading L0 endpoint…'));
  grid.appendChild(card('L0 endpoint', l0Body));

  // ── Block height ──
  const blockBody = document.createElement('div');
  blockBody.appendChild(loadingNode('Loading block height…'));
  grid.appendChild(card('Block height', blockBody));

  // ── Plugin admission ──
  const pluginBody = document.createElement('div');
  pluginBody.appendChild(loadingNode('Loading plugin admission…'));
  grid.appendChild(card('Plugin admission', pluginBody));

  // ── Trust drift ──
  const trustBody = document.createElement('div');
  trustBody.appendChild(loadingNode('Loading trust drift…'));
  grid.appendChild(card('Trust drift', trustBody));

  // ── Workflow health ──
  const workflowBody = document.createElement('div');
  workflowBody.appendChild(loadingNode('Loading workflow health…'));
  grid.appendChild(card('Workflow health', workflowBody));

  // ── Cinema deep-link ──
  const cinemaBody = document.createElement('div');
  cinemaBody.appendChild(document.createTextNode(
    'Cinema is the deep-observability viewer. The standalone instance runs on port 9090 and exposes per-plugin scene graphs + governance trace events. Open it in a separate tab for live debugging.'
  ));
  cinemaBody.appendChild(document.createElement('br'));
  cinemaBody.appendChild(document.createElement('br'));
  const cinemaLink = document.createElement('a');
  cinemaLink.href = 'http://localhost:9090';
  cinemaLink.target = '_blank';
  cinemaLink.rel = 'noopener noreferrer';
  cinemaLink.className = 'deeplink-btn';
  cinemaLink.textContent = 'Open Cinema (localhost:9090)';
  cinemaBody.appendChild(cinemaLink);
  grid.appendChild(card('Cinema deep-link', cinemaBody));

  // ── Refresh button ──
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'verify-btn';
  refresh.textContent = 'Refresh';
  refresh.addEventListener('click', () => render());
  rootEl.appendChild(refresh);

  // Fire all RPCs in parallel.
  Promise.all([
    rpcWithDisclosure('explorer.anchorMode', {}).catch((e) => ({ error: e })),
    rpcWithDisclosure('explorer.l0Endpoint', {}).catch((e) => ({ error: e })),
    rpcWithDisclosure('explorer.pluginStatus', {}).catch((e) => ({ error: e })),
    rpcWithDisclosure('explorer.trustDrift', {}).catch((e) => ({ error: e })),
    rpcWithDisclosure('explorer.workflowHealth', {}).catch((e) => ({ error: e })),
  ]).then(([anchorMode, l0, plugin, trust, workflow]) => {
    renderAnchorCard(anchorBody, anchorMode);
    renderL0Card(l0Body, l0, anchorMode);
    renderBlockCard(blockBody);
    renderPluginCard(pluginBody, plugin);
    renderTrustCard(trustBody, trust);
    renderWorkflowCard(workflowBody, workflow);
  });
}

function renderAnchorCard(body, resp) {
  body.replaceChildren();
  if (resp && resp.error) {
    body.appendChild(errorNode(resp.error));
    return;
  }
  if (!resp) {
    body.appendChild(emptyState('No data.'));
    return;
  }
  const mode = resp.mode || 'unknown';
  const submits = resp.submitsExternally;
  const valid = resp.valid;
  const kind = mode === 'mainnet' ? 'alert' : (submits ? 'ok' : 'warn');
  body.appendChild(kvRow('Mode', statusPill(mode, kind)));
  body.appendChild(kvRow('Submits to L0', submits ? 'yes' : 'no'));
  body.appendChild(kvRow('Configuration valid', valid ? 'yes' : statusPill('no', 'alert')));
}

function renderL0Card(body, resp, anchorResp) {
  body.replaceChildren();
  if (resp && resp.error) {
    body.appendChild(errorNode(resp.error));
    return;
  }
  const ep = (resp && resp.endpoint) || '';
  if (!ep) {
    body.appendChild(emptyState('No L0 endpoint configured (anchor mode is off / bookkeeping).'));
    return;
  }
  body.appendChild(kvRow('Endpoint', ep));
  // The Network view doubles as a quick-link to the L0 verifier
  // tab so operators can paste a tx hash + verify it directly.
  const link = document.createElement('a');
  link.className = 'deeplink-btn';
  link.href = '#/verify/_l0';
  link.textContent = 'Open L0 cross-check';
  body.appendChild(document.createElement('br'));
  body.appendChild(link);
}

function renderBlockCard(body) {
  body.replaceChildren();
  const headerEl = document.getElementById('headerBlockHeight');
  const block = headerEl ? headerEl.textContent : '?';
  body.appendChild(kvRow('Current Infrix block', block));
  body.appendChild(document.createTextNode(
    ' Block height advances on each governance pipeline tick. The header block-height widget streams live updates via the same source.'
  ));
}

function renderPluginCard(body, resp) {
  body.replaceChildren();
  if (resp && resp.error) {
    body.appendChild(errorNode(resp.error));
    return;
  }
  if (!resp) {
    body.appendChild(emptyState('No data.'));
    return;
  }
  body.appendChild(kvRow('Total registered', resp.totalRegistered || 0));
  body.appendChild(kvRow('Total admitted', resp.totalAdmitted || 0));
  body.appendChild(kvRow('Family count', resp.familyCount || 0));
  if (resp.families && resp.families.length > 0) {
    body.appendChild(document.createElement('br'));
    const link = document.createElement('a');
    link.className = 'deeplink-btn';
    link.href = '#/plugins';
    link.textContent = 'Open Plugins inventory';
    body.appendChild(link);
  }
}

function renderTrustCard(body, resp) {
  body.replaceChildren();
  if (resp && resp.error) {
    body.appendChild(errorNode(resp.error));
    return;
  }
  if (!resp) {
    body.appendChild(emptyState('No data.'));
    return;
  }
  body.appendChild(kvRow('Total profiles', resp.totalProfiles || 0));
  const drifting = resp.driftingProfiles || 0;
  body.appendChild(kvRow('Drifting profiles', statusPill(String(drifting), drifting === 0 ? 'ok' : 'alert')));
  if (resp.byState) {
    for (const [state, count] of Object.entries(resp.byState)) {
      body.appendChild(kvRow('  ' + state, count));
    }
  }
  if (drifting > 0) {
    body.appendChild(document.createElement('br'));
    const link = document.createElement('a');
    link.className = 'deeplink-btn';
    link.href = '#/trust/_alerts';
    link.textContent = 'Open proof-mismatch alerts';
    body.appendChild(link);
  }
}

function renderWorkflowCard(body, resp) {
  body.replaceChildren();
  if (resp && resp.error) {
    body.appendChild(errorNode(resp.error));
    return;
  }
  if (!resp) {
    body.appendChild(emptyState('No data.'));
    return;
  }
  const o = resp.outcomeCaptureFailures || 0;
  const c = resp.compensationStageFailures || 0;
  body.appendChild(kvRow('Outcome capture failures', statusPill(String(o), o === 0 ? 'ok' : 'alert')));
  body.appendChild(kvRow('Compensation stage failures', statusPill(String(c), c === 0 ? 'ok' : 'alert')));
}
