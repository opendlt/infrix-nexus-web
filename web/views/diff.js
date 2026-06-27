// RUNBOOK-07 SP2 — temporal diff view (#/diff).
//
// Pick block A and block B → "what changed and who" between them. Snapshots are
// fetched with the explicit-`at` bypass (timeSnapshot.rpcAt) so the diff is
// immune to whatever the global cursor is frozen at. The diff itself is the pure
// temporalDiff engine. Rows are stage-ordered, severity-pilled, and deep-link.

import { fetchBoardSnapshot } from '/lib/timeSnapshot.js';
import { diffSnapshots, describeDelta, deltaSeverity } from '/lib/temporalDiff.js';
import { severityBadge } from '/lib/severity.js';
import { loadingNode, errorStateNode } from '/lib/states.js';

const STAGE_DOT = {
  intent: 1, plan: 2, approval: 3, execution: 4, outcome: 5, evidence: 6, anchor: 7,
};

function headBlock() {
  const el = typeof document !== 'undefined' && document.getElementById('headerBlockHeight');
  const n = el ? Number(String(el.textContent).replace(/[^\d]/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 100;
}

export const diffView = {
  mount(root, subpath) {
    root.replaceChildren();
    const shell = document.createElement('div');
    shell.className = 'workspace diff-canvas';
    root.appendChild(shell);

    const head = document.createElement('header');
    head.className = 'workspace-header';
    const h = document.createElement('h2');
    h.className = 'workspace-title';
    h.textContent = 'Temporal diff';
    head.appendChild(h);
    const sub = document.createElement('p');
    sub.className = 'workspace-subtitle';
    sub.textContent = 'Compare the governance board at two blocks — what changed, and who. Each change links to its story.';
    head.appendChild(sub);
    shell.appendChild(head);

    // A/B pickers, default [head-100, head]. Subpath can seed them: #/diff/A/B.
    const max = headBlock();
    const seedA = numOr(subpath && subpath[0], Math.max(1, max - 100));
    const seedB = numOr(subpath && subpath[1], max);

    const controls = document.createElement('div');
    controls.className = 'diff-controls';
    const inA = blockInput('Block A (earlier)', seedA);
    const inB = blockInput('Block B (later)', seedB);
    const useLiveA = pickBtn('Use playhead', () => { inA.input.value = String(currentPlayhead() ?? max); });
    const useLiveB = pickBtn('Use playhead', () => { inB.input.value = String(currentPlayhead() ?? max); });
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'diff-compare-btn verify-btn';
    go.textContent = 'Compare';
    controls.append(inA.wrap, useLiveA, inB.wrap, useLiveB, go);
    shell.appendChild(controls);

    const out = document.createElement('div');
    out.className = 'diff-out';
    shell.appendChild(out);

    async function compare() {
      const a = Number(inA.input.value), b = Number(inB.input.value);
      if (!Number.isFinite(a) || !Number.isFinite(b)) { out.replaceChildren(note('Enter two block numbers.')); return; }
      if (a === b) { out.replaceChildren(note('Blocks A and B are the same — no changes to show.')); return; }
      out.replaceChildren(loadingNode(`Fetching the board at block ${a} and block ${b}…`));
      try {
        const [snapA, snapB] = await Promise.all([
          fetchBoardSnapshot({ block: a }),
          fetchBoardSnapshot({ block: b }),
        ]);
        // Always diff earlier→later regardless of input order.
        const [earlier, later] = a < b ? [snapA, snapB] : [snapB, snapA];
        const deltas = diffSnapshots(earlier, later);
        out.replaceChildren(renderDeltas(deltas, a < b ? a : b, a < b ? b : a));
      } catch (e) {
        out.replaceChildren(errorStateNode(e));
      }
    }

    go.addEventListener('click', compare);
    out.replaceChildren(note('Pick two blocks and press Compare.'));
  },

  onSubpathChange() { /* pickers are user-driven; nothing to re-mount */ },
};

function renderDeltas(deltas, a, b) {
  const wrap = document.createElement('div');
  const summary = document.createElement('p');
  summary.className = 'diff-summary';
  summary.textContent = deltas.length === 0
    ? `No changes between block ${a} and block ${b}.`
    : `${deltas.length} change${deltas.length === 1 ? '' : 's'} between block ${a} and block ${b}.`;
  wrap.appendChild(summary);
  if (deltas.length === 0) return wrap;

  const list = document.createElement('ul');
  list.className = 'diff-list';
  for (const d of deltas) {
    const li = document.createElement('li');
    li.className = 'diff-row';
    const dot = document.createElement('span');
    dot.className = 'diff-stage-dot stage-dot';
    dot.dataset.stage = String(STAGE_DOT[d.stage] || 1);
    li.appendChild(dot);

    const text = document.createElement('span');
    text.className = 'diff-row-text';
    text.textContent = describeDelta(d);
    li.appendChild(text);

    li.appendChild(severityBadge(deltaSeverity(d)));

    if (d.ref) {
      const link = document.createElement('a');
      link.className = 'diff-row-link';
      link.href = d.ref;
      link.textContent = 'Open →';
      li.appendChild(link);
    }
    list.appendChild(li);
  }
  wrap.appendChild(list);
  return wrap;
}

function blockInput(label, value) {
  const wrap = document.createElement('label');
  wrap.className = 'diff-block-input';
  const span = document.createElement('span'); span.textContent = label;
  const input = document.createElement('input');
  input.type = 'number'; input.min = '1'; input.value = String(value);
  wrap.append(span, input);
  return { wrap, input };
}
function pickBtn(label, onClick) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'diff-use-playhead'; b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
function note(text) {
  const p = document.createElement('p');
  p.className = 'diff-note';
  p.textContent = text;
  return p;
}
function numOr(v, fallback) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : fallback; }

// currentPlayhead — read the frozen block from the URL `at` param (set by SP1).
function currentPlayhead() {
  try {
    const sp = new URL(window.location.href).searchParams.get('at');
    const m = sp && /^block:(\d+)$/.exec(sp);
    return m ? Number(m[1]) : null;
  } catch (_) { return null; }
}
