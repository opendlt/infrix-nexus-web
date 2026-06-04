// Cinema-Inbox-Time E3C4 — explorer-wide time-travel context.
//
// One source of truth for the `at` coordinate the rest of the SPA
// passes to every nexus.* RPC. Keeps the URL in sync via a `?at=…`
// query string parameter so refreshes / link-sharing preserve the
// historical lens.
//
// Wire shape (mirrors the backend `atCoordinate` in pkg/devnet):
//   { version: 7 }                       — exact version snapshot
//   { block: 1234 }                       — at the end of block 1234
//   { time: "2026-05-10T12:34:56.789Z" } — most-recent <= that time
//   null                                  — live read against the present
//
// URL serialisation:
//   ?at=block:1234
//   ?at=time:2026-05-10T12:34:56Z
//   ?at=version:7
//   (absent param → live)
//
// Subscribe with onAtChange(fn) — receives the resolved coordinate
// every time the user picks a new point in time.

const ATTR = '?at=';
const KEYS = ['version', 'block', 'time'];

const listeners = new Set();
let currentAt = null;

/** Returns the current at-coordinate or null when the cursor is live. */
export function getAt() {
  return currentAt ? { ...currentAt } : null;
}

/** Returns true when the cursor is anchored to a non-live point. */
export function isAtLive() {
  if (!currentAt) return true;
  return !KEYS.some((k) => currentAt[k] !== undefined && currentAt[k] !== null && currentAt[k] !== '');
}

/**
 * Update the at-coordinate + push the URL. Pass null to clear and
 * return to live mode. Notifies subscribers if the value changed.
 */
export function setAt(at) {
  const normalised = normalise(at);
  if (sameCoord(currentAt, normalised)) return;
  currentAt = normalised;
  syncUrl();
  for (const fn of listeners) {
    try { fn(getAt()); } catch (_) { /* listener errors are not fatal */ }
  }
}

/** Subscribe to at-coordinate changes. Returns an unsubscribe handle. */
export function onAtChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Merge the current at-coordinate into a params payload destined for
 * rpcWithDisclosure. Callers that want every RPC to honour the cursor
 * can wrap their calls in withAt({ ...params }) to pick it up
 * automatically.
 */
export function withAt(params = {}) {
  const at = getAt();
  if (!at) return params;
  return { ...params, at };
}

/** Bootstrap from the current URL — call once at app startup. */
export function initTimeContext() {
  currentAt = readFromUrl();
  // Re-read whenever the user navigates back/forward — hash changes
  // alone are SPA-internal but the user can also edit the URL bar.
  window.addEventListener('popstate', () => {
    const next = readFromUrl();
    if (!sameCoord(currentAt, next)) {
      currentAt = next;
      for (const fn of listeners) {
        try { fn(getAt()); } catch (_) {}
      }
    }
  });
}

// =================================================================
// Internals
// =================================================================
function readFromUrl() {
  const sp = new URL(window.location.href).searchParams;
  const raw = sp.get('at');
  if (!raw) return null;
  // Format: <kind>:<value>
  const i = raw.indexOf(':');
  if (i <= 0) return null;
  const kind = raw.slice(0, i);
  const value = raw.slice(i + 1);
  if (!KEYS.includes(kind)) return null;
  if (kind === 'version' || kind === 'block') {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return { [kind]: n };
  }
  return { time: value };
}

function syncUrl() {
  const url = new URL(window.location.href);
  if (!currentAt) {
    url.searchParams.delete('at');
  } else if (currentAt.version) {
    url.searchParams.set('at', 'version:' + currentAt.version);
  } else if (currentAt.block) {
    url.searchParams.set('at', 'block:' + currentAt.block);
  } else if (currentAt.time) {
    url.searchParams.set('at', 'time:' + currentAt.time);
  } else {
    url.searchParams.delete('at');
  }
  // Use replaceState so we don't add to the back stack on every drag
  // of the time slider — the at-coordinate is more like a filter than
  // a route segment.
  window.history.replaceState(window.history.state, '', url.toString());
}

function normalise(at) {
  if (!at) return null;
  if (typeof at !== 'object') return null;
  let out = null;
  if (at.version !== undefined && at.version !== null && at.version !== '') {
    const n = Number(at.version);
    if (Number.isFinite(n) && n > 0) out = { version: n };
  } else if (at.block !== undefined && at.block !== null && at.block !== '') {
    const n = Number(at.block);
    if (Number.isFinite(n) && n > 0) out = { block: n };
  } else if (at.time) {
    // Validate by parsing — invalid date → null.
    const d = new Date(at.time);
    if (!isNaN(d.getTime())) out = { time: d.toISOString() };
  }
  return out;
}

function sameCoord(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (a.version || 0) === (b.version || 0) &&
         (a.block || 0)   === (b.block || 0) &&
         (a.time  || '')  === (b.time  || '');
}
