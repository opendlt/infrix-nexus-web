// RUNBOOK-07 SP1 — the global time scrubber ("the time machine").
//
// A cockpit-level playhead that re-paints the ENTIRE board (spine timeline,
// approvals, risk rail, trust drift, anchor backlog) as it stood at any block.
// Dragging sets the global `at` coordinate; every store slice re-fetches at that
// block via the store's onAtChange subscriber (RUNBOOK-03 Task 4). At board
// scope the "rewind" is data-driven — the panels re-render through their
// existing slice subscriptions; this file owns NO per-DAG-node recompute.
//
// The control/play/keyboard machinery mirrors timelineScrubber.js, but onSeek
// calls setAt/setAt(null) instead of a local callback. The seek/play CORE is
// factored out (createScrubberCore) so it is unit-testable without a DOM and
// without the real timeContext.

import { setAt as realSetAt, getAt as realGetAt, isAtLive as realIsAtLive, onAtChange as realOnAtChange } from '/lib/timeContext.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SPEEDS = [1, 2, 5];

const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));

/**
 * createScrubberCore({ min, max, ctx }) → controller (no DOM).
 * ctx = { setAt, getAt, isAtLive } (injectable for tests). `onPaint` is called
 * after every block change so a DOM layer can re-render.
 */
export function createScrubberCore({ min, max, ctx, onPaint = () => {} }) {
  const setAt = ctx.setAt;
  let block = max;                                // start live (at head)
  let timer = null;
  let speedIndex = 0;

  function seek(b) {
    const next = clamp(min, max, Math.round(b));
    block = next;
    if (next >= max) setAt(null);                 // snap to head == live
    else setAt({ block: next });                  // freeze; store re-fetches via onAtChange
    onPaint(state());
    return next;
  }

  // Play forward: one block per tick; stop at head. The board re-paints because
  // the store's onAtChange subscriber invalidates every slice.
  function tick() {
    if (block >= max) { stop(); return block; }
    return seek(block + 1);
  }

  function play(scheduler) {
    if (timer) return;
    if (block >= max) seek(min);                  // restart from the beginning
    const intervalMs = Math.max(120, 600 / SPEEDS[speedIndex]);
    const sched = scheduler || ((fn) => setInterval(fn, intervalMs));
    timer = sched(() => { if (block >= max) stop(); else tick(); }, intervalMs);
    onPaint(state());
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    onPaint(state());
  }

  function cycleSpeed() {
    const wasPlaying = !!timer;
    if (wasPlaying) stop();
    speedIndex = (speedIndex + 1) % SPEEDS.length;
    if (wasPlaying) play();
    onPaint(state());
    return SPEEDS[speedIndex];
  }

  // Reflect an external at change (deep-link, popstate, another control) into
  // the playhead position without re-issuing setAt.
  function syncFromAt(at) {
    block = at && at.block ? clamp(min, max, at.block) : max;
    onPaint(state());
  }

  function setRange(nextMin, nextMax) {
    min = nextMin; max = nextMax;
    block = clamp(min, max, block);
    onPaint(state());
  }

  const state = () => ({
    block, min, max,
    live: block >= max,
    playing: !!timer,
    speed: SPEEDS[speedIndex],
  });

  return { seek, tick, play, stop, cycleSpeed, syncFromAt, setRange, getBlock: () => block, isPlaying: () => !!timer, state };
}

/**
 * mountBoardScrubber(host, { getRange, ctx? }) → { element, core, destroy }
 * Builds the board scrubber UI inside `host` and wires it to the global cursor.
 * `getRange()` → { min, max } from recentIntents + the live head block.
 * Pass host=null to build a headless controller (used by tests).
 */
export function mountBoardScrubber(host, { getRange, ctx } = {}) {
  const C = ctx || { setAt: realSetAt, getAt: realGetAt, isAtLive: realIsAtLive, onAtChange: realOnAtChange };
  const range = (typeof getRange === 'function' ? getRange() : null) || { min: 1, max: 1 };

  // Headless mode (tests): no DOM, just the controller + at sync.
  if (!host || typeof document === 'undefined') {
    const core = createScrubberCore({ min: range.min, max: range.max, ctx: C });
    const off = C.onAtChange ? C.onAtChange((at) => core.syncFromAt(at)) : () => {};
    return { element: null, core, destroy: off };
  }

  const root = document.createElement('section');
  root.className = 'board-scrubber';
  root.setAttribute('aria-label', 'Board time scrubber');

  const pill = document.createElement('span');
  pill.className = 'board-scrubber-pill';

  const rail = document.createElementNS(SVG_NS, 'svg');
  rail.setAttribute('class', 'board-scrubber-rail');
  rail.setAttribute('height', '28');
  rail.setAttribute('tabindex', '0');
  rail.setAttribute('role', 'slider');
  rail.setAttribute('aria-label', 'Board block');
  const track = document.createElementNS(SVG_NS, 'line');
  track.setAttribute('class', 'board-scrubber-track');
  rail.appendChild(track);
  const head = document.createElementNS(SVG_NS, 'circle');
  head.setAttribute('class', 'board-scrubber-head');
  head.setAttribute('r', '6');
  rail.appendChild(head);

  const readout = document.createElement('span');
  readout.className = 'board-scrubber-readout';

  const controls = document.createElement('div');
  controls.className = 'board-scrubber-controls';
  const stepBack = btn('‹', 'Step back one block');
  const playBtn = btn('▶ Play', 'Play forward');
  const stepFwd = btn('›', 'Step forward one block');
  const speedBtn = btn('1×', 'Cycle play speed');
  const liveBtn = btn('Return to live', 'Snap to the live head');
  controls.append(stepBack, playBtn, stepFwd, speedBtn, liveBtn);

  root.append(pill, rail, readout, controls);

  // JS reduced-motion read (the CSS @media also guards it) — when set, the
  // play-forward stage-light flourish is suppressed via this class hook.
  const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  root.classList.toggle('reduced-motion', reducedMotion);

  const core = createScrubberCore({
    min: range.min, max: range.max, ctx: C,
    onPaint: (st) => paint(st),
  });

  function paint(st) {
    const w = rail.clientWidth || 320;
    track.setAttribute('x1', '8'); track.setAttribute('y1', '14');
    track.setAttribute('x2', String(w - 8)); track.setAttribute('y2', '14');
    const span = (st.max - st.min) || 1;
    const x = 8 + ((st.block - st.min) / span) * (w - 16);
    head.setAttribute('cx', String(Number.isFinite(x) ? x : 8));
    head.setAttribute('cy', '14');
    rail.setAttribute('aria-valuemin', String(st.min));
    rail.setAttribute('aria-valuemax', String(st.max));
    rail.setAttribute('aria-valuenow', String(st.block));
    readout.textContent = `block ${st.block} of ${st.max}`;
    pill.textContent = st.live ? '● LIVE' : `❚❚ FROZEN @ block ${st.block}`;
    pill.classList.toggle('is-live', st.live);
    pill.classList.toggle('is-frozen', !st.live);
    playBtn.textContent = st.playing ? '❚❚ Pause' : '▶ Play';
    speedBtn.textContent = st.speed + '×';
    liveBtn.disabled = st.live;
  }

  // Pointer seek along the rail.
  rail.addEventListener('pointerdown', (e) => {
    const r = rail.getBoundingClientRect();
    const frac = clamp(0, 1, (e.clientX - r.left - 8) / (r.width - 16));
    const st = core.state();
    core.seek(st.min + frac * (st.max - st.min));
  });

  // Keyboard: ←/→ step, Shift+←/→ ±10, Space play/pause.
  rail.addEventListener('keydown', (e) => {
    const st = core.state();
    if (e.key === 'ArrowRight') { e.preventDefault(); core.seek(st.block + (e.shiftKey ? 10 : 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); core.seek(st.block - (e.shiftKey ? 10 : 1)); }
    else if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'Home') { e.preventDefault(); core.seek(st.min); }
    else if (e.key === 'End') { e.preventDefault(); core.seek(st.max); }
  });

  // Play steps the DATA one block per tick regardless of reduced-motion; the
  // reduced-motion flag only suppresses the stage-light flourish (CSS-gated).
  function togglePlay() {
    if (core.isPlaying()) core.stop();
    else core.play();
  }

  stepBack.addEventListener('click', () => core.seek(core.getBlock() - 1));
  stepFwd.addEventListener('click', () => core.seek(core.getBlock() + 1));
  playBtn.addEventListener('click', togglePlay);
  speedBtn.addEventListener('click', () => core.cycleSpeed());
  liveBtn.addEventListener('click', () => core.seek(core.state().max));

  // Keep the range fresh as new blocks arrive (the head advances live).
  const refreshRange = () => {
    if (typeof getRange !== 'function') return;
    const r = getRange();
    if (r && Number.isFinite(r.max)) core.setRange(r.min, r.max);
  };
  const rangeTimer = setInterval(refreshRange, 4000);

  const off = C.onAtChange ? C.onAtChange((at) => core.syncFromAt(at)) : () => {};
  paint(core.state());

  return {
    element: root,
    core,
    destroy() {
      core.stop();
      clearInterval(rangeTimer);
      try { off(); } catch (_) {}
    },
  };

  function btn(label, title) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'board-scrubber-btn';
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-label', title);
    return b;
  }
}
