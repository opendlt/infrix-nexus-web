// Nexus — header controllers (universal search + theme switcher).
//
// NEXUS-REDESIGN-PLAN-2026-05-09 Phase 6: wires the header search
// box to the explorer.search RPC with debounced auto-complete +
// keyboard navigation, and the theme dropdown to a localStorage-
// persisted [data-theme] attribute on <html>.

import { rpcWithDisclosure, shortHash, DISCLOSURE, setDisclosure } from '/lib/spineCommon.js';
import { subscribe } from '/lib/spineBus.js';
import { toggleCommandPalette, toggleShortcutHelp } from '/lib/commandPalette.js';
import { startHeaderInboxBadge } from '/lib/cockpitRails.js';
import { mountTimeSelector, mountTimeBanner } from '/lib/timeSelector.js';

const THEME_KEY = 'nexus.theme';
const THEMES = ['light', 'dark', 'contrast'];

const MODE_KEY = 'nexus.mode';
const MODES = ['guided', 'expert'];

/** Initialise the header controllers. Call once on DOMContentLoaded. */
export function initHeader() {
  initSearch();
  initTheme();
  initMode();
  initPulse();
  initDisclosure();
  initShortcuts();
  initWorkspaceNav();
  initBlockHeight();
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
    start:    'start',
    spine:    'spine',
    live:     'spine',
    inspect:  'spine',
    intents:  'spine',
    plans:    'spine',
    outcomes: 'spine',
    evidence: 'spine',
    anchors:  'spine',
    compose:  'compose',
    approve:  'compose',  // approval dossier sits adjacent to Build
    execute:  'spine',    // execution cinema is a lens on the spine
    govern:   'govern',
    approvals:'govern',
    policies: 'govern',
    trust:    'govern',
    plugins:  'govern',
    capabilities: 'govern',
    roles:    'govern',
    // RUNBOOK-01 IA: Console / Agent / Scenarios are no longer nav doors (they
    // live in the command palette). Paint the nearest surviving door (Cockpit)
    // when viewing them so no dangling workspace id is referenced.
    operate:  'spine',
    subsystems: 'spine',
    network:  'spine',
    prove:    'prove',
    verify:   'prove',
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

  // Paint the current (possibly switched) context immediately so every
  // view — not just the cockpit — shows the acting identity.
  actorEl.textContent = shortHash(DISCLOSURE.actor, 12, 8) || DISCLOSURE.actor;
  actorEl.title = DISCLOSURE.actor;
  purposeEl.textContent = DISCLOSURE.purpose;

  try {
    const { subscribe2 } = await import('/lib/store.js');
    subscribe2('cockpit', (slice) => {
      if (!slice || slice.status !== 'visible' || !slice.data) return;
      const ctx = slice.data.disclosureContext || {};
      if (ctx.actor) { actorEl.textContent = shortHash(ctx.actor, 12, 8) || ctx.actor; actorEl.title = ctx.actor; }
      if (ctx.purpose) purposeEl.textContent = ctx.purpose;
    });
  } catch (e) {
    // Store import unavailable — silently keep the immediate paint.
  }

  // Identity switcher popover.
  const btn = document.getElementById('headerDisclosure');
  const pop = document.getElementById('disclosurePopover');
  const actorIn = document.getElementById('disclosureActorInput');
  const purposeIn = document.getElementById('disclosurePurposeInput');
  const apply = document.getElementById('disclosureApply');
  if (!btn || !pop || !actorIn || !purposeIn || !apply) return;
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    actorIn.value = DISCLOSURE.actor;
    purposeIn.value = DISCLOSURE.purpose;
    togglePopover(pop, btn);
  });
  const commit = () => {
    setDisclosure(actorIn.value, purposeIn.value);
    closePopover(pop, btn);
    // Reload so every already-rendered view re-fetches under the new
    // acting identity + purpose.
    window.location.reload();
  };
  apply.addEventListener('click', commit);
  purposeIn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); });
  actorIn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commit(); });
}

// Block-height meter — polls the node's operate-health so the header
// "Block N" badge tracks the live Infrix block height instead of showing
// a perpetual "-". Reads use the current disclosure context; if the
// acting identity lacks explorer:view the badge keeps its last value.
function initBlockHeight() {
  const el = document.getElementById('headerBlockHeight');
  if (!el) return;
  const poll = async () => {
    try {
      const h = await rpcWithDisclosure('nexus.operateHealth', {});
      const bh = h && h.network ? h.network.blockHeight : undefined;
      if (bh !== undefined && bh !== null) el.textContent = String(bh);
    } catch (_) {
      // Keep the last painted value on a transient/denied read.
    }
  };
  poll();
  setInterval(poll, 8000);
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
      // RUNBOOK-01 IA: chords point at the six canonical doors + Console.
      // g·l → Cockpit (was #/live redirect), g·i → Inbox (was #/inspect),
      // g·b and g·c → Build, g·s → Start.
      switch (ev.key) {
        case 's': window.location.hash = '#/start'; ev.preventDefault(); break;
        case 'l': window.location.hash = '#/spine'; ev.preventDefault(); break;
        case 'i': window.location.hash = '#/inbox'; ev.preventDefault(); break;
        case 'o': window.location.hash = '#/operate'; ev.preventDefault(); break;
        case 'b': window.location.hash = '#/compose'; ev.preventDefault(); break;
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
  // Aurora-Dark is the default; respects an existing localStorage choice.
  let saved = 'dark';
  try { saved = localStorage.getItem(THEME_KEY) || 'dark'; } catch (_) { saved = 'dark'; }
  applyTheme(saved);

  // Compact palette icon → popover of theme options (reclaims the header
  // row the old full-width <select> consumed).
  const btn = document.getElementById('themeButton');
  const pop = document.getElementById('themePopover');
  if (!btn || !pop) return;
  const options = pop.querySelectorAll('.theme-option');
  const paint = (v) => options.forEach((o) => o.classList.toggle('active', o.dataset.theme === v));
  paint(saved);
  btn.addEventListener('click', (ev) => { ev.stopPropagation(); togglePopover(pop, btn); });
  options.forEach((o) => {
    o.addEventListener('click', () => {
      const v = o.dataset.theme;
      if (!THEMES.includes(v)) return;
      applyTheme(v);
      try { localStorage.setItem(THEME_KEY, v); } catch (_) { /* private mode */ }
      paint(v);
      closePopover(pop, btn);
    });
  });
}

// -----------------------------------------------------------------
// Popover helper (theme palette + identity switcher)
// -----------------------------------------------------------------
let openPopoverEl = null;
let openPopoverBtn = null;
function closePopover(pop, btn) {
  if (!pop) return;
  pop.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
  if (openPopoverEl === pop) { openPopoverEl = null; openPopoverBtn = null; }
}
function togglePopover(pop, btn) {
  if (!pop) return;
  if (!pop.hidden) { closePopover(pop, btn); return; }
  // Close any other open popover first.
  if (openPopoverEl && openPopoverEl !== pop) closePopover(openPopoverEl, openPopoverBtn);
  pop.hidden = false;
  if (btn) btn.setAttribute('aria-expanded', 'true');
  openPopoverEl = pop; openPopoverBtn = btn;
  // Dismiss on outside click / Escape.
  if (!togglePopover._wired) {
    document.addEventListener('click', (ev) => {
      if (!openPopoverEl) return;
      const wrap = openPopoverEl.parentElement;
      if (wrap && !wrap.contains(ev.target)) closePopover(openPopoverEl, openPopoverBtn);
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && openPopoverEl) closePopover(openPopoverEl, openPopoverBtn);
    });
    togglePopover._wired = true;
  }
}

function applyTheme(theme) {
  if (!THEMES.includes(theme)) theme = 'light';
  document.documentElement.dataset.theme = theme;
}

// -----------------------------------------------------------------
// Guided | Expert mode toggle (adoption-04)
// -----------------------------------------------------------------
// Mirrors the theme switcher: a localStorage-persisted [data-mode] attribute
// on <html>. Guided is the default for new users; Expert is always available
// and never hidden. The toggle sends the user to that mode's home (#/start vs
// #/spine) but every direct expert URL keeps working regardless of mode.
function initMode() {
  const toggle = document.getElementById('headerModeToggle');
  let saved = 'guided';
  try { saved = localStorage.getItem(MODE_KEY) || 'guided'; } catch (_) { saved = 'guided'; }
  if (!MODES.includes(saved)) saved = 'guided';
  applyMode(saved);
  if (!toggle) return;
  const btns = toggle.querySelectorAll('[data-mode]');
  paintMode(btns, saved);
  btns.forEach((b) => {
    b.addEventListener('click', () => {
      const v = b.dataset.mode;
      if (!MODES.includes(v)) return;
      applyMode(v);
      try { localStorage.setItem(MODE_KEY, v); } catch (_) { /* private mode */ }
      paintMode(btns, v);
      const home = v === 'expert' ? '#/spine' : '#/start';
      if (window.location.hash !== home) window.location.hash = home;
    });
  });
}

function applyMode(mode) {
  if (!MODES.includes(mode)) mode = 'guided';
  document.documentElement.dataset.mode = mode;
}

function paintMode(btns, mode) {
  btns.forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
