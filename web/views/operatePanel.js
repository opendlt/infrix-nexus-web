// Nexus — Phase 7 operate console view.
//
// NEXUS-REIMAGINED-2026-05-10 Phase 7 — Operate As Governed Action Console.
//
// Routes:
//   #/operate      — operator console with health panels + action templates
//
// Every mutating control on this view is an action template — clicking
// it does not directly modify state. The card persists a seed to
// localStorage and navigates to #/compose/<GoalType>; Intent Studio
// reads the seed on mount and pre-populates the form. The Phase 7
// invariant — "operators do not leave the governance model to operate
// the system" — is enforced by the absence of any direct mutation on
// this view.

import { rpcWithDisclosure, errorStateNode } from '/lib/spineCommon.js';
import { renderOperatePanel } from '/lib/operatePanel.js';

const POLL_MS = 8000;

let rootEl = null;
let bodyEl = null;
let pollTimer = null;

export const operatePanelView = {
  async mount(root) {
    rootEl = root;
    rootEl.replaceChildren();
    const shell = document.createElement('div');
    shell.className = 'workspace operate-canvas';
    rootEl.appendChild(shell);

    const head = document.createElement('header');
    head.className = 'workspace-header';
    const title = document.createElement('h2');
    title.className = 'workspace-title';
    title.textContent = 'Operations console';
    head.appendChild(title);
    const sub = document.createElement('p');
    sub.className = 'workspace-subtitle';
    sub.textContent = 'System health on the left; ready-to-run actions on the right. Every action goes through preview + approval before anything changes.';
    head.appendChild(sub);
    shell.appendChild(head);

    const main = document.createElement('section');
    main.className = 'operate-main';
    shell.appendChild(main);

    bodyEl = document.createElement('div');
    bodyEl.className = 'operate-body';
    bodyEl.id = 'operateBody';
    main.appendChild(bodyEl);

    await refresh();
    startPolling();
  },

  unmount() { stopPolling(); },
};

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => { refresh().catch(() => {}); }, POLL_MS);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function refresh() {
  if (!bodyEl) return;
  try {
    const [health, templates] = await Promise.all([
      rpcWithDisclosure('nexus.operateHealth', {}),
      rpcWithDisclosure('nexus.operatorTemplates', {}),
    ]);
    bodyEl.replaceChildren(renderOperatePanel(health, templates));
  } catch (err) {
    bodyEl.replaceChildren(errorStateNode(err));
  }
}
