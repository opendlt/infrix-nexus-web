// Nexus — Execution Cinema view.
//
// NEXUS-REIMAGINED-2026-05-10 Phase 4 — Execution Cinema.
//
// Routes:
//   #/execute/<intentId>          — live execution graph for the intent
//   #/execute/<intentId>/replay   — replay mode for a completed intent
//
// During live execution the view polls the nexus.executionGraph
// projection every 3 s — fast enough for a multi-step run to feel
// alive without overwhelming the spine. Polling is paused when the
// outcome reaches a terminal status (completed / failed / compensated)
// so we don't hammer the backend after the run is done.
//
// Replay mode renders the same graph but with a step-by-step progress
// slider that walks through outcome.StepOutcomes chronologically. The
// user can scrub forward / back / pause to inspect any moment.

import { rpcWithDisclosure, errorStateNode } from '/lib/spineCommon.js';
import { renderExecutionGraph } from '/lib/executionGraph.js';
import { mountTimelineScrubber, rewindGraphToBlock } from '/lib/timelineScrubber.js';

const POLL_MS = 3000;

let rootEl = null;
let bodyEl = null;
let pollTimer = null;
let currentIntentId = null;
let mode = 'live'; // 'live' | 'replay'

export const executeView = {
  async mount(root, subpath) {
    rootEl = root;
    rootEl.replaceChildren();
    const shell = document.createElement('div');
    shell.className = 'workspace execute-canvas';
    rootEl.appendChild(shell);

    const head = document.createElement('header');
    head.className = 'workspace-header';
    const title = document.createElement('h2');
    title.className = 'workspace-title';
    title.textContent = 'Live execution';
    head.appendChild(title);
    const sub = document.createElement('p');
    sub.className = 'workspace-subtitle';
    sub.textContent = 'Watch this action run, see why it\'s waiting, and replay it later.';
    head.appendChild(sub);
    const intentLine = document.createElement('div');
    intentLine.className = 'execute-intent-line mono';
    intentLine.id = 'executeIntentLine';
    head.appendChild(intentLine);
    shell.appendChild(head);

    const main = document.createElement('section');
    main.className = 'execute-main';
    shell.appendChild(main);

    bodyEl = document.createElement('div');
    bodyEl.className = 'execute-body';
    bodyEl.id = 'executeBody';
    main.appendChild(bodyEl);

    const intentId = subpath && subpath[0];
    if (!intentId) {
      bodyEl.replaceChildren(textNode('No intent ID supplied. Open this view from a row in the spine timeline.', 'execute-empty'));
      return;
    }
    currentIntentId = intentId;
    mode = (subpath && subpath[1] === 'replay') ? 'replay' : 'live';
    intentLine.textContent = 'intentId: ' + intentId + (mode === 'replay' ? '  ·  REPLAY' : '');
    await refreshGraph();
    if (mode === 'live') startPolling();
  },

  onSubpathChange(subpath) {
    const intentId = subpath && subpath[0];
    const newMode = (subpath && subpath[1] === 'replay') ? 'replay' : 'live';
    if (intentId === currentIntentId && newMode === mode) return;
    currentIntentId = intentId || currentIntentId;
    mode = newMode;
    const intentLine = document.getElementById('executeIntentLine');
    if (intentLine) intentLine.textContent = 'intentId: ' + currentIntentId + (mode === 'replay' ? '  ·  REPLAY' : '');
    refreshGraph().catch(() => {});
    if (mode === 'live') startPolling();
    else stopPolling();
  },

  unmount() {
    stopPolling();
  },
};

function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const g = await rpcWithDisclosure('nexus.executionGraph', { intentId: currentIntentId });
      // Stop polling once outcome is terminal — spine is at rest.
      const terminal = g && g.outcome && ['completed', 'failed', 'compensated'].includes(g.outcome.overallStatus);
      bodyEl.replaceChildren(renderExecutionGraph(g, {
        onReplay: () => {
          window.location.hash = `#/execute/${encodeURIComponent(currentIntentId)}/replay`;
        },
      }));
      if (terminal) stopPolling();
    } catch (err) {
      bodyEl.replaceChildren(errorStateNode(err));
      stopPolling();
    }
  }, POLL_MS);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function refreshGraph() {
  if (!currentIntentId || !bodyEl) return;
  try {
    const g = await rpcWithDisclosure('nexus.executionGraph', { intentId: currentIntentId });
    if (mode === 'replay') {
      bodyEl.replaceChildren(renderReplayMode(g));
    } else {
      bodyEl.replaceChildren(renderExecutionGraph(g, {
        onReplay: () => {
          window.location.hash = `#/execute/${encodeURIComponent(currentIntentId)}/replay`;
        },
      }));
    }
  } catch (err) {
    bodyEl.replaceChildren(errorStateNode(err));
  }
}

// =================================================================
// Replay mode — walks outcome.StepOutcomes chronologically. Each tick
// surfaces the graph as it was at step `i`: every node up to and
// including step i carries its status; later nodes show as pending.
// =================================================================
function renderReplayMode(g) {
  const root = document.createElement('div');
  root.className = 'execution-replay-mode';
  if (!g || !Array.isArray(g.nodes) || g.nodes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'execute-empty';
    empty.textContent = 'No execution to replay — this intent has not produced an outcome yet.';
    root.appendChild(empty);
    return root;
  }

  const banner = document.createElement('div');
  banner.className = 'verify-summary verify-pass execute-replay-banner';
  banner.textContent = `Replay — ${g.nodes.length} step(s) from outcome ${g.outcome ? g.outcome.id : '—'}.`;
  root.appendChild(banner);

  // E1C4: real block-height timeline scrubber. The graph host below
  // is re-rendered every time the playhead changes via
  // rewindGraphToBlock — pure deterministic re-derivation from the
  // node timing fields.
  const scrubberWrap = document.createElement('div');
  scrubberWrap.className = 'execute-replay-scrubber-wrap';
  root.appendChild(scrubberWrap);

  const graphHost = document.createElement('div');
  graphHost.className = 'execute-replay-graph-host';
  root.appendChild(graphHost);

  const renderAtBlock = (blockHeight) => {
    const rewound = rewindGraphToBlock(g, blockHeight);
    graphHost.replaceChildren(renderExecutionGraph(rewound));
  };

  mountTimelineScrubber(scrubberWrap, g, (block) => renderAtBlock(block));
  // Initial paint at the latest block — full state visible.
  let initialBlock = 0;
  for (const n of g.nodes) {
    if (typeof n.completedAtBlock === 'number' && n.completedAtBlock > initialBlock) {
      initialBlock = n.completedAtBlock;
    }
  }
  renderAtBlock(initialBlock);

  // "Live" link to flip back
  const back = document.createElement('a');
  back.className = 'execute-replay-back';
  back.href = `#/execute/${encodeURIComponent(currentIntentId)}`;
  back.textContent = '← Back to live';
  root.appendChild(back);

  return root;
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
