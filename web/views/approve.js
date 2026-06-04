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
import { openRationaleModal } from '/lib/rationaleModal.js';
import { mountCommentThread } from '/lib/commentThread.js';
import { onAtChange, isAtLive } from '/lib/timeContext.js';

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
      onSign: (d) => signApproval(d),
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

async function signApproval(dossier) {
  if (!dossier || !dossier.intentId) {
    bodyEl.replaceChildren(errorStateNode(new Error('Cannot sign — dossier has no intentId.')));
    return;
  }
  // Mandatory rationale — backend rejects with -32602 if <10 chars.
  const rationale = await openRationaleModal({ verb: 'sign', intentId: dossier.intentId });
  if (rationale === null) return;

  // Pick the first remaining role-slot the actor *could* sign for as
  // the default; the user will see this in the result.
  let role = '';
  if (Array.isArray(dossier.remaining) && dossier.remaining.length > 0) {
    role = dossier.remaining[0].role || '';
  } else if (Array.isArray(dossier.requiredRoles) && dossier.requiredRoles.length > 0) {
    role = dossier.requiredRoles[0];
  }
  let stageId = '';
  if (Array.isArray(dossier.remaining) && dossier.remaining.length > 0) {
    stageId = dossier.remaining[0].stageId || '';
  }
  const banner = document.createElement('div');
  banner.className = 'verify-summary verify-warn approve-action-status';
  banner.textContent = 'Signing approval…';
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
      banner.textContent = '✓ Signed and resumed — execution advanced.';
    } else if (result && result.status === 'awaiting_more_approvals') {
      banner.textContent = '✓ Signed — awaiting other approvers.';
    } else {
      banner.textContent = '✓ Signature recorded.';
    }
    setTimeout(() => { refreshDossier().catch(() => {}); }, 500);
  } catch (err) {
    banner.classList.remove('verify-warn');
    banner.classList.add('verify-fail');
    banner.textContent = 'Sign failed: ' + (err.message || 'unknown');
  }
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
