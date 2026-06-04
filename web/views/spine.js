// Nexus — THE SPINE.
//
// One canvas. The canonical 7-stage pipeline IS the navigation.
// The user never leaves this view — they zoom in (timeline → narrative)
// and out (narrative → timeline) within a single living organism.
//
// Layout:
//   ┌────────────────────────────────────────────────────────────────┐
//   │  Spine strip — always visible — 7 stage cards                  │
//   ├──────────────────────────────────────┬─────────────────────────┤
//   │  Flow region                         │  Telemetry rail         │
//   │  ─ State A: Timeline (no selection)  │  Pulse + Activity +     │
//   │  ─ State B: Narrative (slid up)      │  Operate console btn    │
//   └──────────────────────────────────────┴─────────────────────────┘
//
// State transitions:
//   - Click intent row in timeline → narrative slides up (320ms)
//   - Click outside narrative / press Esc → narrative slides down
//   - Click stage card on strip (no selection) → filters timeline
//   - Click stage card on strip (selection active) → scrolls narrative to chapter

import { createTimeline } from '/lib/timeline.js';
import { createNarrative } from '/lib/narrative.js';
import { createTelemetry } from '/lib/telemetry.js';
import { createApprovalQueue, createRiskRail, createVerificationRail, createQuickComposeDock, createDraftsRail } from '/lib/cockpitRails.js';
import { ensureSlice } from '/lib/store.js';

let rootEl = null;
let timeline = null;
let narrative = null;
let telemetry = null;
let currentSubpath = [];

export const spineView = {
  mount(root, subpath) {
    rootEl = root;
    currentSubpath = Array.isArray(subpath) ? subpath : [];
    if (timeline) { timeline.destroy && timeline.destroy(); timeline = null; }
    if (narrative) { narrative.destroy && narrative.destroy(); narrative = null; }
    if (telemetry) { telemetry.destroy && telemetry.destroy(); telemetry = null; }
    rootEl.replaceChildren();

    const shell = document.createElement('div');
    shell.className = 'workspace';
    rootEl.appendChild(shell);

    const head = document.createElement('header');
    head.className = 'workspace-header';
    const title = document.createElement('h2');
    title.className = 'workspace-title';
    title.textContent = 'Cockpit';
    head.appendChild(title);
    const sub = document.createElement('p');
    sub.className = 'workspace-subtitle';
    sub.textContent = 'What needs your attention right now — risks, approvals, ready-to-verify results, and a quick action shortcut.';
    head.appendChild(sub);
    shell.appendChild(head);

    const canvas = document.createElement('div');
    canvas.className = 'cockpit-canvas';
    shell.appendChild(canvas);

    const flow = document.createElement('div');
    flow.className = 'spine-flow';
    canvas.appendChild(flow);

    // Quick compose dock — first content in the flow region.
    const composeDock = createQuickComposeDock();
    flow.appendChild(composeDock.element);

    timeline = createTimeline({
      onIntentSelect: (intentId) => {
        window.location.hash = '#/spine/' + encodeURIComponent(intentId);
      },
    });
    flow.appendChild(timeline.element);

    narrative = createNarrative({
      onClose: () => { window.location.hash = '#/spine'; },
      onChapterEnter: () => {},
    });
    flow.appendChild(narrative.element);

    // Right rail — telemetry + cockpit panels
    const rail = document.createElement('aside');
    rail.className = 'spine-telemetry';

    // Cockpit rails go above the telemetry pulse so risk + approvals
    // are immediately scannable on first paint.
    const approvalQueue = createApprovalQueue();
    rail.appendChild(approvalQueue.element);
    const riskRail = createRiskRail();
    rail.appendChild(riskRail.element);
    const verificationRail = createVerificationRail();
    rail.appendChild(verificationRail.element);
    // Cinema-Inbox-Time E2C6 — drafts rail so the operator can resume
    // their in-flight Studio compositions without rediscovery.
    const draftsRail = createDraftsRail({ pollMs: 30000 });
    rail.appendChild(draftsRail.element);

    // Existing telemetry (pulse + activity + console button) stays at
    // the bottom of the rail.
    telemetry = createTelemetry();
    // The telemetry component returns its own <aside> with class
    // spine-telemetry; pull its children into our rail to avoid two
    // sticky asides side-by-side.
    while (telemetry.element.firstChild) {
      rail.appendChild(telemetry.element.firstChild);
    }
    canvas.appendChild(rail);

    // Kick off the cockpit slice immediately so first-paint sees real data.
    ensureSlice('cockpit').catch(() => {});

    applySelection();
  },

  onSubpathChange(subpath) {
    currentSubpath = Array.isArray(subpath) ? subpath : [];
    applySelection();
  },
};

function applySelection() {
  if (currentSubpath.length > 0) {
    const intentId = currentSubpath[0];
    if (narrative) narrative.openIntent(intentId, () => {});
  } else {
    if (narrative) narrative.close();
  }
}
