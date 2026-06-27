// RUNBOOK-07 SP5 — reverse authority query ("who can touch this?").
//
// Standalone surface at #/govern/who-can-touch (handled inside the govern view)
// AND embeddable inside an Atlas drawer. Given any account/object it lists every
// actor, role, capability, and policy that can act on it, risk-ranked. The index
// is the pure authorityIndex built over the already-fetched governAtlas; a
// redacted authority path shows as a `hidden` row, never dropped.

import { buildAuthorityIndex, queryWhoCanTouch, rowSeverity } from '/lib/authorityIndex.js';
import { severityBadge } from '/lib/severity.js';
import { hiddenNode } from '/lib/states.js';

/**
 * mountReverseQuery(host, { atlas, seedTarget }) — build the index from the atlas
 * and render the search input + results table into `host`.
 */
export function mountReverseQuery(host, { atlas, seedTarget } = {}) {
  const index = buildAuthorityIndex(atlas || {});
  host.replaceChildren();

  const wrap = document.createElement('section');
  wrap.className = 'reverse-query';

  const head = document.createElement('div');
  head.className = 'reverse-query-head';
  const h = document.createElement('h3');
  h.textContent = 'Who can touch this?';
  head.appendChild(h);
  const note = document.createElement('p');
  note.className = 'reverse-query-note';
  note.textContent = 'Enter an account or object URL to see every actor, role, capability, and policy that can act on it — risk-ranked.';
  head.appendChild(note);
  wrap.appendChild(head);

  const form = document.createElement('div');
  form.className = 'reverse-query-form';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'reverse-query-input';
  input.placeholder = 'acc://example.acme/tokens';
  if (seedTarget) input.value = seedTarget;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'reverse-query-btn verify-btn';
  btn.textContent = 'Find';
  form.append(input, btn);
  wrap.appendChild(form);

  const out = document.createElement('div');
  out.className = 'reverse-query-out';
  wrap.appendChild(out);

  function run() {
    const target = input.value.trim();
    if (!target) { out.replaceChildren(plain('Enter a target to search.')); return; }
    const { rows, empty } = queryWhoCanTouch(index, target);
    if (empty) {
      out.replaceChildren(plain(`Nothing in this atlas can act on ${target}.`));
      return;
    }
    out.replaceChildren(renderTable(rows, target));
  }

  btn.addEventListener('click', run);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  if (seedTarget) run();

  host.appendChild(wrap);
  return { element: wrap, run };
}

function renderTable(rows, target) {
  const wrap = document.createElement('div');
  const cap = document.createElement('p');
  cap.className = 'reverse-query-summary';
  cap.textContent = `${rows.length} authority path${rows.length === 1 ? '' : 's'} can act on ${target}.`;
  wrap.appendChild(cap);

  const table = document.createElement('table');
  table.className = 'reverse-query-table';
  const thead = document.createElement('thead');
  thead.innerHTML = '<tr><th>Risk</th><th>Kind</th><th>Who / what</th><th>Why</th><th>State</th><th></th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.className = 'reverse-query-row' + (r.hidden ? ' is-hidden' : '');

    const risk = document.createElement('td');
    risk.appendChild(severityBadge(rowSeverity(r)));
    tr.appendChild(risk);

    tr.appendChild(td(r.kind));

    if (r.hidden) {
      const who = document.createElement('td');
      who.colSpan = 3;
      who.appendChild(hiddenNode('an authority path exists but is redacted by disclosure'));
      tr.appendChild(who);
    } else {
      tr.appendChild(td(r.label || r.id || '—'));
      tr.appendChild(td(r.why || ''));
      tr.appendChild(td(stateText(r)));
    }

    const open = document.createElement('td');
    if (!r.hidden && r.id) {
      const a = document.createElement('a');
      a.className = 'reverse-query-open';
      a.href = '#/govern/' + pluralKind(r.kind) + '/' + encodeURIComponent(r.id);
      a.textContent = 'Open →';
      open.appendChild(a);
    }
    tr.appendChild(open);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function stateText(r) {
  if (r.kind === 'capability') return r.expiryState || 'active';
  if (r.kind === 'policy') return r.state || '—';
  if (r.kind === 'role') return `${r.holders || 0} holder${r.holders === 1 ? '' : 's'}`;
  return '—';
}
function pluralKind(kind) {
  return ({ capability: 'capabilities', policy: 'policies', role: 'roles', actor: 'actors' })[kind] || kind;
}
function td(text) { const el = document.createElement('td'); el.textContent = String(text); return el; }
function plain(text) { const p = document.createElement('p'); p.className = 'reverse-query-empty'; p.textContent = text; return p; }

// The standalone route module shape (govern handles the actual #/govern/who-can-
// touch subpath; this export lets app/router treat it uniformly if ever routed
// at top level).
export const reverseQueryView = {
  async mount(root) {
    root.replaceChildren();
    const shell = document.createElement('div');
    shell.className = 'workspace';
    root.appendChild(shell);
    const { rpcWithDisclosure } = await import('/lib/spineCommon.js');
    try {
      const atlas = await rpcWithDisclosure('nexus.governAtlas', { limit: 500 });
      mountReverseQuery(shell, { atlas });
    } catch (e) {
      const { errorStateNode } = await import('/lib/states.js');
      shell.appendChild(errorStateNode(e));
    }
  },
};
