// RUNBOOK-07 SP3 — causal "why" walk renderer.
//
// A collapsible "Why did this fail?" panel mounted inside the narrative, under
// the outcome chapter, only when buildCausalChain returns non-null (a failed
// outcome). Each cause link is a stage-colored row that deep-links to its
// surface; the trust hop is lazy — it fetches governNode on expand and fills in
// the drift reason. Honest about gaps: redacted hops render as such and flip the
// panel to "partial".

import { buildCausalChain } from '/lib/causalWalk.js';
import { rpcWithDisclosure } from '/lib/spineCommon.js';

const KIND_LABEL = {
  outcome: 'Outcome failed',
  compensation: 'Compensation stage',
  policy: 'Policy denied',
  trust: 'Trust drift',
  block: 'Anchored at block',
};
const KIND_STAGE = { outcome: 5, compensation: 4, policy: 3, trust: 3, block: 7 };

/**
 * createCausalWalkPanel(snapshot) → HTMLElement | null
 * `snapshot` = the narrative cache ({ intent, outcome, policies, anchorChain }).
 * Returns null when there is nothing to explain (no failed outcome).
 */
export function createCausalWalkPanel(snapshot) {
  const chain = buildCausalChain(snapshot);
  if (!chain) return null;

  const panel = document.createElement('details');
  panel.className = 'causal-walk' + (chain.confidence === 'partial' ? ' causal-partial' : '');
  panel.open = true;

  const sum = document.createElement('summary');
  sum.className = 'causal-walk-summary';
  sum.textContent = 'Why did this fail?';
  const conf = document.createElement('span');
  conf.className = 'causal-confidence';
  conf.textContent = chain.confidence === 'partial' ? 'partial — some causes redacted' : 'derived from the proof chain';
  sum.appendChild(conf);
  panel.appendChild(sum);

  const list = document.createElement('ol');
  list.className = 'causal-chain';
  for (const link of chain.links) list.appendChild(renderLink(link));
  panel.appendChild(list);
  return panel;
}

function renderLink(link) {
  const li = document.createElement('li');
  li.className = 'causal-link causal-' + link.kind;
  const dot = document.createElement('span');
  dot.className = 'causal-dot stage-dot';
  dot.dataset.stage = String(KIND_STAGE[link.kind] || 1);
  li.appendChild(dot);

  const body = document.createElement('div');
  body.className = 'causal-body';

  const head = document.createElement('div');
  head.className = 'causal-link-head';
  const label = document.createElement('span');
  label.className = 'causal-link-label';
  label.textContent = KIND_LABEL[link.kind] || link.kind;
  head.appendChild(label);
  if (link.ref && !link._hidden) {
    const a = document.createElement('a');
    a.className = 'causal-link-ref';
    a.href = link.ref;
    a.textContent = 'Open →';
    head.appendChild(a);
  }
  body.appendChild(head);

  const meta = document.createElement('div');
  meta.className = 'causal-link-meta';
  meta.textContent = linkMeta(link);
  body.appendChild(meta);

  // Lazy trust hop — fetch governNode on first expand.
  if (link.kind === 'trust' && link._lazy && link.profileId) {
    const expand = document.createElement('button');
    expand.type = 'button';
    expand.className = 'causal-expand';
    expand.textContent = 'Show drift detail';
    let loaded = false;
    expand.addEventListener('click', async () => {
      if (loaded) return;
      loaded = true;
      expand.disabled = true;
      expand.textContent = 'Loading…';
      try {
        const node = await rpcWithDisclosure('nexus.governNode', { kind: 'trust', id: link.profileId });
        const d = (node && (node.data || node)) || {};
        meta.textContent = `degraded — ${d.degradedReason || d.DegradedReason || 'reason unavailable'}`
          + (d.driftImpactCount != null ? ` · ${d.driftImpactCount} approvals affected` : '');
        expand.remove();
      } catch (e) {
        expand.textContent = 'drift detail unavailable';
      }
    });
    body.appendChild(expand);
  }

  li.appendChild(body);
  return li;
}

function linkMeta(link) {
  switch (link.kind) {
    case 'outcome':      return link.detail || 'outcome did not complete';
    case 'compensation': return `${link.stageId || 'stage'} — ${link.status || 'unknown'}${link.detail ? ' · ' + link.detail : ''}`;
    case 'policy':       return link._hidden ? 'cause redacted by disclosure'
      : `${link.policyId || 'policy'}${link.rule ? ' · rule ' + link.rule : ''}${link.reason ? ' — ' + link.reason : ''}`;
    case 'trust':        return `profile ${link.profileId}`;
    case 'block':        return `block ${link.block ?? '?'}${link.txHash ? ' · tx ' + short(link.txHash) : ''}`;
    default:             return '';
  }
}
function short(s) { s = String(s || ''); return s.length <= 14 ? s : s.slice(0, 8) + '…' + s.slice(-4); }
