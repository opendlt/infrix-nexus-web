// Nexus — timeline scrubber for execution replay.
//
// Cinema-Inbox-Time Effort 1 Commit 4.
//
// Replaces the old <input type="range"> with a proper timeline:
//
//   - X-axis is block heights from first event to last event
//   - Tick marks every 10 blocks; labels every 50 blocks
//   - Event markers (small dots) at each step's startedAtBlock /
//     completedAtBlock, color-coded by step type and clickable
//   - Draggable playhead with a current-block readout
//   - Keyboard navigation:
//       ← / →   step to previous / next event
//       Space   play/pause
//       Shift+→ jump forward 10 blocks
//       Shift+← jump backward 10 blocks
//   - Play button cycles through 1× / 2× / 5× speeds; auto-stops at end

const SVG_NS = 'http://www.w3.org/2000/svg';
const SPEEDS = [1, 2, 5];

/**
 * Mount a timeline scrubber inside the given host element.
 *
 * @param {HTMLElement} host
 * @param {Object} graph — nexus.executionGraph response
 * @param {(blockHeight: number) => void} onSeek — called whenever the
 *   playhead block changes
 * @returns {{ destroy(): void, getBlock(): number, setBlock(n): void }}
 */
export function mountTimelineScrubber(host, graph, onSeek) {
  const nodes = Array.isArray(graph && graph.nodes) ? graph.nodes : [];

  // Collect block-coordinate event markers from the nodes' timing fields.
  const markers = [];
  let minBlock = Infinity;
  let maxBlock = -Infinity;
  for (const n of nodes) {
    if (typeof n.startedAtBlock === 'number') {
      markers.push({ block: n.startedAtBlock, stepId: n.id, kind: 'started', type: n.type });
      if (n.startedAtBlock < minBlock) minBlock = n.startedAtBlock;
      if (n.startedAtBlock > maxBlock) maxBlock = n.startedAtBlock;
    }
    if (typeof n.completedAtBlock === 'number') {
      markers.push({ block: n.completedAtBlock, stepId: n.id, kind: 'completed', type: n.type });
      if (n.completedAtBlock < minBlock) minBlock = n.completedAtBlock;
      if (n.completedAtBlock > maxBlock) maxBlock = n.completedAtBlock;
    }
  }
  if (!isFinite(minBlock) || !isFinite(maxBlock) || minBlock === maxBlock) {
    // Degenerate timeline — render a static "no replay data" message.
    const msg = document.createElement('div');
    msg.className = 'timeline-scrubber-empty';
    msg.textContent = 'Not enough timing data to replay this action.';
    host.appendChild(msg);
    return { destroy() { msg.remove(); }, getBlock: () => 0, setBlock: () => {} };
  }
  markers.sort((a, b) => a.block - b.block);

  // ── DOM ──────────────────────────────────────────────────────
  const root = document.createElement('div');
  root.className = 'timeline-scrubber';

  // Playback controls row
  const controls = document.createElement('div');
  controls.className = 'timeline-scrubber-controls';

  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'verify-btn timeline-scrubber-play';
  playBtn.textContent = '▶ Play';
  controls.appendChild(playBtn);

  const speedBtn = document.createElement('button');
  speedBtn.type = 'button';
  speedBtn.className = 'verify-btn timeline-scrubber-speed';
  speedBtn.textContent = '1×';
  controls.appendChild(speedBtn);

  const stepBackBtn = document.createElement('button');
  stepBackBtn.type = 'button';
  stepBackBtn.className = 'verify-btn timeline-scrubber-step-back';
  stepBackBtn.textContent = '◂';
  stepBackBtn.title = 'Previous event (←)';
  controls.appendChild(stepBackBtn);

  const stepFwdBtn = document.createElement('button');
  stepFwdBtn.type = 'button';
  stepFwdBtn.className = 'verify-btn timeline-scrubber-step-fwd';
  stepFwdBtn.textContent = '▸';
  stepFwdBtn.title = 'Next event (→)';
  controls.appendChild(stepFwdBtn);

  const blockReadout = document.createElement('span');
  blockReadout.className = 'timeline-scrubber-readout mono';
  controls.appendChild(blockReadout);

  root.appendChild(controls);

  // Timeline SVG
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('timeline-scrubber-svg');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('viewBox', '0 0 1000 60');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '60');
  svg.setAttribute('role', 'slider');
  svg.setAttribute('aria-valuemin', String(minBlock));
  svg.setAttribute('aria-valuemax', String(maxBlock));
  svg.setAttribute('tabindex', '0');
  root.appendChild(svg);

  // Baseline rail
  const rail = document.createElementNS(SVG_NS, 'line');
  rail.setAttribute('x1', '0'); rail.setAttribute('y1', '32');
  rail.setAttribute('x2', '1000'); rail.setAttribute('y2', '32');
  rail.setAttribute('class', 'timeline-scrubber-rail');
  svg.appendChild(rail);

  // Tick marks every 10 blocks (labels every 50)
  const span = maxBlock - minBlock;
  for (let b = Math.ceil(minBlock / 10) * 10; b <= maxBlock; b += 10) {
    const x = ((b - minBlock) / span) * 1000;
    const t = document.createElementNS(SVG_NS, 'line');
    t.setAttribute('x1', String(x));
    t.setAttribute('x2', String(x));
    t.setAttribute('y1', '28');
    t.setAttribute('y2', '36');
    t.setAttribute('class', b % 50 === 0 ? 'timeline-scrubber-tick-major' : 'timeline-scrubber-tick-minor');
    svg.appendChild(t);
    if (b % 50 === 0) {
      const lbl = document.createElementNS(SVG_NS, 'text');
      lbl.setAttribute('x', String(x));
      lbl.setAttribute('y', '54');
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('class', 'timeline-scrubber-tick-label');
      lbl.textContent = String(b);
      svg.appendChild(lbl);
    }
  }

  // Event markers
  for (const m of markers) {
    const x = ((m.block - minBlock) / span) * 1000;
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', String(x));
    dot.setAttribute('cy', '32');
    dot.setAttribute('r', '4');
    dot.setAttribute('class', `timeline-scrubber-marker timeline-scrubber-marker-${m.kind} type-${(m.type || 'generic').replace(/[^a-zA-Z0-9_-]/g, '-')}`);
    dot.dataset.block = String(m.block);
    dot.dataset.stepId = m.stepId;
    dot.dataset.kind = m.kind;
    // Tooltip via <title>
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = `${m.kind} ${m.stepId} @ block ${m.block}`;
    dot.appendChild(title);
    // Click to seek
    dot.addEventListener('click', () => setBlock(m.block));
    svg.appendChild(dot);
  }

  // Playhead (drawn last so it's on top)
  const playhead = document.createElementNS(SVG_NS, 'line');
  playhead.setAttribute('y1', '10');
  playhead.setAttribute('y2', '50');
  playhead.setAttribute('class', 'timeline-scrubber-playhead');
  svg.appendChild(playhead);

  const playheadHandle = document.createElementNS(SVG_NS, 'circle');
  playheadHandle.setAttribute('cy', '32');
  playheadHandle.setAttribute('r', '7');
  playheadHandle.setAttribute('class', 'timeline-scrubber-playhead-handle');
  svg.appendChild(playheadHandle);

  // ── State ─────────────────────────────────────────────────────
  let currentBlock = maxBlock; // start at the end (most recent)
  let speedIndex = 0;
  let playTimer = null;

  function blockToX(b) {
    return ((Math.max(minBlock, Math.min(maxBlock, b)) - minBlock) / span) * 1000;
  }

  function paint() {
    const x = blockToX(currentBlock);
    playhead.setAttribute('x1', String(x));
    playhead.setAttribute('x2', String(x));
    playheadHandle.setAttribute('cx', String(x));
    blockReadout.textContent = `block ${currentBlock} of ${maxBlock}`;
    svg.setAttribute('aria-valuenow', String(currentBlock));
  }

  function setBlock(b) {
    const clamped = Math.max(minBlock, Math.min(maxBlock, Math.round(b)));
    if (clamped === currentBlock) return;
    currentBlock = clamped;
    paint();
    if (typeof onSeek === 'function') onSeek(currentBlock);
  }

  function nextMarkerBlock(direction) {
    if (direction > 0) {
      for (const m of markers) {
        if (m.block > currentBlock) return m.block;
      }
      return maxBlock;
    }
    for (let i = markers.length - 1; i >= 0; i--) {
      if (markers[i].block < currentBlock) return markers[i].block;
    }
    return minBlock;
  }

  // ── Interaction ──────────────────────────────────────────────
  function svgClientToBlock(clientX) {
    const rect = svg.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return minBlock + ratio * span;
  }

  let dragging = false;
  function onPointerDown(ev) {
    dragging = true;
    setBlock(svgClientToBlock(ev.clientX));
    svg.setPointerCapture && svg.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  }
  function onPointerMove(ev) {
    if (!dragging) return;
    setBlock(svgClientToBlock(ev.clientX));
  }
  function onPointerUp(ev) {
    dragging = false;
    try { svg.releasePointerCapture && svg.releasePointerCapture(ev.pointerId); } catch (e) { /* */ }
  }
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup',   onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);

  // Click on tick / rail (not a marker) — seek to block under cursor.
  svg.addEventListener('click', (ev) => {
    if (ev.target instanceof SVGCircleElement) return; // marker handled above
    if (ev.target instanceof SVGLineElement && ev.target.classList.contains('timeline-scrubber-playhead')) return;
    setBlock(svgClientToBlock(ev.clientX));
  });

  // Keyboard navigation when the SVG is focused.
  svg.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      if (ev.shiftKey) setBlock(currentBlock + 10);
      else setBlock(nextMarkerBlock(+1));
    } else if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      if (ev.shiftKey) setBlock(currentBlock - 10);
      else setBlock(nextMarkerBlock(-1));
    } else if (ev.key === ' ' || ev.code === 'Space') {
      ev.preventDefault();
      togglePlay();
    }
  });

  // Play / pause
  function togglePlay() {
    if (playTimer) {
      stopPlay();
    } else {
      startPlay();
    }
  }
  function startPlay() {
    if (currentBlock >= maxBlock) setBlock(minBlock);
    playBtn.textContent = '⏸ Pause';
    const interval = Math.max(60, 500 / SPEEDS[speedIndex]); // ms per advance
    playTimer = setInterval(() => {
      if (currentBlock >= maxBlock) {
        stopPlay();
        return;
      }
      setBlock(currentBlock + 1);
    }, interval);
  }
  function stopPlay() {
    if (playTimer) clearInterval(playTimer);
    playTimer = null;
    playBtn.textContent = '▶ Play';
  }
  playBtn.addEventListener('click', togglePlay);
  speedBtn.addEventListener('click', () => {
    speedIndex = (speedIndex + 1) % SPEEDS.length;
    speedBtn.textContent = `${SPEEDS[speedIndex]}×`;
    if (playTimer) { stopPlay(); startPlay(); }
  });
  stepBackBtn.addEventListener('click', () => setBlock(nextMarkerBlock(-1)));
  stepFwdBtn.addEventListener('click',  () => setBlock(nextMarkerBlock(+1)));

  host.appendChild(root);
  paint();

  return {
    destroy() {
      stopPlay();
      root.remove();
    },
    getBlock: () => currentBlock,
    setBlock,
    getMarkers: () => markers.slice(),
  };
}

/**
 * Rewind a graph's node statuses to their state at the given block.
 *
 * Pure function — no DOM. Returns a deep-cloned copy of `graph` with
 * every node's `status` rewritten to reflect what was true at
 * `playheadBlock`:
 *
 *   - status === "pending" if the step's startedAtBlock is > playheadBlock
 *     (or no startedAtBlock — the step hadn't reached its terminal state)
 *   - status === "running" if startedAtBlock <= playheadBlock < completedAtBlock
 *   - the recorded terminal status (completed / failed / skipped) if
 *     completedAtBlock <= playheadBlock
 *
 * Edges get their `state` recomputed similarly: an edge is "unlocked"
 * iff its `unlockedAtBlock <= playheadBlock`, otherwise "blocking".
 *
 * Failure overlay (`pathToFailure`) is masked: if the failure step's
 * completedAtBlock > playheadBlock the chain isn't yet visible, so
 * the returned graph clears `pathToFailure` and `failure`.
 */
export function rewindGraphToBlock(graph, playheadBlock) {
  if (!graph) return graph;
  const out = JSON.parse(JSON.stringify(graph));
  const failedStepIDs = new Set();
  for (const n of (out.nodes || [])) {
    const terminalStatus = n.status; // what it became at end of execution
    const start = n.startedAtBlock;
    const end = n.completedAtBlock;
    if (typeof start !== 'number' || typeof end !== 'number') {
      // No timing data — leave as-is (renderer treats it as "pending"-ish)
      continue;
    }
    if (playheadBlock < start) {
      n.status = 'pending';
    } else if (playheadBlock < end) {
      n.status = 'running';
    } else {
      n.status = terminalStatus;
      if (terminalStatus === 'failed') failedStepIDs.add(n.id);
    }
  }
  for (const e of (out.edges || [])) {
    const ub = e.unlockedAtBlock;
    if (typeof ub === 'number') {
      e.state = (playheadBlock >= ub) ? 'unlocked' : 'blocking';
    }
  }
  // Mask failure overlay when the failure hasn't happened yet.
  if (out.failure && out.failure.failedStepId) {
    if (!failedStepIDs.has(out.failure.failedStepId)) {
      out.failure = null;
      out.pathToFailure = [];
    }
  }
  return out;
}
