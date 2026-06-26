# RUNBOOK-03 — Liveness: Make It Honest, Then Real

> **Parent:** [`../nexus-ux-review-2026-06.md`](../nexus-ux-review-2026-06.md) **§4.3** ("Liveness — make it honest, then make it real"); foundational evidence in **Part 2 / P2 + P3** (review lines 51–59).
> **Roadmap:** [`RUNBOOK-00`](./RUNBOOK-00-roadmap.md) — Phase 0 items "Real connection status", "Fix narrative-cache-ignores-`at`", "Delete-or-wire the dead Activity feed + pulse"; the rest are Phase 0 fast-follow.
> **Audience:** One IC, end-to-end. No further design decisions required — every change has a file, an anchor, and the exact code.
> **Golden rule for this runbook (from the review):** *No surface may claim a liveness, freshness, or connection state it does not actually have.*

---

## Objective

The cockpit today is 100% interval polling wearing a live costume. This runbook removes the dishonesty first, then makes the underlying signal real:

1. A **real** connection light that can go red (`#statusDot` / `#statusText`).
2. **Staleness surfaced** from the `fetchedAt` we already capture but never read; transient errors **keep last-known-good** instead of wiping it.
3. A heartbeat that **beats on real data arrival**, not a fixed CSS loop.
4. **Time-cursor correctness**: the narrative panel stops lying about which point in time it shows (P3).
5. **Poll hygiene**: pause on hidden tabs / frozen time, exponential backoff with a visible retry state.
6. A **decision** on the dead event bus: revive it (so "Activity" / pulse / row-flash become real) or delete it (so nothing labelled "live" sits permanently empty).
7. **Error envelopes**: JSON-RPC failures render the same `title / impact / fixes / docs` the CLI prints, not raw `-32xxx` strings.

### Exit gate alignment

**Exit gate 0 (blocking — this runbook owns three of its line items):**
> *No surface claims liveness it doesn't have; … `go test ./...` and `node --test web/test/*.mjs` green.*

The gate-0-blocking tasks here are **Task 1** (real status), **Task 2 keep-last-known-good** (a transient failure must not erase data while the dot still implies health), **Task 4** (P3 time-cursor correctness), and **Task 6** (the dead "Activity"/pulse must be wired or removed — a blank panel labelled "live" reads as broken). Tasks 3, 5, 7 and the staleness-tagging half of Task 2 are Phase-0 fast-follow: they harden honesty but do not by themselves unblock the gate.

**Exit gate 2 (relevant parts only):** Task 4 is an explicit dependency of **SP1 — Global time scrubber** (roadmap Phase 3 §67: "depends on Phase 0 `at`-invalidation fix"). Task 3 must honor reduced-motion (gate 2: "reduced-motion honored including canvas"). Any `aria-live` region added in Task 1 must satisfy the axe pass owned by [RUNBOOK-06](./RUNBOOK-06-accessibility.md) — coordinate the exact attributes there.

---

## Verified findings (confirmed against source — cite these in the PR description)

| # | Finding | Evidence (file:line) |
|---|---------|----------------------|
| F1 | `connectLive()` is **unreachable**. Imported only at `spineFlow.js:25`, called only at `spineFlow.js:156`. `spineFlowView` is mounted only by `live.js:54`. `live` redirects to `#/spine` (`app.js:154`, `makeRedirect(() => '#/spine')`). So the bus **never publishes**. | `liveEvents.js:49`, `spineFlow.js:25,156`, `live.js:54`, `app.js:154` |
| F2 | Because nothing publishes, the store's entire event-invalidation block is **dead code**. | `store.js:272-293` |
| F3 | `statusText` is hardcoded `"Connected"`; `#statusDot` has no JS that ever adds `.disconnected`. The CSS for the red state exists but is never reached. | `index.html:67`, `styles.css:295` (`.status-dot.disconnected`) |
| F4 | `fetchedAt` is stamped on **every** slice but **read by no consumer**. | `store.js:139`; no reader (grep `fetchedAt` → only writes) |
| F5 | A transient poll error **wipes last-known-good**: `refreshSlice` overwrites the slice with `{status:'error'}`, and every rail replaces its rendered content with `errorStateNode`. | `store.js:103-106`; `cockpitRails.js:60`, `:141`, `:216` |
| F6 | The `narrative:<id>` slice has **no poll interval** (absent from `POLL_INTERVAL_MS`) and **nothing invalidates it on `at` change** — `store.js` never imports `onAtChange`. Time-travel shows stale live narrative. **(P3 correctness bug.)** | `store.js:46-50` (no narrative key), `store.js:189-192` (fetcher exists), no `onAtChange` import |
| F7 | Pollers never pause on `document.hidden` or when `!isAtLive()`. Each `runtimePulse` tick fans out to 4 RPCs; `cockpit` + `recentIntents` add more → ~7 RPCs / ~4–5s, forever, per idle tab — and re-fetches immutable historical snapshots when time-frozen. | `store.js:160` (bare `setInterval`), `header.js:156` (bare `setInterval`) |
| F8 | The heartbeat is a fixed `2.4s` CSS loop, unconnected to data. | `styles.css:3764` (`animation: heartbeat 2.4s … infinite`), `styles.css:4696` |
| F9 | `rpc.js` builds an `Error` from `data.error.message` and never calls `parseUserError`, even though `parseUserError` exists (`userError.js:58`) and `rest.js` already uses it (`rest.js:27`). The cockpit shows raw JSON-RPC strings. | `rpc.js:31-36`, `userError.js:58`, `rest.js:27` |

---

## Preconditions

- Branch off `main`. This runbook touches: `web/lib/store.js`, `web/lib/header.js`, `web/index.html`, `web/lib/cockpitRails.js`, `web/lib/telemetry.js`, `web/lib/states.js`, `web/lib/rpc.js`, `web/styles.css`, `web/views/spine.js` (Task 6 Option A only) and one **new** `web/lib/liveness.js`. Plus tests.
- Confirm the cross-cutting conventions from `RUNBOOK-00`:
  - All governed reads go through `rpcWithDisclosure` (`spineCommon.js:58`), which already injects `withAt(...)`. **Do not** add `at` plumbing in the store — the cursor is carried automatically; the store only needs to *invalidate* on change.
  - Honor the five-state vocabulary (`states.js`) — never collapse `hidden`/`notProduced`/`unavailable` into `error`.
- Decide Task 6 (A or B) **before** writing tests — the bus tests differ. Run the probe in Task 6 first.
- Baseline green: `go test ./...` and `node --test web/test/*.mjs`.

### Recommended execution order

`Task 4` (P3, smallest, unblocks SP1) → `Task 1` (status API + header) → `Task 2` (store keep-last-known-good + rail staleness) → `Task 3` (heartbeat, depends on Task 1's store tick) → `Task 5` (poll hygiene + backoff, depends on Task 1's failure counters) → `Task 6` (bus decision) → `Task 7` (error envelopes). The new pure helper `web/lib/liveness.js` is introduced in Task 1 and reused by Tasks 2 and 5.

---

## Task 1 — Real connection status  *(Phase 0 — exit-gate-0 blocking)*

**Files & anchors:**
- `web/lib/liveness.js` *(NEW — pure, DOM-free helpers shared by Tasks 1/2/5)*
- `web/lib/store.js` — failure counters + health signal API. New module state near `slices`/`inflight` (`store.js:40-51`); hook into `refreshSlice` success (`store.js:100-102`) and error (`store.js:103-106`) branches.
- `web/index.html:65-71` — the `.status-indicator` block.
- `web/lib/header.js` — call a new `initConnectionStatus()` from `initHeader()` (`header.js:21-36`).

### Step 1.1 — Create `web/lib/liveness.js`

A pure module (no `/lib/` imports, no DOM) so it is trivially Node-testable, mirroring the existing browser-twin pattern (`web/lib/app.js` ← `app_smoke.mjs`).

```js
// web/lib/liveness.js
// Pure liveness math — shared by the store (health FSM, backoff) and the
// rails (staleness). No DOM, no imports: unit-tested directly under node --test.

export const OFFLINE_THRESHOLD = 3;   // consecutive failures on a polled slice → offline
export const STALE_INTERVALS   = 3;   // a slice older than 3 intervals is "stale"

/** Roll a per-slice consecutive-failure map into one global health state. */
export function healthFromFailures(failuresByKey, offlineThreshold = OFFLINE_THRESHOLD) {
  let worst = 0;
  for (const n of failuresByKey.values()) if (n > worst) worst = n;
  if (worst >= offlineThreshold) return 'offline';
  if (worst >= 1) return 'reconnecting';
  return 'ok';
}

/** Human-friendly "updated Ns ago". `now`/`then` are epoch ms. */
export function agoLabel(then, now = Date.now()) {
  if (!then) return 'never';
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 2)    return 'just now';
  if (s < 60)   return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60)   return m + 'm ago';
  return Math.floor(m / 60) + 'h ago';
}

/** A slice is stale when its data is older than STALE_INTERVALS poll cadences. */
export function isStale(fetchedAt, intervalMs, now = Date.now()) {
  if (!fetchedAt || !intervalMs) return false;
  return (now - fetchedAt) > STALE_INTERVALS * intervalMs;
}

/** Exponential backoff: base·2^attempt, capped. 4s→8s→16s(→16s…) for attempt 0,1,2,3. */
export function nextBackoff(baseMs, attempt, capMs) {
  const d = baseMs * Math.pow(2, Math.max(0, attempt));
  return Math.min(d, capMs);
}

/** Status-line copy for each health state. */
export function healthLabel(state) {
  switch (state) {
    case 'offline':      return 'Offline';
    case 'reconnecting': return 'Reconnecting…';
    default:             return 'Connected';
  }
}
```

### Step 1.2 — Store: failure counters + health signal

In `web/lib/store.js`, add module state immediately after the maps at `store.js:40-42`:

```js
import {
  OFFLINE_THRESHOLD, healthFromFailures, healthLabel,
} from '/lib/liveness.js';

const failures = new Map();          // sliceKey → consecutive failure count
const healthSubscribers = new Set(); // handler(state)
let healthState = 'ok';              // 'ok' | 'reconnecting' | 'offline'

function recomputeHealth() {
  const next = healthFromFailures(failures, OFFLINE_THRESHOLD);
  if (next === healthState) return;
  healthState = next;
  for (const h of healthSubscribers) {
    try { h(healthState); } catch (e) { console.error('store health handler', e); }
  }
}

export function getHealth() { return healthState; }
export function getHealthLabel() { return healthLabel(healthState); }
export function subscribeHealth(handler) {
  healthSubscribers.add(handler);
  try { handler(healthState); } catch (e) { console.error('store health init', e); } // fire current
  return () => healthSubscribers.delete(handler);
}
```

Then wire the counters into `refreshSlice` (`store.js:96-110`). On **success** (after `setSlice(sliceKey, next)` at `store.js:101`) reset the slice's counter; on **error** (in the `catch` at `store.js:103-106`) increment it. Only **polled** slices drive health (one-shot `narrative:` fetches must not paint the whole app offline) — guard on `POLL_INTERVAL_MS[sliceKey]`:

```js
    try {
      const data = await fetcher();
      const next = normaliseSlice(sliceKey, data);
      setSlice(sliceKey, next);
      if (POLL_INTERVAL_MS[sliceKey]) { failures.set(sliceKey, 0); recomputeHealth(); }
      return next;
    } catch (err) {
      // (Task 2 rewrites the body below to keep last-known-good.)
      if (POLL_INTERVAL_MS[sliceKey]) {
        failures.set(sliceKey, (failures.get(sliceKey) || 0) + 1);
        recomputeHealth();
      }
      const errSlice = { status: 'error', error: err, fetchedAt: Date.now() };
      setSlice(sliceKey, errSlice);
      return errSlice;
    }
```

### Step 1.3 — Header wiring

In `web/index.html:65-68`, mark the status line as a polite live region (coordinate the exact ARIA with RUNBOOK-06 §canvas-a11y — `polite` is the agreed value; do not use `assertive`):

```html
        <div class="status-indicator" aria-live="polite">
          <span class="status-dot" id="statusDot"></span>
          <span id="statusText">Connecting…</span>
        </div>
```

(Changing the literal from `Connected` to `Connecting…` removes the dishonest default before any JS runs.)

In `web/lib/header.js`, register the initializer in `initHeader()` (`header.js:21-36`) and add the function next to `initPulse` (`header.js:162`):

```js
// in initHeader(), after initBlockHeight();
  initConnectionStatus();
```

```js
// New — drives #statusDot / #statusText from the store's health signal.
async function initConnectionStatus() {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  if (!dot || !txt) return;
  try {
    const { subscribeHealth, getHealthLabel } = await import('/lib/store.js');
    subscribeHealth((state) => {
      const offline = state !== 'ok';
      dot.classList.toggle('disconnected', offline);
      // reconnecting gets its own amber class so it is distinguishable from hard-offline
      dot.classList.toggle('reconnecting', state === 'reconnecting');
      txt.textContent = getHealthLabel();
    });
  } catch (e) {
    // store unavailable — leave the pre-JS "Connecting…" copy in place.
  }
}
```

Add the amber reconnecting style next to `styles.css:295`:

```css
.status-dot.disconnected { background: var(--red); animation: none; }
.status-dot.reconnecting { background: var(--sunny); }
```

**Why:** F3 — the light physically cannot go red today; "Connected" is asserted in static HTML. Routing it through one store health signal means the dot reflects actual fetch outcomes, and any view that polls through the store contributes to it for free.

**Verify:** Load `#/spine` with the devnet up → dot green, "Connected". Kill the RPC backend (or block `/rpc` in devtools) → within `OFFLINE_THRESHOLD` ticks the dot goes amber "Reconnecting…", then red "Offline". Restore → returns to green on the next successful tick.

**Acceptance:** `#statusText` is never the literal `"Connected"` in `index.html`; the only writer of `.disconnected` is `header.js`; the store exposes `subscribeHealth` / `getHealth` / `getHealthLabel`; toggling the backend toggles the dot.

---

## Task 2 — Surface `fetchedAt` / staleness; keep last-known-good  *(keep-last-known-good = Phase 0 blocking; tagging = fast-follow)*

**Files & anchors:**
- `web/lib/store.js:103-106` — error branch must preserve prior `data`.
- `web/lib/store.js` — export a tiny staleness reader.
- `web/lib/cockpitRails.js:60`, `:141`, `:216` — three identical `errorStateNode` replacements that wipe content.
- `web/lib/telemetry.js` — add an "updated Ns ago" line to the pulse head (`telemetry.js:24-34`).

### Step 2.1 — Store: keep last-known-good on transient error

Rewrite the `catch` block (`store.js:103-106`, already partially edited in Task 1) so a failure that has prior data **retains the data** and flags it `stale`, rather than replacing it with a bare error envelope:

```js
    } catch (err) {
      if (POLL_INTERVAL_MS[sliceKey]) {
        failures.set(sliceKey, (failures.get(sliceKey) || 0) + 1);
        recomputeHealth();
      }
      const prev = slices.get(sliceKey);
      if (prev && prev.data) {
        // Preserve last-known-good; mark it stale + attach the error for badging.
        const kept = {
          ...prev,
          status: 'visible',     // subscribers keep rendering the data
          stale: true,
          error: err,
          errorAt: Date.now(),
          // fetchedAt stays = the moment the data was actually good
        };
        setSlice(sliceKey, kept);
        return kept;
      }
      const errSlice = { status: 'error', error: err, fetchedAt: Date.now() };
      setSlice(sliceKey, errSlice);
      return errSlice;
    }
```

> Note: `setSlice` (`store.js:138-139`) stamps `fetchedAt = slice.fetchedAt || Date.now()`. Because the spread carries the prior `fetchedAt`, the "updated Ns ago" clock correctly reflects the last *good* fetch, not the failed attempt.

Add a staleness reader near `getSlice` (`store.js:57-59`):

```js
import { isStale } from '/lib/liveness.js';

export function sliceFreshness(key) {
  const s = slices.get(key);
  if (!s) return { fetchedAt: 0, stale: false };
  const interval = POLL_INTERVAL_MS[key] || 0;
  return {
    fetchedAt: s.fetchedAt || 0,
    stale: Boolean(s.stale) || isStale(s.fetchedAt, interval),
  };
}
```

### Step 2.2 — Rails: don't replace content on transient error; tag stale

The three rails share the exact pattern at `cockpitRails.js:60`, `:141`, `:216`:

```js
    if (slice.status === 'error') { body.replaceChildren(errorStateNode(slice.error)); return; }
```

Replace **each** with the keep-and-tag version (only show the full error node when there is genuinely no prior data to keep):

```js
    if (slice.status === 'error' && !slice.data) {
      body.replaceChildren(errorStateNode(slice.error)); return;
    }
    // Transient failure with prior data, or a stale-but-visible slice:
    root.classList.toggle('stale', Boolean(slice.stale));
    // (rendering of slice.data continues below, unchanged)
```

Add a freshness badge to each rail head. For the approvals rail head built at `cockpitRails.js:36-46`, after appending `count`, append:

```js
  const fresh = document.createElement('span');
  fresh.className = 'cockpit-rail-fresh';
  head.appendChild(fresh);
```

and inside `render(slice)` set it:

```js
  import { agoLabel } from '/lib/liveness.js';
  // …
  fresh.textContent = slice.stale
    ? 'updated ' + agoLabel(slice.fetchedAt) + ' · retrying'
    : 'updated ' + agoLabel(slice.fetchedAt);
```

Drive a 1-second ticker so the relative label advances even when no new data arrives (one shared interval for the whole rail column; register it in `spine.js` mount near `cockpitRails` creation, `spine.js:90-99`, and clear it in the existing `destroy()` path):

```js
  const freshTick = setInterval(() => {
    document.querySelectorAll('.cockpit-rail-fresh[data-at]').forEach((el) => {
      el.textContent = 'updated ' + agoLabel(Number(el.dataset.at));
    });
  }, 1000);
  // push clearInterval(freshTick) into the view's teardown
```

Add CSS next to the rail styles:

```css
.cockpit-rail.stale .cockpit-rail-body { opacity: 0.55; transition: opacity .2s; }
.cockpit-rail-fresh { font-size: 10px; color: var(--text-dim); font-family: var(--mono); margin-left: auto; }
```

**Why:** F4 + F5 — we already pay for `fetchedAt` but never show it, and a single dropped poll currently nukes the operator's data and replaces it with a raw error string. Keeping last-known-good while dimming + tagging it is the honest behavior: *the data you see is real, it's just N seconds old and we're retrying.*

**Verify:** With rails populated, drop one poll (devtools throttle/offline for ~5s) → rows stay, the column dims, the badge reads "updated 6s ago · retrying"; restore → dim clears, badge resets to "just now". With the backend hard-down from boot (no prior data) → the rail still shows `errorStateNode` (no data to keep).

**Acceptance:** No rail calls `errorStateNode` when `slice.data` is present; `sliceFreshness(key)` returns `{fetchedAt, stale}`; the badge advances on the 1s ticker.

---

## Task 3 — Heartbeat from real arrivals  *(Phase 0 fast-follow; honor reduced-motion — gate 2)*

**Files & anchors:**
- `web/styles.css:3758-3769` (`.live-pulse-heartbeat` + `@keyframes heartbeat`) and `styles.css:4692-4701` (`.tele-heartbeat` + duplicate `@keyframes heartbeat`).
- `web/lib/store.js` — emit a "tick" on every successful `setSlice`.
- `web/lib/telemetry.js:31-34` (the `.tele-heartbeat` element) and its `runtimePulse` subscription (`telemetry.js:100-118`).

### Step 3.1 — Store: a generic success tick

In `setSlice` (`store.js:138-148`), after notifying slice subscribers, fan out a global tick **only on a visible (real-data) update**:

```js
const tickSubscribers = new Set(); // handler(sliceKey)
export function subscribeTick(handler) {
  tickSubscribers.add(handler);
  return () => tickSubscribers.delete(handler);
}
```

```js
function setSlice(key, slice) {
  slice.fetchedAt = slice.fetchedAt || Date.now();
  slices.set(key, slice);
  const set = subscribers.get(key);
  if (set) for (const h of set) { try { h(slice); } catch (e) { console.error('store notify handler', key, e); } }
  if (slice.status === 'visible' && !slice.stale) {
    for (const h of tickSubscribers) { try { h(key); } catch (e) { console.error('store tick handler', e); } }
  }
  return slice;
}
```

### Step 3.2 — CSS: replace the infinite loop with a one-shot beat

At both `styles.css:3758-3765` and `styles.css:4692-4697`, **remove** `animation: heartbeat 2.4s ease-in-out infinite;`. Keep the duplicate `@keyframes heartbeat` (or fold into one) but add a one-shot variant and a reduced-motion guard:

```css
.live-pulse-heartbeat, .tele-heartbeat { animation: none; }
.live-pulse-heartbeat.beat, .tele-heartbeat.beat {
  animation: heartbeat-beat 600ms ease-out;
}
@keyframes heartbeat-beat {
  0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ok) 70%, transparent); }
  100% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--ok) 0%, transparent); }
}
@media (prefers-reduced-motion: reduce) {
  .live-pulse-heartbeat.beat, .tele-heartbeat.beat { animation: none; }
}
```

### Step 3.3 — Telemetry: pulse on arrival

In `web/lib/telemetry.js`, capture the `heartbeat` element (already created at `telemetry.js:31-33`) and beat it from a store tick subscription (add alongside the existing `subs.push(subscribe2('runtimePulse', …))` at `telemetry.js:100`):

```js
import { subscribe2, subscribeTick } from '/lib/store.js';
// …
subs.push(subscribeTick(() => {
  heartbeat.classList.remove('beat');
  // eslint-disable-next-line no-unused-expressions
  heartbeat.offsetWidth;           // reflow so the animation re-triggers
  heartbeat.classList.add('beat');
  setTimeout(() => heartbeat.classList.remove('beat'), 650);
}));
```

(If Task 6 Option B deletes the `live.js` pulse card, skip its `.live-pulse-heartbeat`; otherwise apply the same `subscribeTick` wiring in `live.js`'s `renderRuntimePulse` head, `live.js:82-84`.)

**Why:** F8 — a dot that pulses on a fixed timer says "alive" even when every fetch is failing. Pulsing on real `setSlice(visible)` makes the beat a truthful signal: it stops when data stops.

**Verify:** Watch the pulse dot — it beats on each successful 4s `runtimePulse`/`cockpit` fetch and **stops** when you go offline (no visible updates). With `prefers-reduced-motion: reduce`, no animation runs (the color/value bumps remain the freshness signal).

**Acceptance:** Neither heartbeat element retains an `infinite` animation; the only trigger of `.beat` is `subscribeTick`; reduced-motion disables it.

---

## Task 4 — Time-cursor correctness  *(Phase 0 — exit-gate-0 blocking; P3; SP1 dependency)*

**Files & anchors:**
- `web/lib/store.js` — import `onAtChange` (`timeContext.js:55`) and subscribe once at module init, near the existing `subscribe(...)` bus block (`store.js:272`). This is independent of, and survives, the Task 6 decision.

### Step 4.1 — Invalidate every time-sensitive slice on cursor change

```js
import { onAtChange } from '/lib/timeContext.js';

// When the time cursor moves, every read must be re-issued under the new
// `at` coordinate. rpcWithDisclosure already injects `withAt(...)`, so a
// plain refresh re-fetches at the new point in time. Invalidate the polled
// projections AND every open narrative (which has no poll cadence of its
// own, store.js:46-50, and would otherwise show live data forever — P3).
onAtChange(() => {
  invalidateSlice('recentIntents');
  invalidateSlice('runtimePulse');
  invalidateSlice('cockpit');
  // Union of cached + currently-subscribed narrative slices.
  const keys = new Set([...slices.keys(), ...subscribers.keys()]);
  for (const key of keys) {
    if (key.startsWith('narrative:')) invalidateSlice(key);
  }
});
```

`invalidateSlice` (`store.js:115-118`) already calls `refreshSlice(...).catch(...)`; `refreshSlice` dedupes in-flight calls (`store.js:91`). The narrative fetcher (`store.js:189-192` → `fetchNarrativeRaw`, `store.js:196`) issues all its reads through `rpcWithDisclosure`, so they pick up the new `at` automatically — no parameter plumbing needed.

**Why:** F6 / P3 — the single most dangerous class of bug for an audit tool: the time banner says "viewing as of block X" while the narrative panel keeps painting live data. After this change, moving the cursor re-issues the narrative read at that coordinate, so the panel agrees with the banner.

**Verify:** Open an intent's narrative (`#/spine/<id>`), then set `?at=block:<old>` via the time selector. The narrative must re-fetch (watch the network tab for the `intent.get` / `explorer.*` calls carrying `at`) and the panel content must change to the historical view. Returning to live (`setAt(null)`) re-fetches live.

**Acceptance:** `store.js` imports `onAtChange` and registers exactly one listener that invalidates `recentIntents`, `runtimePulse`, `cockpit`, and every `narrative:*` key. Covered by the new `store_at_invalidation_smoke.mjs` (Test plan §B).

---

## Task 5 — Poll hygiene: pause on hidden/frozen + exponential backoff  *(Phase 0 fast-follow)*

**Files & anchors:**
- `web/lib/store.js:150-162` — `ensurePoller`; the bare `setInterval` at `store.js:160`.
- `web/lib/header.js:143-157` — `initBlockHeight`; the bare `setInterval` at `header.js:156`.

### Step 5.1 — Store: self-scheduling poller with guards + backoff

Replace `ensurePoller` (`store.js:150-162`) with a `setTimeout`-driven scheduler. It (a) skips a tick when `document.hidden` or `!isAtLive()`, (b) backs off `4s→8s→16s` on consecutive failures using `nextBackoff`, and (c) resumes immediately when the tab becomes visible:

```js
import { isAtLive } from '/lib/timeContext.js';
import { nextBackoff } from '/lib/liveness.js';

const BACKOFF_CAP_MS = 16000;
const pollTimers = new Map(); // sliceKey → timeout handle (replaces the interval map for polled slices)

function ensurePoller(sliceKey) {
  if (pollers.has(sliceKey) || pollTimers.has(sliceKey)) return;
  const base = POLL_INTERVAL_MS[sliceKey];
  if (!base) { refreshSlice(sliceKey).catch(() => {}); return; } // one-shot (e.g. narrative)

  refreshSlice(sliceKey).catch(() => {});   // initial fetch
  pollers.set(sliceKey, true);              // mark active (subscribe2 teardown checks this)
  scheduleNext(sliceKey, base);
}

function scheduleNext(sliceKey, base) {
  const attempt = failures.get(sliceKey) || 0;
  const delay = attempt > 0 ? nextBackoff(base, attempt - 1, BACKOFF_CAP_MS) : base;
  const t = setTimeout(async () => {
    // Pause when the tab is hidden or the cursor is frozen on a historical
    // snapshot (immutable — re-fetching is pure waste). Reschedule a probe.
    if ((typeof document !== 'undefined' && document.hidden) || !isAtLive()) {
      scheduleNext(sliceKey, base);
      return;
    }
    await refreshSlice(sliceKey).catch(() => {});
    if (pollers.has(sliceKey)) scheduleNext(sliceKey, base); // re-read attempt via failures map
  }, delay);
  pollTimers.set(sliceKey, t);
}
```

Update the teardown in `subscribe2` (`store.js:71-79`) to clear the new timer map and the active flag:

```js
    if (set && set.size === 0 && (pollers.has(sliceKey) || pollTimers.has(sliceKey))) {
      const t = pollTimers.get(sliceKey);
      if (t) clearTimeout(t);
      pollTimers.delete(sliceKey);
      pollers.delete(sliceKey);
    }
```

Add a visibility resume near the module's bottom (so a backgrounded tab catches up the instant the operator returns):

```js
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !isAtLive()) return;
    for (const key of pollTimers.keys()) refreshSlice(key).catch(() => {}); // immediate catch-up
  });
}
```

> The "retrying" state is already visible: a backoff-active slice has incremented `failures`, so Task 1's health signal shows "Reconnecting…", and Task 2's rail badge shows "updated Ns ago · retrying".

### Step 5.2 — Header block-height poll guard

In `initBlockHeight` (`header.js:143-157`), guard the poll body and keep the 8s cadence but skip frozen/hidden ticks. Import `isAtLive` (header.js already imports from `spineCommon`; pull `isAtLive` from `timeContext`):

```js
import { isAtLive } from '/lib/timeContext.js';
// …
  const poll = async () => {
    if (document.hidden || !isAtLive()) return;   // tab hidden or time-frozen → skip
    try {
      const h = await rpcWithDisclosure('nexus.operateHealth', {});
      const bh = h && h.network ? h.network.blockHeight : undefined;
      if (bh !== undefined && bh !== null) el.textContent = String(bh);
    } catch (_) { /* keep last painted value */ }
  };
  poll();
  setInterval(poll, 8000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && isAtLive()) poll(); });
```

**Why:** F7 — ~7 RPCs every ~4–5s per idle tab forever, and re-fetching immutable historical snapshots when time-frozen. Pausing on `hidden`/`!isAtLive()` and backing off on failure eliminates the waste and stops hammering a down backend; the visible "Reconnecting…" + "retrying" copy keeps it honest.

**Verify:**
- Background the tab (devtools → Rendering → emulate `document.hidden`, or switch tabs) → network shows polls stop; foreground → an immediate catch-up fetch fires.
- Freeze time (`?at=block:N`) → polled slices stop re-fetching the snapshot; block-height badge stops polling.
- Take the backend down → inter-poll gap grows 4s→8s→16s and caps at 16s; status reads "Reconnecting…"/"Offline".

**Acceptance:** No bare `setInterval(() => refreshSlice…)` remains in `store.js`; the poller skips ticks on `document.hidden`/`!isAtLive()`; gaps follow `4s→8s→16s` cap; `header.js` block-height poll is guarded.

---

## Task 6 — Decide the dead bus: revive or delete  *(Phase 0 — exit-gate-0 blocking)*

A panel labelled **"Activity · live"** that is permanently empty (F1/F2) reads as broken. Gate 0 requires it be made real **or** removed. **Run the probe, then pick exactly one option.**

### Probe (do this first)

The WS contract lives at `liveEvents.js:37` (`WS_PATH = '/v4/ws'`). Confirm the endpoint exists against the running devnet:

```bash
# Expect HTTP 101 (switching protocols) or a 426/400 WS handshake — NOT 404.
curl -i --http1.1 -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZQ==" \
     "http://localhost:<devnet-port>/v4/ws?actor=acc://test.acme&purpose=operational&workflowInstance=nexus-explorer"
```

- **Endpoint answers the handshake (not 404) → choose Option A (revive).** `connectLive` already falls back to `explorer.recentIntents`/`recentAnchors` polling if the socket drops (`liveEvents.js:169,195-260`), so A is safe even on a flaky socket.
- **Endpoint is 404 / not served by this build → choose Option B (delete).** Do not ship a costume with no actor behind it.

> **Recommendation:** Prefer **A** when `/v4/ws` is reachable — `connectLive` is fully built and one call from real; reviving it lights up the Activity feed, the header pulse, row-flash, *and* the store's event-invalidation (`store.js:272-293`) so the cockpit reacts to pushes instead of only polling. Fall back to **B** only if the endpoint genuinely isn't served.

### Option A — Revive (one wiring call)

**Files & anchors:** `web/views/spine.js` mount (`spine.js:35`) — the canonical, always-reachable cockpit (`app.js:123` `spine: spineView`). Reuse the disclosure constant pattern from `spineFlow.js:31-35`.

Add at the top of `spine.js`:

```js
import { connectLive } from '/lib/liveEvents.js';
import { DISCLOSURE } from '/lib/spineCommon.js';

let liveStream = null; // module-level: one connection for the app's lifetime
```

In `spineView.mount(...)` (`spine.js:35`), after `rootEl.replaceChildren()` (`spine.js:41`), open the stream once:

```js
    if (!liveStream) {
      liveStream = connectLive({
        actor: DISCLOSURE.actor,
        purpose: DISCLOSURE.purpose,
        workflowInstance: DISCLOSURE.workflowInstance,
      });
      window.addEventListener('beforeunload', () => { try { liveStream.close(); } catch (e) {} });
    }
```

That is the entire fix. `connectLive` → `publish('spine.*' / 'intent.advanced' / 'anchor.observed')` (`liveEvents.js:74-93`) now actually fires, which lights:
- The Activity feed (`telemetry.js:90-96` seed + subscriptions) and the `live.js` event log (`live.js:185-194`).
- The header pulse (`header.js:167` wildcard subscriber).
- The store's event-invalidation (`store.js:272-293`) — pushes now invalidate `recentIntents`/`cockpit`/`narrative:*`, so polling becomes a fallback, not the only path.

Keep the polling (Task 5) — `connectLive` itself degrades to polling when the socket is unavailable, and the store polls independently; the two are complementary.

**A — Verify:** Submit a typed intent via REST/CLI against the devnet. The Activity feed gains rows, the header pulse beats on the wildcard event, and the relevant rail/narrative refreshes from the push (not only the 4s tick). With `/v4/ws` blocked, `connectLive` falls back to polling and the feed still fills from the diff loop (`liveEvents.js:210-260`).

**A — Acceptance:** `connectLive` is imported and called from a reachable view (`spine.js`); a fresh intent produces Activity rows and a pulse without waiting on the store's poll cadence; `store.js:272-293` is no longer dead.

### Option B — Delete (remove the costume)

Remove every piece that claims liveness with nothing behind it. Per the roadmap's **Deletion discipline**, grep each symbol before and after.

**Remove:**
1. `web/lib/liveEvents.js` — delete the file (its only importer was `spineFlow.js:25`; if RUNBOOK-01 hasn't already deleted `spineFlow.js`/`live.js`, remove the import+call there too).
2. `web/lib/store.js:272-293` — the entire `subscribe('intent.advanced'…)` … `subscribe('spine.approval'…)` block (dead per F2). **Keep Task 4's `onAtChange` listener** — it is unrelated to the bus.
3. `web/lib/telemetry.js` — the **Activity feed** section (`telemetry.js:62-79`), the `getRecent` seed loop (`telemetry.js:90`), and the three bus subscriptions (`telemetry.js:94-96`). Keep the `runtimePulse` `subscribe2` block (`telemetry.js:100-118`) — that one is real (store-backed). Drop the now-unused `subscribe, getRecent` import (`telemetry.js:13`).
4. `web/index.html:60-63` — the `#headerPulse` block.
5. `web/lib/header.js:162-174` — `initPulse()` and its call in `initHeader()` (`header.js:24`).
6. `web/styles.css` — the `.header-pulse*` rules and the `.tele-activity*` / `.live-eventlog*` rules; the `@keyframes heartbeat` once Task 3 has replaced the heartbeat usage.
7. `web/lib/spineBus.js` — if Option B and RUNBOOK-01 leaves no publisher, delete the file and its imports in `telemetry.js`/`header.js`/`live.js`. If `live.js`/`spineFlow.js` still exist and import it, leave `spineBus.js` as an inert pub/sub but confirm nothing renders a "live" label over it.

**B — Verify:** Grep `connectLive`, `getRecent`, `spine.evidence`, `header-pulse`, `tele-activity` → zero matches in shipped code (except the deleted-file's own absence). The cockpit shows only surfaces that are actually backed by data; no element reads "live"/"Activity" while empty. `node --test web/test/*.mjs` green (update/remove any smoke that referenced the feed).

**B — Acceptance:** No imported-but-never-published bus remains; no DOM node labelled "live"/"Activity" exists without a live data source; the runtime pulse (store-backed) still renders.

---

## Task 7 — Error envelopes through `parseUserError`  *(Phase 0 fast-follow)*

**Files & anchors:**
- `web/lib/rpc.js:31-36` — the error-construction block (F9: never parses).
- `web/lib/userError.js:58` — `parseUserError` (accepts a JSON-RPC `error` whose `.data` is a `UserError`, `userError.js:63-65`).
- `web/lib/states.js:73-76` — `errorStateNode`, the shared error renderer used by the rails.

### Step 7.1 — `rpc.js`: attach the parsed UserError

```js
import { parseUserError } from '/lib/userError.js';
// …
  const data = await res.json();
  if (data.error) {
    const ue = parseUserError(data.error); // reads data.error.data when the server translated it
    const err = new Error(ue && ue.title ? ue.title : (data.error.message || 'rpc error'));
    err.code = data.error.code;
    err.rpcMethod = method;
    if (ue) { err.userError = ue; err.code = ue.code; }
    throw err;
  }
  return data.result;
```

This mirrors what `rest.js:27-35` already does for the REST surface, so RPC and REST failures now carry the same normalized `UserError`.

### Step 7.2 — `states.js`: render the structured envelope

Enhance `errorStateNode` (`states.js:73-76`) to render `title / impact / fixes / docs` when `err.userError` is present, falling back to the existing plain message otherwise:

```js
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
      a.className = 'state-docs'; a.href = ue.docs; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = 'Docs';
      wrap.appendChild(a);
    }
    return wrap;
  }
  const msg = err && err.message ? err.message : (typeof err === 'string' ? err : 'Unknown error');
  return makeStateNode('error', 'Error', msg);
}
```

> If a richer shared `userErrorCard` already lands via adoption-08 (referenced by `test/user_error_smoke.mjs`), prefer reusing it here instead of the inline list — the requirement is only that a translated error shows `title/impact/fixes/docs`, never a raw `-32xxx` JSON-RPC string.

**Why:** F9 — `parseUserError` and the whole translation layer exist (`userError.js`), REST already uses them (`rest.js:27`), but the cockpit reads through `rpc.js` which throws the raw JSON-RPC message. Routing RPC errors through the same parser gives operators the actionable card the CLI prints.

**Verify:** Force a translated failure (e.g. read with an actor lacking `explorer:view` so the node returns a stable-coded error in `error.data`). The rail's error state shows the title + impact + fix commands, not `{"code":-32000,…}`. A non-translated numeric error still shows the plain message (graceful fallback).

**Acceptance:** `rpc.js` imports and calls `parseUserError`; `err.userError` is attached when present; `errorStateNode` renders structured guidance for translated errors and falls back cleanly otherwise.

---

## Test plan

CI runs `node --test web/test/*.mjs` (`.github/workflows/ci.yml:31`) and `go test ./...` (`:19`). Add the following.

### §A — `web/test/liveness_smoke.mjs` (NEW) — pure helpers

Directly importable (no `/lib/` specifiers in `liveness.js`), mirroring `app_smoke.mjs`.

```js
// web/test/liveness_smoke.mjs — pure liveness math (Tasks 1, 2, 5).
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const L = await import(pathToFileURL(path.join(here, '..', 'lib', 'liveness.js')).href);

test('healthFromFailures rolls per-slice failures into a global state', () => {
  assert.equal(L.healthFromFailures(new Map([['cockpit', 0]])), 'ok');
  assert.equal(L.healthFromFailures(new Map([['cockpit', 1]])), 'reconnecting');
  assert.equal(L.healthFromFailures(new Map([['cockpit', 3]])), 'offline');
  assert.equal(L.healthFromFailures(new Map([['a', 0], ['b', 5]])), 'offline'); // worst wins
});

test('agoLabel renders relative freshness', () => {
  const now = 1_000_000;
  assert.equal(L.agoLabel(0, now), 'never');
  assert.equal(L.agoLabel(now - 500, now), 'just now');
  assert.equal(L.agoLabel(now - 6000, now), '6s ago');
  assert.equal(L.agoLabel(now - 120000, now), '2m ago');
});

test('isStale fires after STALE_INTERVALS cadences', () => {
  const now = 1_000_000;
  assert.equal(L.isStale(now - 5000, 4000, now), false);   // < 3·4s
  assert.equal(L.isStale(now - 13000, 4000, now), true);   // > 12s
});

test('nextBackoff doubles to a cap (4s→8s→16s→16s)', () => {
  assert.equal(L.nextBackoff(4000, 0, 16000), 4000);
  assert.equal(L.nextBackoff(4000, 1, 16000), 8000);
  assert.equal(L.nextBackoff(4000, 2, 16000), 16000);
  assert.equal(L.nextBackoff(4000, 3, 16000), 16000); // capped
});

test('healthLabel copy is honest', () => {
  assert.equal(L.healthLabel('ok'), 'Connected');
  assert.equal(L.healthLabel('reconnecting'), 'Reconnecting…');
  assert.equal(L.healthLabel('offline'), 'Offline');
});
```

### §B — `web/test/store_at_invalidation_smoke.mjs` (NEW) — Task 4 behavior + keep-last-known-good

`store.js` uses `/lib/...` absolute specifiers, so register a tiny resolve hook before importing it, and stub `fetch`/DOM (the same shim shape as `time_context_smoke.mjs:13-24`). First the helper:

```js
// web/test/_resolve_lib.mjs — maps browser-absolute /lib/ + /views/ specifiers
// to file URLs under web/ so store.js (and its deps) import under node --test.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const webRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export async function resolve(specifier, context, next) {
  if (specifier.startsWith('/lib/') || specifier.startsWith('/views/')) {
    return { url: pathToFileURL(path.join(webRoot, specifier)).href, shortCircuit: true };
  }
  return next(specifier, context);
}
```

```js
// web/test/store_at_invalidation_smoke.mjs — Tasks 2 & 4.
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, '_resolve_lib.mjs')).href); // install resolver

// --- DOM + fetch shim (mirrors time_context_smoke.mjs) ---
const calls = []; // record every RPC method the store issues
globalThis.window = {
  location: { href: 'http://localhost/#/spine/intent-1', origin: 'http://localhost' },
  history: { state: null, replaceState() {} },
  addEventListener() {},
};
globalThis.document = { hidden: false, visibilityState: 'visible', addEventListener() {} };
globalThis.URL = URL;
globalThis.fetch = async (_url, opts) => {
  const body = JSON.parse(opts.body);
  calls.push(body.method);
  // minimal shapes so normaliseSlice() yields status:'visible'
  const result = body.method === 'explorer.recentIntents'
    ? { intents: [{ id: 'intent-1' }] }
    : body.method === 'nexus.cockpit'
      ? { pendingApprovals: [], riskSignals: [], verificationTasks: [] }
      : body.method === 'intent.get'
        ? { id: 'intent-1' }
        : {};
  return { json: async () => ({ result }) };
};

const store = await import('/lib/store.js');
const tc = await import('/lib/timeContext.js');

test('moving the time cursor invalidates the time-sensitive slices', async () => {
  store.subscribe2('cockpit', () => {});
  store.subscribe2('recentIntents', () => {});
  store.subscribeNarrative('intent-1', () => {});
  await new Promise((r) => setTimeout(r, 20)); // let initial fetches settle
  calls.length = 0;

  tc.setAt({ block: 5 });                       // fire onAtChange
  await new Promise((r) => setTimeout(r, 20));

  assert.ok(calls.includes('nexus.cockpit'), 'cockpit re-fetched on at-change');
  assert.ok(calls.includes('explorer.recentIntents'), 'recentIntents re-fetched');
  assert.ok(calls.includes('intent.get'), 'open narrative re-fetched at new at-coordinate');
});

test('a transient error keeps last-known-good data', async () => {
  // Force the next cockpit fetch to throw, then assert the slice still has data.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network down'); };
  await store.refreshSlice('cockpit');
  const slice = store.getSlice('cockpit');
  assert.ok(slice.data, 'data preserved across a transient failure');
  assert.equal(slice.stale, true, 'slice flagged stale');
  globalThis.fetch = realFetch;
});
```

> If `register()`-based hooks prove flaky on the CI Node build, the equivalent fallback is to run this file with `node --import ./web/test/_resolve_lib_register.mjs`; keep the self-`register()` form first since CI invokes `node --test web/test/*.mjs` with no extra flags.

### §C — Structural fence (Go) — `liveness_honesty_fence_test.go` (NEW, repo root, package `nexusweb`)

Match the existing fence style (`time_e3c4_time_context_fence_test.go`): read the embedded web assets and assert the honesty invariants survive refactors.

```go
package nexusweb

import (
	"os"
	"strings"
	"testing"
)

func TestLiveness_StatusNotHardcodedConnected(t *testing.T) {
	src := readFile(t, "web/index.html")
	if strings.Contains(src, ">Connected<") {
		t.Errorf("index.html must not hardcode the status text to Connected")
	}
	if !strings.Contains(src, `aria-live="polite"`) {
		t.Errorf("status-indicator must be an aria-live polite region")
	}
}

func TestLiveness_StoreExposesHealthAndAtInvalidation(t *testing.T) {
	src := readFile(t, "web/lib/store.js")
	for _, tok := range []string{
		"export function subscribeHealth",
		"import { onAtChange } from '/lib/timeContext.js'",
		"onAtChange(",
		"narrative:",            // narrative invalidation present
		"isAtLive",              // poll guard
	} {
		if !strings.Contains(src, tok) {
			t.Errorf("store.js must contain %q", tok)
		}
	}
	if strings.Contains(src, "setInterval(() => refreshSlice") {
		t.Errorf("store.js must not use a bare setInterval poller (use the backoff scheduler)")
	}
}

func TestLiveness_RpcParsesUserError(t *testing.T) {
	src := readFile(t, "web/lib/rpc.js")
	if !strings.Contains(src, "parseUserError") {
		t.Errorf("rpc.js must route errors through parseUserError")
	}
}

func readFile(t *testing.T, p string) string {
	t.Helper()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("read %s: %v", p, err)
	}
	return string(b)
}
```

Add a Task-6-specific fence depending on the option chosen:
- **Option A:** assert `web/views/spine.js` contains `connectLive(` and `import { connectLive }`.
- **Option B:** assert `connectLive` and `tele-activity` appear in **zero** shipped files (grep over `web/`), and `web/lib/liveEvents.js` no longer exists.

### Existing tests to re-run / update
- `web/test/time_context_smoke.mjs` — unaffected (Task 4 only adds a listener); confirm still green.
- `web/test/router_smoke.mjs`, `web/test/app_smoke.mjs` — confirm green after the header/init changes.
- Any smoke that references the Activity feed (if **Option B**) — update or remove.

---

## Acceptance (whole runbook)

1. **No dishonest liveness.** `#statusText` is never the literal `"Connected"` in markup; the dot reflects real fetch outcomes via `subscribeHealth`; the heartbeat beats only on real `setSlice(visible)`; the "Activity"/pulse is either real (Option A) or gone (Option B).
2. **Freshness is visible and safe.** Every rail shows "updated Ns ago"; a transient poll error keeps last-known-good (dimmed, tagged "retrying"), never wiping data; `errorStateNode` only appears with no prior data.
3. **Time-cursor honesty (P3).** Moving the cursor re-fetches `cockpit`, `recentIntents`, `runtimePulse`, and every open `narrative:*` at the new `at`; the narrative panel agrees with the time banner. (Unblocks SP1.)
4. **Poll hygiene.** No bare polling interval remains; polls pause on `document.hidden`/`!isAtLive()`; failures back off `4s→8s→16s`; the retry state is visible.
5. **Honest errors.** RPC failures render `title/impact/fixes/docs`, never raw JSON-RPC strings.
6. **Green:** `go test ./...` and `node --test web/test/*.mjs` pass, including the two new `.mjs` suites and the new Go fence.

---

## Rollback

Each task is an independent, revertible unit:

- **Task 4** (P3) is the smallest and highest-value; if anything destabilizes, it can stay while others revert — it has no dependency on the bus decision.
- **Tasks 1/2/3/5** all funnel through the new `web/lib/liveness.js` + the store's health/tick/backoff additions. Reverting `liveness.js` plus the store diff returns to the pre-runbook behavior (the bare interval poller and `{status:'error'}` overwrite). The header `initConnectionStatus` no-ops cleanly if `store.js` lacks `subscribeHealth` (its `import('/lib/store.js')` is wrapped in try/catch), so a partial revert won't throw.
- **Task 6** is a single mount-call (Option A) or a contained deletion set (Option B); Option A reverts by removing the `connectLive(...)` call in `spine.js` — the store's event-invalidation simply goes dormant again (no error, just no pushes).
- **Task 7** reverts by restoring the original `rpc.js:31-36` block and the original `errorStateNode`; no data-shape change is persisted.

Keep each task on its own commit so a single `git revert` backs out one behavior without disturbing the others. Re-run both test suites after any revert.
