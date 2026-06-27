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
import { createSpineStrip } from '/lib/spineStrip.js';
import { createApprovalQueue, createRiskRail, createVerificationRail, createDraftsRail } from '/lib/cockpitRails.js';
import { ensureSlice, getSlice } from '/lib/store.js';
import { mountBoardScrubber } from '/lib/boardScrubber.js';

let rootEl = null;
let strip = null;
let timeline = null;
let narrative = null;
let telemetry = null;
let scrubber = null;
let currentSubpath = [];

export const spineView = {
  mount(root, subpath) {
    rootEl = root;
    currentSubpath = Array.isArray(subpath) ? subpath : [];
    if (strip) { strip.destroy && strip.destroy(); strip = null; }
    if (timeline) { timeline.destroy && timeline.destroy(); timeline = null; }
    if (narrative) { narrative.destroy && narrative.destroy(); narrative = null; }
    if (telemetry) { telemetry.destroy && telemetry.destroy(); telemetry = null; }
    if (scrubber) { scrubber.destroy && scrubber.destroy(); scrubber = null; }
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

    // Spine strip — THE hero (RUNBOOK-02 Task 2). Always visible, spans both
    // columns via grid-area "strip". With no selection its cards show live
    // throughput and clicking filters the timeline; with an intent open its
    // cards become chapter jump-anchors reflecting that intent's progression.
    strip = createSpineStrip({
      onStageClick: (stageKey) => {
        if (currentSubpath.length > 0) {
          if (narrative) narrative.scrollToChapter(stageKey);
        } else {
          if (timeline) timeline.setFilter(stageKey);
        }
      },
    });
    canvas.appendChild(strip.element);

    const flow = document.createElement('div');
    flow.className = 'spine-flow';
    canvas.appendChild(flow);

    // RUNBOOK-02 Task 3 — the raw-JSON quick-compose dock no longer leads the
    // Cockpit. The home opens with the spine hero + the attention rails; the
    // flow region leads with the timeline. The expert paste-JSON path lives
    // behind the Build/Studio surface (#/compose).

    timeline = createTimeline({
      onIntentSelect: (intentId) => {
        window.location.hash = '#/spine/' + encodeURIComponent(intentId);
      },
    });
    flow.appendChild(timeline.element);

    narrative = createNarrative({
      onClose: () => { window.location.hash = '#/spine'; },
      onChapterEnter: (stageKey) => { if (strip) strip.setActiveChapter(stageKey); },
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

    // RUNBOOK-07 SP1 — the global time scrubber, docked at the foot of the
    // cockpit. Dragging it sets the global `at` cursor; the store's onAtChange
    // subscriber (RUNBOOK-03 T4) re-fetches every board slice at that block, so
    // ALL panels above re-paint as of that block. getRange() reads the earliest
    // visible block from recentIntents and the live head from #headerBlockHeight.
    const dock = document.createElement('div');
    dock.className = 'cockpit-scrubber-dock';
    scrubber = mountBoardScrubber(dock, { getRange: cockpitBlockRange });
    if (scrubber.element) { dock.appendChild(scrubber.element); shell.appendChild(dock); }

    // Kick off the cockpit slice immediately so first-paint sees real data.
    ensureSlice('cockpit').catch(() => {});
    ensureSlice('recentIntents').catch(() => {});

    applySelection();
  },

  onSubpathChange(subpath) {
    currentSubpath = Array.isArray(subpath) ? subpath : [];
    applySelection();
  },
};

// cockpitBlockRange — { min, max } for the board scrubber. max = the live head
// (the header block-height badge telemetry already polls); min = the earliest
// block visible in the recentIntents slice (fallback: head - 100).
function cockpitBlockRange() {
  let max = 1;
  const el = typeof document !== 'undefined' && document.getElementById('headerBlockHeight');
  const headVal = el ? Number(String(el.textContent).replace(/[^\d]/g, '')) : NaN;
  if (Number.isFinite(headVal) && headVal > 0) max = headVal;

  let min = max;
  const slice = getSlice('recentIntents');
  const rows = (slice && slice.data && (slice.data.intents || slice.data.Intents)) || [];
  for (const r of rows) {
    const b = Number(r.blockHeight ?? r.BlockHeight ?? r.block);
    if (Number.isFinite(b) && b > 0 && b < min) min = b;
  }
  if (min >= max) min = Math.max(1, max - 100);
  return { min, max };
}

function applySelection() {
  if (currentSubpath.length > 0) {
    const intentId = currentSubpath[0];
    if (narrative) {
      narrative.openIntent(intentId, (stages) => {
        if (strip) strip.showIntentProgression(stages); // cards reflect THIS intent
      });
    }
  } else {
    if (narrative) narrative.close();
    if (strip) strip.showThroughput();                  // cards show live in-flight counts
  }
}
