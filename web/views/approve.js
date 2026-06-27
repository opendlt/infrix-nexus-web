// Nexus — Approval review screen.
//
// NEXUS-REIMAGINED-2026-05-10 Phase 3 — Approval Dossier.
//
// Routes:
//   #/approve/<planId>      — open the approval dossier for a plan
//
// Layout:
//   Spine strip (always visible)
//   ┌────────────────────────────────────────────────────────────────┐
//   │  Plan header (id + intent backlink)                             │
//   │  Approval dossier (banner / identity / binding / threshold /    │
//   │                    signed / invalidators / CTA bar / raw)       │
//   └────────────────────────────────────────────────────────────────┘
//
// Sign and reject actions go through the canonical `governed.approve`
// RPC. The reject path uses the same RPC with a state="rejected"
// fallback (the server treats unknown role as a reject for now).
//
// The view auto-refreshes the dossier every 10s so signatures from
// other approvers appear without manual reload, and immediately
// after a successful sign/reject so the threshold gauge updates.

import { rpcWithDisclosure, errorStateNode } from '/lib/spineCommon.js';
import { renderApprovalDossier } from '/lib/approvalDossier.js';
import { openRationaleModal, openConfirmModal } from '/lib/rationaleModal.js';
import { mountCommentThread } from '/lib/commentThread.js';
import { onAtChange, isAtLive } from '/lib/timeContext.js';
import { explainSignature } from '/lib/identity.js';

const POLL_MS = 10000;

let rootEl = null;
let bodyEl = null;
let pollTimer = null;
let currentPlanId = null;

export const approveView = {
  async mount(root, subpath) {
    rootEl = root;
    rootEl.replaceChildren();
    const shell = document.createElement('div');
    shell.className = 'workspace approve-canvas';
    rootEl.appendChild(shell);

    const head = document.createElement('header');
    head.className = 'workspace-header';
    const title = document.createElement('h2');
    title.className = 'workspace-title';
    title.textContent = 'Review & sign';
    head.appendChild(title);
    const sub = document.createElement('p');
    sub.className = 'workspace-subtitle';
    sub.textContent = 'See exactly what you\'re approving — plan, scope, signers, and anything that could invalidate your signature.';
    head.appendChild(sub);
    const planLine = document.createElement('div');
    planLine.className = 'approve-plan-line mono';
    planLine.id = 'approvePlanLine';
    head.appendChild(planLine);
    shell.appendChild(head);

    const main = document.createElement('section');
    main.className = 'approve-main';
    shell.appendChild(main);

    bodyEl = document.createElement('div');
    bodyEl.className = 'approve-body';
    bodyEl.id = 'approveBody';
    main.appendChild(bodyEl);

    const planId = subpath && subpath[0];
    if (!planId) {
      bodyEl.replaceChildren(textNode('No plan ID supplied. Open this view from a pending-approval row in the cockpit.', 'approve-empty'));
      return;
    }
    currentPlanId = planId;
    planLine.textContent = 'planId: ' + planId;
    await refreshDossier();
    startPolling();
  },

  onSubpathChange(subpath) {
    const planId = subpath && subpath[0];
    if (!planId) return;
    if (planId === currentPlanId) return;
    currentPlanId = planId;
    const planLine = document.getElementById('approvePlanLine');
    if (planLine) planLine.textContent = 'planId: ' + planId;
    refreshDossier().catch(() => {});
    startPolling();
  },

  unmount() {
    stopPolling();
  },
};

let atUnsub = null;

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    // Cinema-Inbox-Time E3C6 — frozen at-cursors don't need polling.
    if (!isAtLive()) return;
    refreshDossier().catch(() => {});
  }, POLL_MS);
  atUnsub = onAtChange(() => refreshDossier().catch(() => {}));
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (atUnsub) { try { atUnsub(); } catch (_) {} atUnsub = null; }
}

let commentThreadCtrl = null;

async function refreshDossier() {
  if (!currentPlanId || !bodyEl) return;
  try {
    const dossier = await rpcWithDisclosure('nexus.approvalDossier', { planId: currentPlanId });
    bodyEl.replaceChildren(renderApprovalDossier(dossier, {
      onSign: (d, slot) => signApproval(d, slot),
      onReject: (d) => rejectApproval(d),
      onInspectRaw: () => {
        const raw = bodyEl.querySelector('.dossier-raw');
        if (raw) {
          raw.open = true;
          raw.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      },
    }));
    // Mount the comment thread below the dossier so approvers can
    // discuss the plan before they sign. The thread auto-polls every
    // 10s so other reviewers' notes show up in close to real time.
    if (commentThreadCtrl) { commentThreadCtrl.destroy(); commentThreadCtrl = null; }
    if (dossier && dossier.intentId) {
      const threadHost = document.createElement('div');
      threadHost.className = 'approve-comment-thread-host';
      bodyEl.appendChild(threadHost);
      commentThreadCtrl = mountCommentThread(threadHost, {
        intentId: dossier.intentId,
        pollMs: 10000,
      });
    }
  } catch (err) {
    bodyEl.replaceChildren(errorStateNode(err));
  }
}

async function signApproval(dossier, slot) {
  if (!dossier || !dossier.intentId) {
    bodyEl.replaceChildren(errorStateNode(new Error('Cannot record approval — dossier has no intentId.')));
    return;
  }
  // RUNBOOK-04 Task 2 (G3.2) — use the role/stage the signer PICKED (slot), not
  // a silent remaining[0] auto-pick. Fall back to remaining[0]/requiredRoles[0].
  const role = (slot && slot.role)
    || (dossier.remaining && dossier.remaining[0] && dossier.remaining[0].role)
    || (dossier.requiredRoles && dossier.requiredRoles[0]) || '';
  const stageId = (slot && slot.stageId)
    || (dossier.remaining && dossier.remaining[0] && dossier.remaining[0].stageId) || '';
  const keyPage = (slot && slot.keyPage) || role;

  // RUNBOOK-04 Task 2.5 (G3.8 / SP6) — pre-action consequence panel: the same
  // explainSignature engine the Identity page demos, now in the LIVE flow. It
  // fails closed; where the dossier doesn't surface goalType / key-page it can't
  // explain, so we say so honestly and still allow proceeding (the blocked-
  // invalidator gate at approvalDossier is the real safety gate). Where it CAN
  // explain, this is the consequence confirmation the spec wants.
  const ex = explainSignature({
    goalType: dossier.goalType,
    signer: keyPage,
    network: dossier.network || 'local',
    agentInitiated: !!dossier.agentInitiated,
    sourceAssets: dossier.scope && dossier.scope.sourceAssets,
    targetAssets: dossier.scope && dossier.scope.targetAssets,
  });
  const confirmed = await openConfirmModal({
    title: 'Before you record this approval',
    message: ex.error
      ? 'A consequence preview could not be generated from this dossier (details below). You can still proceed — the blocked-invalidator gate already prevents recording an invalid plan.'
      : 'Here is what recording this approval allows. Continue to add your rationale.',
    detailNode: buildConsequenceNode(ex, role, stageId),
    confirmText: 'Continue',
  });
  if (!confirmed) return;

  // Mandatory rationale — backend rejects with -32602 if <10 chars.
  const rationale = await openRationaleModal({ verb: 'sign', intentId: dossier.intentId });
  if (rationale === null) return;

  const banner = document.createElement('div');
  banner.className = 'verify-summary verify-warn approve-action-status';
  banner.textContent = 'Recording approval…';
  bodyEl.prepend(banner);
  try {
    const result = await rpcWithDisclosure('governed.approve', {
      intentId: dossier.intentId,
      stageId,
      planHash: dossier.planHash,
      role,
      rationale,
    });
    banner.classList.remove('verify-warn');
    banner.classList.add('verify-pass');
    if (result && result.status === 'resumed') {
      banner.textContent = '✓ Approval recorded and resumed — execution advanced.';
    } else if (result && result.status === 'awaiting_more_approvals') {
      banner.textContent = '✓ Approval recorded — awaiting other approvers.';
    } else {
      banner.textContent = '✓ Approval recorded.';
    }
    setTimeout(() => { refreshDossier().catch(() => {}); }, 500);
  } catch (err) {
    banner.classList.remove('verify-warn');
    banner.classList.add('verify-fail');
    banner.textContent = 'Recording approval failed: ' + (err.message || 'unknown');
  }
}

// RUNBOOK-04 Task 2.5 — render the explainSignature consequence block (or its
// fail-closed reason) for the confirm gate.
function buildConsequenceNode(ex, role, stageId) {
  const box = document.createElement('div');
  box.className = 'approve-consequence';
  const slotLine = document.createElement('p');
  slotLine.className = 'approve-consequence-slot mono';
  slotLine.textContent = 'Recording as role: ' + (role || '—') + (stageId ? ' @ ' + stageId : '');
  box.appendChild(slotLine);
  if (ex.error) {
    const err = document.createElement('p');
    err.className = 'approve-consequence-error';
    err.textContent = 'Consequence preview unavailable: ' + ex.error;
    box.appendChild(err);
    return box;
  }
  const headline = document.createElement('p');
  headline.className = 'approve-consequence-headline';
  headline.textContent = 'This approval allows: ' + ex.action + ' on ' + ex.network;
  box.appendChild(headline);
  const dl = document.createElement('dl');
  dl.className = 'approve-consequence-grid';
  for (const [k, v] of [
    ['Identity touched', ex.identityTouched],
    ['Funds/credits move', ex.fundsOrCreditsMove ? 'yes' : 'no'],
    ['Data disclosed', ex.dataDisclosed ? 'yes' : 'no'],
    ['Agent-initiated', ex.agentInitiated ? 'yes' : 'no'],
    ['Expected proof', ex.expectedProof],
  ]) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = String(v);
    dl.appendChild(dt); dl.appendChild(dd);
  }
  box.appendChild(dl);
  if (Array.isArray(ex.irreversibleEffects) && ex.irreversibleEffects.length) {
    const ul = document.createElement('ul');
    ul.className = 'approve-consequence-list';
    for (const e of ex.irreversibleEffects) { const li = document.createElement('li'); li.textContent = e; ul.appendChild(li); }
    box.appendChild(ul);
  }
  if (Array.isArray(ex.warnings) && ex.warnings.length) {
    const ul = document.createElement('ul');
    ul.className = 'approve-consequence-warnings';
    for (const w of ex.warnings) { const li = document.createElement('li'); li.textContent = '⚠ ' + w; ul.appendChild(li); }
    box.appendChild(ul);
  }
  return box;
}

async function rejectApproval(dossier) {
  if (!dossier || !dossier.intentId) {
    bodyEl.replaceChildren(errorStateNode(new Error('Cannot reject — dossier has no intentId.')));
    return;
  }
  // Mandatory rationale — same floor as sign.
  const rationale = await openRationaleModal({ verb: 'reject', intentId: dossier.intentId });
  if (rationale === null) return;

  const banner = document.createElement('div');
  banner.className = 'verify-summary verify-warn approve-action-status';
  banner.textContent = 'Recording rejection…';
  bodyEl.prepend(banner);
  try {
    const result = await rpcWithDisclosure('governed.reject', {
      intentId: dossier.intentId,
      approvalId: dossier.approvalId || '',
      rationale,
    });
    banner.classList.remove('verify-warn');
    banner.classList.add('verify-pass');
    banner.textContent = '✗ Rejection recorded' + (result && result.rationaleNoteId ? ` (note ${result.rationaleNoteId}).` : '.');
    setTimeout(() => { refreshDossier().catch(() => {}); }, 500);
  } catch (err) {
    banner.classList.remove('verify-warn');
    banner.classList.add('verify-fail');
    banner.textContent = 'Reject failed: ' + (err.message || 'unknown');
  }
}

// =================================================================
// Helpers
// =================================================================
function textNode(text, cls) {
  const p = document.createElement('p');
  if (cls) p.className = cls;
  p.textContent = text;
  return p;
}
