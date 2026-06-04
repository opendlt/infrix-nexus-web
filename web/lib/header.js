// Nexus — header controllers (universal search + theme switcher).
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 6: wires the header search
// box to the explorer.search RPC with debounced auto-complete +
// keyboard navigation, and the theme dropdown to a localStorage-
// persisted [data-theme] attribute on <html>.

import { rpcWithDisclosure, shortHash } from '/lib/spineCommon.js';
import { subscribe } from '/lib/spineBus.js';
import { toggleCommandPalette, toggleShortcutHelp } from '/lib/commandPalette.js';
import { startHeaderInboxBadge } from '/lib/cockpitRails.js';
import { mountTimeSelector, mountTimeBanner } from '/lib/timeSelector.js';

const THEME_KEY = 'nexus.theme';
const THEMES = ['light', 'dark', 'contrast'];

/** Initialise the header controllers. Call once on DOMContentLoaded. */
export function initHeader() {
  initSearch();
  initTheme();
  initPulse();
  initDisclosure();
  initShortcuts();
  initWorkspaceNav();
  // Cinema-Inbox-Time E2C6 — Inbox unread badge in the workspace nav.
  startHeaderInboxBadge({ pollMs: 15000 });
  // Cinema-Inbox-Time E3C5 — time-travel cursor + non-live banner.
  const slot = document.getElementById('headerTimeSelector');
  if (slot) mountTimeSelector(slot);
  mountTimeBanner();
}

// Workspace nav — paint the active link based on the current route.
// Re-runs on every hashchange so deep-link navigation updates the
// header in lockstep with the canvas.
function initWorkspaceNav() {
  const links = document.querySelectorAll('.workspace-link');
  if (!links.length) return;

  // Routes that resolve to each workspace. Compose has sub-paths
  // like #/compose/<goal>; we match by the first hash segment.
  const ROUTE_TO_WORKSPACE = {
    spine:    'spine',
    live:     'spine',
    inspect:  'spine',
    intents:  'spine',
    plans:    'spine',
    outcomes: 'spine',
    evidence: 'spine',
    anchors:  'spine',
    compose:  'compose',
    approve:  'compose',  // approval dossier sits adjacent to Studio
    execute:  'spine',    // execution cinema is a lens on the spine
    govern:   'govern',
    approvals:'govern',
    policies: 'govern',
    trust:    'govern',
    plugins:  'govern',
    capabilities: 'govern',
    roles:    'govern',
    operate:  'operate',
    subsystems: 'operate',
    prove:    'prove',
    verify:   'prove',
    network:  'operate',
    inbox:    'inbox',
  };

  const paint = () => {
    const h = window.location.hash.replace(/^#\/?/, '');
    const seg = (h.split('/')[0] || 'spine').toLowerCase();
    const ws = ROUTE_TO_WORKSPACE[seg] || 'spine';
    for (const a of links) {
      a.classList.toggle('active', a.dataset.workspace === ws);
    }
  };
  paint();
  window.addEventListener('hashchange', paint);
  window.addEventListener('popstate', paint);
}

// Header disclosure-context display (NEXUS-REIMAGINED Phase 1).
// Reads the cockpit slice as the source of truth for the canonical
// disclosure context the cockpit was loaded under, so the user
// always sees the actor + purpose their reads are scoped against.
async function initDisclosure() {
  const actorEl = document.getElementById('headerActor');
  const purposeEl = document.getElementById('headerPurpose');
  if (!actorEl || !purposeEl) return;
  try {
    const { subscribe2 } = await import('/lib/store.js');
    subscribe2('cockpit', (slice) => {
      if (!slice || slice.status !== 'visible' || !slice.data) return;
      const ctx = slice.data.disclosureContext || {};
      if (ctx.actor) actorEl.textContent = ctx.actor;
      if (ctx.purpose) purposeEl.textContent = ctx.purpose;
    });
  } catch (e) {
    // Store import unavailable — silently keep dashes.
  }
}

// Pulse meter — the dot flashes briefly every time the spine bus
// emits an activity event. Operators get a peripheral signal that
// the spine is alive even when they're not looking at Live mode.
function initPulse() {
  const wrap = document.getElementById('headerPulse');
  if (!wrap) return;
  const dot = wrap.querySelector('.header-pulse-dot');
  if (!dot) return;
  subscribe('*', () => {
    dot.classList.remove('flash');
    // eslint-disable-next-line no-unused-expressions
    dot.offsetWidth;
    dot.classList.add('flash');
    setTimeout(() => dot.classList.remove('flash'), 800);
  });
}

// Keyboard shortcuts: power-user navigation without touching the mouse.
//   /         focus the search box
//   g + l     go to Live
//   g + i     go to Inspect (landing if no current intent)
//   g + o     go to Operate
//   Esc       blur search / pop drawer
function initShortcuts() {
  let waitingForSecond = false;
  document.addEventListener('keydown', (ev) => {
    const inField = ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.isContentEditable);

    // NEXUS-REIMAGINED-2026-05-10 Phase 8 — Cmd/Ctrl+K opens the
    // command palette regardless of focus location.
    if ((ev.key === 'k' || ev.key === 'K') && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      toggleCommandPalette();
      return;
    }
    // ? (Shift+/) opens the keyboard-shortcut help modal.
    if (ev.key === '?' && !inField) {
      ev.preventDefault();
      toggleShortcutHelp();
      return;
    }

    if (ev.key === '/' && !inField) {
      ev.preventDefault();
      const input = document.getElementById('globalSearch');
      if (input) input.focus();
      return;
    }

    if (ev.key === 'g' && !inField) {
      ev.preventDefault();
      waitingForSecond = true;
      setTimeout(() => { waitingForSecond = false; }, 800);
      return;
    }

    if (waitingForSecond && !inField) {
      waitingForSecond = false;
      switch (ev.key) {
        case 'l': window.location.hash = '#/live'; ev.preventDefault(); break;
        case 'i': window.location.hash = '#/inspect'; ev.preventDefault(); break;
        case 'o': window.location.hash = '#/operate'; ev.preventDefault(); break;
        case 'c': window.location.hash = '#/compose'; ev.preventDefault(); break;
        case 'p': window.location.hash = '#/prove'; ev.preventDefault(); break;
        case 'a': window.location.hash = '#/govern'; ev.preventDefault(); break;
      }
    }
  });
}

// -----------------------------------------------------------------
// Search
// -----------------------------------------------------------------
function initSearch() {
  const input = document.getElementById('globalSearch');
  const out   = document.getElementById('globalSearchResults');
  if (!input || !out) return;

  let debounceTimer = null;
  let activeIndex = -1;
  let lastHits = [];

  function close() {
    out.hidden = true;
    activeIndex = -1;
  }

  function open() {
    out.hidden = false;
  }

  function render(hits) {
    lastHits = hits || [];
    out.replaceChildren();
    if (lastHits.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'header-search-empty';
      empty.textContent = 'No matches';
      out.appendChild(empty);
      open();
      return;
    }
    const grouped = new Map();
    for (const h of lastHits) {
      if (!grouped.has(h.kind)) grouped.set(h.kind, []);
      grouped.get(h.kind).push(h);
    }
    let i = 0;
    for (const [kind, items] of grouped) {
      const group = document.createElement('div');
      group.className = 'header-search-group';
      group.textContent = kind;
      out.appendChild(group);
      for (const h of items) {
        const row = document.createElement('div');
        row.className = 'header-search-row';
        row.dataset.idx = String(i++);
        const id = document.createElement('div');
        id.className = 'header-search-id';
        id.textContent = h.title || h.id;
        const det = document.createElement('div');
        det.className = 'header-search-detail';
        det.textContent = h.detail || '';
        row.appendChild(id);
        if (det.textContent) row.appendChild(det);
        row.addEventListener('click', () => navigate(h));
        out.appendChild(row);
      }
    }
    open();
  }

  function highlight(idx) {
    const rows = out.querySelectorAll('.header-search-row');
    rows.forEach((r, i) => r.classList.toggle('active', i === idx));
    if (idx >= 0 && rows[idx]) rows[idx].scrollIntoView({ block: 'nearest' });
  }

  function navigate(hit) {
    if (!hit) return;
    if (hit.route && hit.id) {
      window.location.hash = `#/${hit.route}/${encodeURIComponent(hit.id)}`;
    } else if (hit.route) {
      window.location.hash = `#/${hit.route}`;
    }
    input.value = '';
    close();
  }

  input.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    const q = input.value.trim();
    if (!q) {
      close();
      return;
    }
    debounceTimer = setTimeout(async () => {
      try {
        const r = await rpcWithDisclosure('explorer.search', { query: q, limit: 12 });
        render(r && r.hits ? r.hits : []);
      } catch (err) {
        out.replaceChildren();
        const e = document.createElement('div');
        e.className = 'header-search-empty';
        e.textContent = 'Search failed: ' + (err.message || 'unknown error');
        out.appendChild(e);
        open();
      }
    }, 180);
  });

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      if (lastHits.length === 0) return;
      activeIndex = Math.min(activeIndex + 1, lastHits.length - 1);
      highlight(activeIndex);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (lastHits.length === 0) return;
      activeIndex = Math.max(activeIndex - 1, 0);
      highlight(activeIndex);
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const hit = activeIndex >= 0 ? lastHits[activeIndex] : (lastHits[0] || null);
      if (hit) navigate(hit);
    } else if (ev.key === 'Escape') {
      close();
      input.blur();
    }
  });

  document.addEventListener('click', (ev) => {
    if (!input.contains(ev.target) && !out.contains(ev.target)) close();
  });
}

// -----------------------------------------------------------------
// Theme switcher
// -----------------------------------------------------------------
function initTheme() {
  const select = document.getElementById('themeSelect');
  // Aurora-Dark is the new default; respects an existing localStorage
  // selection if the user already picked a different theme.
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(saved);
  if (select) {
    select.value = saved;
    select.addEventListener('change', () => {
      const v = select.value;
      if (THEMES.includes(v)) {
        applyTheme(v);
        localStorage.setItem(THEME_KEY, v);
      }
    });
  }
}

function applyTheme(theme) {
  if (!THEMES.includes(theme)) theme = 'light';
  document.documentElement.dataset.theme = theme;
}
