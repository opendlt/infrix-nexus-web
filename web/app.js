// Nexus — SPA entry point.
//
// One canvas. The spine IS the explorer. Routes:
//   #/spine           — timeline of recent intents
//   #/spine/<id>      — narrative for that intent (slid up over the timeline)
//
// Legacy routes auto-redirect into the canonical hash form.

import { createRouter } from '/lib/router.js';
import { startView } from '/views/start.js';
import { guidedView } from '/views/guided.js';
import { learnView } from '/views/learn.js';
import { agentView } from '/views/agent.js';
import { scenarioBuilderView } from '/views/scenario_builder.js';
import { tasksView } from '/views/tasks.js';
import { identityView } from '/views/identity.js';
import { questsView } from '/views/quests.js';
import { tutorView } from '/views/tutor.js';
import { receiptView } from '/views/receipt.js';
import { spineView } from '/views/spine.js';
import { composeView } from '/views/compose.js';
import { approveView } from '/views/approve.js';
import { executeView } from '/views/execute.js';
import { proveView } from '/views/prove.js';
import { governView } from '/views/govern.js';
import { operatePanelView } from '/views/operatePanel.js';
import { inboxView } from '/views/inbox.js';
import { verifyBatchView } from '/views/verifyBatch.js';
import { diffView } from '/views/diff.js';
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
  // adoption-02 + adoption-04 — guided-mode front door. "What do you want to
  // do?" routes a newcomer to one of five guided task flows. Expert mode (the
  // spine and the surfaces below) is always one header toggle away.
  start: startView,

  // adoption-04 — guided task flows: #/guided/<escrow|verify|inspect|
  // readiness|metamask>. Each ends with a link into the matching expert view.
  guided: guidedView,

  // adoption-11 — learning ladder. #/learn teaches the six concepts (intent →
  // policy → outcome → proof → anchor → spine) as dismissible "learn as you go"
  // panels, linked to the docs/learn lessons.
  learn: learnView,

  // nextux-01 — Agent Mode. #/agent is a human window into the Agent Action
  // Protocol: list actions, dry-run, approve, run, and see proof receipts +
  // structured failures from a running `infrix agent serve`.
  agent: agentView,

  // nextux-02 — Scenario Builder. #/scenarios lets a non-expert build a
  // scenario, run it for a real proof, and verify a shared proof story in the
  // browser.
  scenarios: scenarioBuilderView,

  // RUNBOOK-01 IA: the design-system gallery moved to web/marketing/ (a
  // reference surface, not an operator workspace). Old #/design deep-links fall
  // back into the cockpit until the marketing host serves it.
  design: makeRedirect(() => '#/spine'),

  // nextux-04 — Task Template Marketplace. #/tasks is a gallery of signed,
  // ready-to-run task templates with trust badges, loaded from the same
  // Go-generated catalog the CLI + SDK use.
  tasks: tasksView,

  // RUNBOOK-01 IA: the fixture-only Autopilot surface was removed; remediation
  // is composed and previewed in the one real Build surface (Intent Studio).
  autopilot: makeRedirect(() => '#/compose'),

  // RUNBOOK-01 IA: the fixture-only Workbench was removed; plain-language → plan
  // now lives in the one real Build surface (Intent Studio, #/compose).
  workbench: makeRedirect(() => '#/compose'),

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

  // RUNBOOK-01 IA: the proof-review queue is now the "proofs" lane of the one
  // Inbox. Old #/proof-inbox[/<id>] deep-links redirect into that lane.
  'proof-inbox': makeRedirect((s) => s.length > 0 ? '#/inbox/proofs/' + encodeURIComponent(s[0]) : '#/inbox/proofs'),

  // nextux-08 — Wallet & Identity Control Center.
  // #/identity       — wallet, Accumulate identity, signature queue, sessions,
  //                    permissions, signing history, safety center
  identity: identityView,

  // RUNBOOK-01 IA: the read-only Companion dashboard was superseded by the
  // Cockpit; old #/companion deep-links land on the Start hub.
  companion: makeRedirect(() => '#/start'),

  // nextux-11 — Proof Quest Mode.
  // #/quests         — learning trail: missions, progress, proof receipt, Cinema, next step
  quests: questsView,

  // RUNBOOK-01 IA: the fixture-only Visual Workflow Studio was removed; flow
  // composition consolidates into the real Build surface (#/compose).
  studio: makeRedirect(() => '#/compose'),

  // nextux-13 — Conversational Proof Tutor.
  // #/tutor          — explain a parsed artifact (can/cannot claim), audiences, lessons, quiz
  tutor: tutorView,

  // RUNBOOK-01 IA: the fixture "multiplayer" rooms demo was removed; old
  // #/rooms deep-links land on the Start hub.
  rooms: makeRedirect(() => '#/start'),

  // RUNBOOK-01 IA: the Comparison Lab moved to web/marketing/ (reference page);
  // old #/compare deep-links fall back into the cockpit.
  compare: makeRedirect(() => '#/spine'),

  // RUNBOOK-01 IA: the fixture-only "Prompt-to-Proof App Studio" (no input box,
  // no nav entry) was removed as the default landing; #/start is the newcomer
  // front door now. Old #/app bookmarks redirect there.
  app: makeRedirect(() => '#/start'),

  // RUNBOOK-01 IA: the public launch page, trust center, and wallet-lab moved to
  // web/marketing/ (reference/marketing surfaces). Until the marketing host
  // serves them, old deep-links fall back to the nearest in-app surface.
  // #/receipt stays in-app (the shareable proof receipt).
  launch: makeRedirect(() => '#/start'),
  'trust-center': makeRedirect(() => '#/govern'),
  'wallet-lab': makeRedirect(() => '#/identity'),
  receipt: receiptView,

  // Cinema-Inbox-Time E3C8 — batch verifier surface.
  // #/verifyBatch              — empty launcher
  // #/verifyBatch/<jobId>      — poll an in-flight or completed job
  verifyBatch: verifyBatchView,
  // RUNBOOK-07 SP2 — temporal diff. #/diff or #/diff/<A>/<B> to seed the pickers.
  diff: diffView,
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

  // IA consolidation (RUNBOOK-01) — the front door for a newcomer is the guided
  // Start hub (#/start); experts (who toggled Expert) land on the spine. The old
  // #/app prompt-to-proof landing was a fixture with no input box and no nav
  // entry — it is gone. Any direct URL still works.
  const noHash = !window.location.hash || window.location.hash === '#' || window.location.hash === '#/';
  if (noHash) {
    const mode = (() => { try { return localStorage.getItem('nexus.mode'); } catch (_) { return null; } })();
    window.location.hash = mode === 'expert' ? '#/spine' : '#/start';
  }

  const container = document.getElementById('view-container');
  const navLinks = document.querySelectorAll('[data-route]');
  createRouter({
    routes,
    defaultRoute: 'spine',
    container,
    navLinks,
  });
});
