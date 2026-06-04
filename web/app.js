// Nexus — SPA entry point.
//
// One canvas. The spine IS the explorer. Routes:
//   #/spine           — timeline of recent intents
//   #/spine/<id>      — narrative for that intent (slid up over the timeline)
//
// Legacy routes auto-redirect into the canonical hash form.

import { createRouter } from '/lib/router.js';
import { spineView } from '/views/spine.js';
import { composeView } from '/views/compose.js';
import { approveView } from '/views/approve.js';
import { executeView } from '/views/execute.js';
import { proveView } from '/views/prove.js';
import { governView } from '/views/govern.js';
import { operatePanelView } from '/views/operatePanel.js';
import { inboxView } from '/views/inbox.js';
import { verifyBatchView } from '/views/verifyBatch.js';
import { initHeader } from '/lib/header.js';
import { initTimeContext } from '/lib/timeContext.js';

function makeRedirect(hashFn) {
  return {
    mount(root, subpath) {
      const newHash = hashFn(subpath || []);
      if (window.location.hash !== newHash) window.location.replace(newHash);
    },
    onSubpathChange(subpath) {
      const newHash = hashFn(subpath || []);
      if (window.location.hash !== newHash) window.location.replace(newHash);
    },
  };
}

function planToIntent(planID) {
  const m = /^plan-(.+)$/.exec(planID);
  return m ? m[1] : planID;
}
function outcomeToIntent(outcomeID) {
  let m = /^outcome-plan-(.+)$/.exec(outcomeID);
  if (m) return m[1];
  m = /^outcome-(.+)$/.exec(outcomeID);
  return m ? m[1] : outcomeID;
}
function evidenceToIntent(evID) {
  const m = /^ev-(.+)$/.exec(evID);
  return m ? m[1] : evID;
}
function anchorToIntent(anchorID) {
  const m = /^anchor-[^-]+-(.+)-\d+$/.exec(anchorID);
  return m ? m[1] : anchorID;
}

const routes = {
  // The single canonical view
  spine: spineView,

  // NEXUS-REIMAGINED-2026-05-10 Phase 2 — Intent Studio.
  // #/compose                — last-used goal, guided form
  // #/compose/<GOAL_TYPE>    — pre-selected goal, guided form
  // #/compose/<GOAL>/raw     — pre-selected goal, raw-JSON mode
  compose: composeView,

  // NEXUS-REIMAGINED-2026-05-10 Phase 3 — Approval Dossier.
  // #/approve/<planId> — dedicated approval review screen
  approve: approveView,

  // NEXUS-REIMAGINED-2026-05-10 Phase 4 — Execution Cinema.
  // #/execute/<intentId>          — live DAG with auto-poll
  // #/execute/<intentId>/replay   — chronological replay mode
  execute: executeView,

  // NEXUS-REIMAGINED-2026-05-10 Phase 5 — Evidence Reader And
  // Portable Verification.
  // #/prove                       — drop-zone offline verifier
  // #/prove/<evidenceId>          — live evidence reader for a bundle
  prove: proveView,

  // NEXUS-REIMAGINED-2026-05-10 Phase 6 — Govern Atlas.
  // #/govern                      — atlas index (Actors tab)
  // #/govern/<kind>               — kind-filtered list
  // #/govern/<kind>/<nodeId>      — drilldown drawer
  govern: governView,

  // Every legacy route translates back into the canvas with the right
  // selection state. The user always lands inside the spine.
  live:    makeRedirect(() => '#/spine'),
  inspect: makeRedirect((s) => s.length > 0 ? '#/spine/' + encodeURIComponent(s[0]) : '#/spine'),
  intents:  makeRedirect((s) => s.length > 0 ? '#/spine/' + encodeURIComponent(s[0]) : '#/spine'),
  plans:    makeRedirect((s) => s.length > 0 ? '#/spine/' + encodeURIComponent(planToIntent(s[0])) : '#/spine'),
  outcomes: makeRedirect((s) => s.length > 0 ? '#/spine/' + encodeURIComponent(outcomeToIntent(s[0])) : '#/spine'),
  evidence: makeRedirect((s) => s.length > 0 ? '#/spine/' + encodeURIComponent(evidenceToIntent(s[0])) : '#/spine'),
  anchors:  makeRedirect((s) => s.length > 0 ? '#/spine/' + encodeURIComponent(anchorToIntent(s[0])) : '#/spine'),

  // NEXUS-REIMAGINED-2026-05-10 Phase 7 — operate console.
  // Replaces the legacy slide-in panel — every mutating control is
  // now an action template that opens Intent Studio in preview mode.
  operate: operatePanelView,

  // Cinema-Inbox-Time E2C4 — collaborative inbox.
  // #/inbox          — full inbox, default tab = approvals
  // #/inbox/<tab>    — focus a lane (approvals|assigned|mentions|handoffs|drafts)
  inbox: inboxView,

  // Cinema-Inbox-Time E3C8 — batch verifier surface.
  // #/verifyBatch              — empty launcher
  // #/verifyBatch/<jobId>      — poll an in-flight or completed job
  verifyBatch: verifyBatchView,
  // Phase 6 — every authority surface becomes a govern-atlas tab.
  approvals:    makeRedirect((s) => s.length > 0 ? '#/govern/approvals/' + encodeURIComponent(s[0]) : '#/govern/approvals'),
  policies:     makeRedirect((s) => s.length > 0 ? '#/govern/policies/' + encodeURIComponent(s[0])  : '#/govern/policies'),
  trust:        makeRedirect((s) => s.length > 0 ? '#/govern/trustProfiles/' + encodeURIComponent(s[0]) : '#/govern/trustProfiles'),
  plugins:      makeRedirect((s) => s.length > 0 ? '#/govern/plugins/' + encodeURIComponent(s[0])  : '#/govern/plugins'),
  capabilities: makeRedirect((s) => s.length > 0 ? '#/govern/capabilities/' + encodeURIComponent(s[0]) : '#/govern/capabilities'),
  roles:        makeRedirect((s) => s.length > 0 ? '#/govern/roles/' + encodeURIComponent(s[0])    : '#/govern/roles'),
  subsystems: makeRedirect(() => '#/spine'),
  // Phase 5 promotes #/prove to canonical; #/verify keeps legacy
  // semantics by redirecting straight into the drop-zone verifier.
  verify:     makeRedirect(() => '#/prove'),
  network:    makeRedirect(() => '#/spine'),
};

window.addEventListener('DOMContentLoaded', () => {
  // Time-travel context must initialise BEFORE any view mounts so the
  // first paint reads the URL's at-coordinate, not a stale live read.
  initTimeContext();
  initHeader();
  const container = document.getElementById('view-container');
  const navLinks = document.querySelectorAll('[data-route]');
  createRouter({
    routes,
    defaultRoute: 'spine',
    container,
    navLinks,
  });
});
