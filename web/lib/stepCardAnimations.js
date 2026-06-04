// Nexus — step card state-transition animations.
//
// Cinema-Inbox-Time Effort 1 Commit 3.
//
// Step cards already paint their status as a static class
// (.status-running, .status-completed, .status-failed, etc). This
// module wires *transitions* — when a card's status changes between
// renders we apply a one-shot animation class so the user sees the
// system move, not just snap.
//
// Strategy: each .execution-step-card holds its most-recently-seen
// status in `dataset.prevStatus`. On every renderer pass we walk
// every card and, if prevStatus != currentStatus, apply the
// appropriate transition class for the duration of the keyframe,
// then update prevStatus. The class names are wired to CSS keyframes
// declared in styles.css.

const TRANSITIONS = [
  // [from, to, className, durationMs]
  ['pending', 'running',          'step-card-anim-start',     1400],
  ['pending', 'waiting_approval', 'step-card-anim-blocked',    600],
  ['pending', 'waiting_anchor',   'step-card-anim-anchor',    3000],
  ['running', 'completed',        'step-card-anim-success',    600],
  ['running', 'failed',           'step-card-anim-failure',    220],
  ['running', 'success',          'step-card-anim-success',    600],
  ['waiting_approval', 'running', 'step-card-anim-start',     1400],
  ['waiting_anchor',   'completed', 'step-card-anim-success',  600],
];

const TRANSITION_INDEX = new Map();
for (const [from, to, cls, dur] of TRANSITIONS) {
  TRANSITION_INDEX.set(`${from}→${to}`, { cls, dur });
}

/**
 * Apply transition animations to every .execution-step-card under host.
 * Call after each renderer pass — idempotent against unchanged statuses.
 *
 * @param {HTMLElement} host
 */
export function applyStepCardTransitions(host) {
  if (!host) return;
  const cards = host.querySelectorAll('.execution-step-card');
  for (const card of cards) {
    const current = currentStatus(card);
    const prev = card.dataset.prevStatus || current;
    if (current && prev !== current) {
      const t = TRANSITION_INDEX.get(`${prev}→${current}`);
      if (t) {
        card.classList.add(t.cls);
        // Schedule removal so the animation can re-trigger on a
        // future transition (e.g. running → completed → running on
        // a retry).
        const dur = t.dur;
        setTimeout(() => card.classList.remove(t.cls), dur + 50);
      }
    }
    card.dataset.prevStatus = current || '';
  }
}

function currentStatus(card) {
  // Status is encoded in a class of the form "status-<name>".
  for (const c of card.classList) {
    if (c.startsWith('status-')) return c.slice('status-'.length);
  }
  return '';
}

/**
 * Apply failure-overlay dimming to every card NOT in pathToFailure.
 * Adds .step-card-off-failure-path to non-path cards and
 * .step-card-on-failure-path to path cards.
 *
 * @param {HTMLElement} host
 * @param {string[]} pathToFailure — canonical chain of step IDs
 */
export function applyFailureOverlay(host, pathToFailure) {
  if (!host) return;
  const pathSet = new Set(pathToFailure || []);
  const hasFailure = pathSet.size > 0;
  const cards = host.querySelectorAll('.execution-step-card');
  for (const card of cards) {
    card.classList.remove('step-card-off-failure-path');
    card.classList.remove('step-card-on-failure-path');
    if (!hasFailure) continue;
    const id = card.dataset.stepId;
    if (pathSet.has(id)) {
      card.classList.add('step-card-on-failure-path');
    } else {
      card.classList.add('step-card-off-failure-path');
    }
  }
}

/**
 * Apply anchor-wait differentiation to the stage strip (the 7-stage
 * row at the top of the execution view). When spineStage == "anchor"
 * and waiting == "anchoring", the anchor chip gets a distinct
 * slow gold pulse and a "waiting on L0" caption.
 *
 * @param {HTMLElement} host — the stage track wrap
 * @param {Object} graph
 */
export function applyAnchorWaitOnStageStrip(host, graph) {
  if (!host || !graph) return;
  const stageNodes = host.querySelectorAll('.execution-stage-node');
  for (const node of stageNodes) {
    node.classList.remove('execution-stage-anchor-wait');
    const cap = node.querySelector('.execution-stage-anchor-caption');
    if (cap) cap.remove();
  }
  if (graph.spineStage === 'anchor' && graph.waiting === 'anchoring') {
    const anchorNode = host.querySelector('.execution-stage-node[data-stage="7"]');
    if (anchorNode) {
      anchorNode.classList.add('execution-stage-anchor-wait');
      const cap = document.createElement('div');
      cap.className = 'execution-stage-anchor-caption';
      cap.textContent = 'waiting on L0';
      anchorNode.appendChild(cap);
    }
  }
}
