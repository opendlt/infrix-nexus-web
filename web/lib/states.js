// Nexus — distinct state components.
//
// Phase 0 calls for five visually distinct state nodes so the user
// can tell:
//   loading      — the data is in flight; come back in a moment
//   visible      — (no special state node; render the data)
//   hidden       — the data exists but disclosure policy redacts it
//   notProduced  — the artifact does not yet exist (upstream stage
//                  hasn't run)
//   unavailable  — the backend cannot retrieve it (e.g. RPC offline)
//   error        — a transient failure occurred
//
// Each node has its own visual treatment so the user immediately
// understands which case they are looking at.

const ICONS = {
  loading:     '⏳',
  hidden:      '◆',
  notProduced: '○',
  unavailable: '⚠',
  error:       '✕',
};

function makeStateNode(kind, label, detail) {
  const wrap = document.createElement('div');
  wrap.className = `state-node state-${kind}`;
  const icon = document.createElement('span');
  icon.className = 'state-icon';
  icon.textContent = ICONS[kind] || '·';
  wrap.appendChild(icon);
  const txt = document.createElement('div');
  txt.className = 'state-text';
  const lbl = document.createElement('div');
  lbl.className = 'state-label';
  lbl.textContent = label;
  txt.appendChild(lbl);
  if (detail) {
    const det = document.createElement('div');
    det.className = 'state-detail';
    det.textContent = detail;
    txt.appendChild(det);
  }
  wrap.appendChild(txt);
  if (kind === 'loading') {
    const spinner = document.createElement('span');
    spinner.className = 'state-spinner';
    wrap.appendChild(spinner);
  }
  return wrap;
}

/** Loading — the artifact is being fetched. */
export function loadingNode(label = 'Loading…', detail = '') {
  return makeStateNode('loading', label, detail);
}

/** Hidden by disclosure — the artifact exists but the actor lacks visibility. */
export function hiddenNode(reason = 'Hidden by disclosure policy', detail = 'The current actor + purpose context does not grant visibility into this section.') {
  return makeStateNode('hidden', reason, detail);
}

/** Not produced — the artifact does not yet exist (upstream stage hasn't run). */
export function notProducedNode(label = 'Not yet produced', detail = '') {
  return makeStateNode('notProduced', label, detail);
}

/** Unavailable — the backend can't retrieve it. Reason explains why. */
export function unavailableNode(reason = 'Backend unavailable', detail = '') {
  return makeStateNode('unavailable', reason, detail);
}

/** Error — transient failure. Renders the structured UserError (title / impact /
 * fixes / docs) when the server translated it (err.userError, attached by rpc.js
 * via parseUserError — RUNBOOK-03 Task 7); falls back to the plain message
 * otherwise. Never shows a raw -32xxx JSON-RPC string. */
export function errorStateNode(err) {
  const ue = err && err.userError ? err.userError : null;
  if (ue) {
    const wrap = makeStateNode('error', ue.title || 'Error', ue.impact || ue.message || '');
    if (Array.isArray(ue.fixes) && ue.fixes.length) {
      const ul = document.createElement('ul');
      ul.className = 'state-fixes';
      for (const f of ue.fixes) {
        const li = document.createElement('li');
        li.textContent = f.command ? `${f.label} — ${f.command}` : f.label;
        ul.appendChild(li);
      }
      wrap.appendChild(ul);
    }
    if (ue.docs) {
      const a = document.createElement('a');
      a.className = 'state-docs';
      a.href = ue.docs;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Docs';
      wrap.appendChild(a);
    }
    return wrap;
  }
  const msg = err && err.message ? err.message : (typeof err === 'string' ? err : 'Unknown error');
  return makeStateNode('error', 'Error', msg);
}

/** Polymorphic dispatch from a slice envelope { status, ... } */
export function renderSliceState(slice, opts = {}) {
  if (!slice) return loadingNode();
  switch (slice.status) {
    case 'loading':     return loadingNode(opts.loadingLabel || 'Loading…');
    case 'hidden':      return hiddenNode(slice.reason || 'Hidden by disclosure policy', opts.hiddenDetail);
    case 'notProduced': return notProducedNode(opts.notProducedLabel || 'Not yet produced', slice.reason || opts.notProducedDetail || '');
    case 'unavailable': return unavailableNode(slice.reason || 'Backend unavailable', opts.unavailableDetail || '');
    case 'error':       return errorStateNode(slice.error);
    default:            return loadingNode();
  }
}
