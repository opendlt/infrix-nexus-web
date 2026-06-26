// Nexus — command palette.
//
// NEXUS-REIMAGINED-2026-05-10 Phase 8 — Product Polish.
//
// Cmd/Ctrl+K opens a modal palette that surfaces:
//   - quick-jump destinations: the six nav doors (Start / Build / Verify /
//     Cockpit / Govern / Inbox) PLUS the folded-out long tail (Console /
//     Agent / Scenarios / Learn / Quests / Tutor / Approvals). After RUNBOOK-01
//     IA consolidation the palette is the ONLY discovery path for the long tail
//     — global search (below) returns chain objects, not workspaces — so every
//     workspace must appear here or it becomes URL-only.
//   - Live results from explorer.search (any matching intent / plan /
//     evidence / anchor / policy / role / capability / trust profile /
//     plugin)
//
// Keyboard model:
//   ↑ / ↓        Navigate the result list
//   Enter        Activate the focused result
//   Esc          Close the palette
//   Tab          Move focus into / out of the palette
//
// The palette is portable: the host (header.js) wires the keyboard
// shortcut and creates the palette singleton on demand. The palette
// itself owns its DOM; it appends to <body> on open and removes on
// close.

import { rpcWithDisclosure, shortHash } from '/lib/spineCommon.js';

const QUICK_JUMPS = [
  // The six canonical nav doors (RUNBOOK-01 IA).
  { id: 'qj.start',     label: 'Start',     hint: 'New here? Pick a task or learn the concepts', hash: '#/start' },
  { id: 'qj.compose',   label: 'Build',     hint: 'Compose a new intent — guided form or raw JSON', hash: '#/compose' },
  { id: 'qj.prove',     label: 'Verify',    hint: 'Drop a proof file or open a bundle to verify it', hash: '#/prove' },
  { id: 'qj.cockpit',   label: 'Cockpit',   hint: 'What needs your attention right now', hash: '#/spine' },
  { id: 'qj.govern',    label: 'Govern',    hint: 'Actors, roles, capabilities, policies, trust', hash: '#/govern' },
  { id: 'qj.inbox',     label: 'Inbox',     hint: 'Approvals, assigned, mentions, handoffs, drafts, proofs', hash: '#/inbox' },
  // Folded-out doors — the palette is now their only discovery path.
  { id: 'qj.operate',   label: 'Console',   hint: 'System health + governed action templates', hash: '#/operate' },
  { id: 'qj.agent',     label: 'Agent',     hint: 'What an AI agent can do, and approve what it will do', hash: '#/agent' },
  { id: 'qj.scenarios', label: 'Scenarios', hint: 'Build, run, and share a verifiable proof story', hash: '#/scenarios' },
  { id: 'qj.tasks',     label: 'Tasks',     hint: 'Signed, ready-to-run task templates', hash: '#/tasks' },
  { id: 'qj.identity',  label: 'Identity',  hint: 'Wallet, identity, signing queue, sessions, permissions', hash: '#/identity' },
  // Learning surfaces reachable from Start, also jumpable here.
  { id: 'qj.learn',     label: 'Learn',     hint: 'The six concepts, as you-go panels', hash: '#/learn' },
  { id: 'qj.quests',    label: 'Quests',    hint: 'Guided proof missions', hash: '#/quests' },
  { id: 'qj.tutor',     label: 'Tutor',     hint: 'Explain a proof — what it can and cannot claim', hash: '#/tutor' },
  // Approvals lane — the discoverable entry to the per-item approval dossier (J3).
  { id: 'qj.approvals', label: 'Approvals', hint: 'Review and sign pending approvals', hash: '#/inbox/approvals' },
];

let paletteEl = null;
let inputEl = null;
let resultsEl = null;
let activeIndex = 0;
let lastResults = [];
let debounceTimer = null;

/** Toggle the palette open/closed. Mounted lazily on first call. */
export function toggleCommandPalette() {
  if (paletteEl && document.body.contains(paletteEl)) {
    closeCommandPalette();
    return;
  }
  openCommandPalette();
}

export function openCommandPalette() {
  if (!paletteEl) buildPalette();
  if (!document.body.contains(paletteEl)) document.body.appendChild(paletteEl);
  paletteEl.classList.add('open');
  inputEl.value = '';
  activeIndex = 0;
  renderResults('');
  setTimeout(() => inputEl.focus(), 10);
  document.addEventListener('keydown', onGlobalKeyDown);
}

export function closeCommandPalette() {
  if (!paletteEl) return;
  paletteEl.classList.remove('open');
  if (paletteEl.parentNode) paletteEl.parentNode.removeChild(paletteEl);
  document.removeEventListener('keydown', onGlobalKeyDown);
}

function onGlobalKeyDown(ev) {
  if (ev.key === 'Escape') {
    ev.preventDefault();
    closeCommandPalette();
  } else if (ev.key === 'ArrowDown') {
    ev.preventDefault();
    activeIndex = Math.min(activeIndex + 1, lastResults.length - 1);
    highlight();
  } else if (ev.key === 'ArrowUp') {
    ev.preventDefault();
    activeIndex = Math.max(activeIndex - 1, 0);
    highlight();
  } else if (ev.key === 'Enter') {
    ev.preventDefault();
    const r = lastResults[activeIndex];
    if (r) activate(r);
  }
}

function buildPalette() {
  paletteEl = document.createElement('div');
  paletteEl.className = 'command-palette';
  paletteEl.setAttribute('role', 'dialog');
  paletteEl.setAttribute('aria-modal', 'true');
  paletteEl.setAttribute('aria-label', 'Command palette');

  // Backdrop
  const bg = document.createElement('div');
  bg.className = 'command-palette-bg';
  bg.addEventListener('click', closeCommandPalette);
  paletteEl.appendChild(bg);

  // Modal
  const modal = document.createElement('div');
  modal.className = 'command-palette-modal';
  paletteEl.appendChild(modal);

  inputEl = document.createElement('input');
  inputEl.className = 'command-palette-input';
  inputEl.type = 'text';
  inputEl.placeholder = 'Type to search — or jump to a workspace…';
  inputEl.spellcheck = false;
  inputEl.autocomplete = 'off';
  inputEl.setAttribute('aria-label', 'Command palette query');
  modal.appendChild(inputEl);

  resultsEl = document.createElement('div');
  resultsEl.className = 'command-palette-results';
  resultsEl.setAttribute('role', 'listbox');
  modal.appendChild(resultsEl);

  const footer = document.createElement('div');
  footer.className = 'command-palette-footer';
  footer.innerHTML = '<span class="mono">↑↓</span> navigate · <span class="mono">enter</span> activate · <span class="mono">esc</span> close';
  modal.appendChild(footer);

  inputEl.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    const q = inputEl.value.trim();
    debounceTimer = setTimeout(() => renderResults(q), 150);
  });
}

async function renderResults(q) {
  if (!resultsEl) return;
  resultsEl.replaceChildren();
  // Quick-jumps always present, filtered by the query if non-empty.
  const jumpRows = QUICK_JUMPS.filter((j) => !q || j.label.toLowerCase().includes(q.toLowerCase()));
  // Search results — only when query is non-empty.
  let searchRows = [];
  if (q) {
    try {
      const r = await rpcWithDisclosure('explorer.search', { query: q, limit: 12 });
      searchRows = (r && r.hits ? r.hits : []).map((h) => ({
        id:    'search:' + (h.id || h.title || ''),
        kind:  h.kind || 'result',
        label: h.title || h.id || '',
        hint:  h.detail || '',
        hash:  h.route ? `#/${h.route}/${encodeURIComponent(h.id || '')}` : '',
      }));
    } catch (e) { /* ignore palette search failures */ }
  }
  lastResults = [...jumpRows, ...searchRows];
  activeIndex = 0;

  if (lastResults.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'command-palette-empty';
    empty.textContent = q ? 'No matches.' : 'Type to search, or use the quick-jumps above.';
    resultsEl.appendChild(empty);
    return;
  }

  // Group: Jumps first, then search results
  if (jumpRows.length > 0) {
    appendGroup(resultsEl, 'Jump to', jumpRows.map((r) => Object.assign({ kind: 'jump' }, r)), 0);
  }
  if (searchRows.length > 0) {
    appendGroup(resultsEl, 'Search results', searchRows, jumpRows.length);
  }
  highlight();
}

function appendGroup(host, title, rows, indexOffset) {
  const head = document.createElement('div');
  head.className = 'command-palette-group';
  head.textContent = title;
  host.appendChild(head);
  rows.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'command-palette-row';
    row.setAttribute('role', 'option');
    row.dataset.idx = String(indexOffset + i);
    const lbl = document.createElement('div');
    lbl.className = 'command-palette-row-label';
    lbl.textContent = r.label || r.id || '';
    row.appendChild(lbl);
    if (r.hint) {
      const hint = document.createElement('div');
      hint.className = 'command-palette-row-hint';
      hint.textContent = r.kind ? `${r.kind} · ${r.hint}` : r.hint;
      row.appendChild(hint);
    }
    row.addEventListener('click', () => activate(r));
    host.appendChild(row);
  });
}

function highlight() {
  const rows = resultsEl.querySelectorAll('.command-palette-row');
  rows.forEach((r, i) => r.classList.toggle('active', i === activeIndex));
  if (rows[activeIndex]) rows[activeIndex].scrollIntoView({ block: 'nearest' });
}

function activate(r) {
  if (!r || !r.hash) {
    closeCommandPalette();
    return;
  }
  window.location.hash = r.hash;
  closeCommandPalette();
}

// =================================================================
// Shortcut help modal (Shift+? / `?`)
// =================================================================
let helpEl = null;

export function toggleShortcutHelp() {
  if (helpEl && document.body.contains(helpEl)) {
    closeShortcutHelp();
    return;
  }
  openShortcutHelp();
}

export function openShortcutHelp() {
  if (!helpEl) buildShortcutHelp();
  if (!document.body.contains(helpEl)) document.body.appendChild(helpEl);
  helpEl.classList.add('open');
  document.addEventListener('keydown', onHelpKeyDown);
}

export function closeShortcutHelp() {
  if (!helpEl) return;
  helpEl.classList.remove('open');
  if (helpEl.parentNode) helpEl.parentNode.removeChild(helpEl);
  document.removeEventListener('keydown', onHelpKeyDown);
}

function onHelpKeyDown(ev) {
  if (ev.key === 'Escape') {
    ev.preventDefault();
    closeShortcutHelp();
  }
}

function buildShortcutHelp() {
  helpEl = document.createElement('div');
  helpEl.className = 'shortcut-help';
  helpEl.setAttribute('role', 'dialog');
  helpEl.setAttribute('aria-modal', 'true');
  helpEl.setAttribute('aria-label', 'Keyboard shortcuts');

  const bg = document.createElement('div');
  bg.className = 'shortcut-help-bg';
  bg.addEventListener('click', closeShortcutHelp);
  helpEl.appendChild(bg);

  const modal = document.createElement('div');
  modal.className = 'shortcut-help-modal';
  helpEl.appendChild(modal);

  const title = document.createElement('h3');
  title.className = 'shortcut-help-title';
  title.textContent = 'Keyboard shortcuts';
  modal.appendChild(title);

  const list = document.createElement('div');
  list.className = 'shortcut-help-list';
  for (const [k, v] of [
    ['/',           'Focus the search box in the header'],
    ['Cmd/Ctrl+K',  'Open command palette'],
    ['?',           'Show keyboard shortcuts (this dialog)'],
    ['Esc',         'Close any modal / drawer'],
    ['g · s',       'Go to Start'],
    ['g · b',       'Go to Build (new action)'],
    ['g · p',       'Go to Verify'],
    ['g · l',       'Go to Cockpit'],
    ['g · a',       'Go to Govern (authority)'],
    ['g · i',       'Go to Inbox'],
    ['g · o',       'Go to Console (operations)'],
  ]) {
    const row = document.createElement('div');
    row.className = 'shortcut-help-row';
    const key = document.createElement('span');
    key.className = 'shortcut-help-key mono';
    key.textContent = k;
    row.appendChild(key);
    const desc = document.createElement('span');
    desc.className = 'shortcut-help-desc';
    desc.textContent = v;
    row.appendChild(desc);
    list.appendChild(row);
  }
  modal.appendChild(list);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'verify-btn shortcut-help-close';
  close.textContent = 'Close';
  close.addEventListener('click', closeShortcutHelp);
  modal.appendChild(close);
}
