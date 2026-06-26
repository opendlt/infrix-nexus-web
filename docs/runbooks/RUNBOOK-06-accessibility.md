# RUNBOOK-06 — Bring the SPA to Genuine WCAG AA

> **Parent:** [`../nexus-ux-review-2026-06.md`](../nexus-ux-review-2026-06.md) **§4.6** ("Accessibility — make the product usable by keyboard and assistive technology, not just claim it"). Supporting evidence: the canvas centerpiece (Cinema) is the most data-dense surface in the product and is currently invisible to assistive technology and unreachable by keyboard.
> **Roadmap:** [`RUNBOOK-00`](./RUNBOOK-00-roadmap.md) — Phase 2, **exit-gate 2 accessibility clause**: *"Keyboard reaches every interactive control including the Cinema canvas; reduced-motion is honored including the canvas rAF loop (via a JS `matchMedia` read, roadmap §86); a skip link bypasses the nav; live status is announced; axe-core is clean on the top surfaces."*
> **Audience:** One IC, end-to-end. Every change has a file, an anchor, and the exact code. No further design decisions required.
> **Golden rule for this runbook:** *If a sighted mouse user can perceive it or act on it, a keyboard-only user and a screen-reader user must be able to perceive it and act on it too. "Accessible" is verified with axe-core + a real screen reader, not asserted.*

---

## Objective

The SPA today fails several WCAG 2.1 Level AA success criteria in ways that are load-bearing, not cosmetic:

1. **No bypass mechanism (2.4.1).** There is no skip link anywhere — the only `.sr-only` element in the product is the copy-button's status region (`styles.css:9178`). A keyboard user tabs through **8 nav links** (`index.html:18-28`) + global search (`:29-34`) + 2 mode buttons (`:37-40`) + the identity disclosure (`:41-59`) + the theme button (`:72-79`) **on every single view** before reaching content.
2. **The Cinema canvas is keyboard-dead and AT-invisible (2.1.1, 1.1.1).** The canvas is created in `cinema-core/app.js:48-50` with **zero ARIA** (no `role`, no `aria-label`, no text alternative, no live region). Selection is **mousedown-only** (`renderer.js:538-548`); there is **no keyboard node navigation** — you cannot Tab to the canvas, cannot Arrow between nodes, cannot Enter to select. The richest data surface in the product is mouse-gated and silent.
3. **Reduced-motion is not honored on the canvas (2.3.3).** The CSS guard exists (`styles.css:5568-5574`) but it only neutralizes CSS `animation`/`transition`. The canvas animates in a JS `requestAnimationFrame` loop (`renderer.js:167-181`); particles, node pulses (`:338`), quarantine shake (`:348-351`), anomaly glow (`:356-364`), and the entry overshoot bounce (`:334`) all run **regardless of the user's `prefers-reduced-motion` setting**.
4. **Live status is silent to screen readers (4.1.3).** The connection status (`index.html:65-68`) and block-height badge (`:69-71`) update via JS (`header.js:143-157`) but have **no `aria-live`** — a screen-reader user never learns the app reconnected, went offline, or that the chain advanced.
5. **Nav does not collapse on phones.** The 8-item nav has no hamburger; under 480px it `flex-wrap`s the header into a column (`styles.css:5124-5147`) and the nav links wrap into several rows — a cramped, error-prone tap target field.
6. **Dim text contrast is unverified on lighter surfaces (1.4.3).** `--text-dim: #8B94BD` is documented at ~5.3-5.9:1 **only on the darkest surfaces** (`styles.css:40-42`). It is also used on `--surface-alt: #1B2031` and `--surface-hover: #232940` (`:33-34`) and on hover states, where the ratio drops and may fall below 4.5:1.

This runbook closes all six gaps with code-level changes, then proves them with axe-core, a scripted keyboard walk-through, and a screen-reader checklist.

### Exit-gate alignment

**Exit gate 2 (this runbook owns the accessibility clause):**
- *Skip link* → **Task 1** (2.4.1).
- *Canvas reachable + perceivable by AT* → **Task 2** (ARIA + parallel DOM, 1.1.1) and **Task 3** (keyboard nav, 2.1.1).
- *Reduced-motion including canvas* → **Task 4** (JS `matchMedia`, 2.3.3).
- *Live status announced* → **Task 5** (4.1.3).
- *Mobile nav* → **Task 6**.
- *Contrast clean on top surfaces* → **Task 7** (1.4.3).
- *SR users land in new content on navigation* → **Task 8** (2.4.3 focus order, supports 2.4.1).

### Cross-runbook seams (do not duplicate)

- **[`RUNBOOK-05`](./RUNBOOK-05-visual-brand-cinema.md) Task 8** adds the renderer-side `matchMedia` *plumbing hook* and the idle/off-screen pause of the rAF loop; **this runbook's Task 4** owns the *behavioral* reduced-motion contract (which effects switch off) and wires it to the same `matchMedia`. **Land Task 4 on top of RUNBOOK-05 Task 8** — do not add a second `matchMedia` read; share one `this.reduceMotion` flag. If RUNBOOK-05 has not landed, Task 4 introduces the flag and RUNBOOK-05 consumes it.
- **[`RUNBOOK-03`](./RUNBOOK-03-liveness-honesty.md)** owns the *content* of the connection status (the "Connected"/"Reconnecting"/"Offline" copy and the polling that sets `#statusText`/`#statusDot`). **This runbook's Task 5** owns only the *announcement plumbing* (`aria-live`, throttling). Task 5 adds the attributes and the throttle; RUNBOOK-03 keeps writing the text.
- **[`RUNBOOK-01`](./RUNBOOK-01-ia-consolidation.md)** reduces the nav from 8 links to **6 doors**. **This runbook's Task 6** collapses *whatever count the nav has* on phones — do both; 6 doors still collapse on phone. Task 6 selects nav children generically (`nav.header-workspaces .workspace-link`) so it is independent of the count.

### The pattern to follow (already-good code — cite in the PR)

These components already do accessibility correctly. New code in this runbook must match their idiom, not invent a new one:

- **`components/ProofReceiptCard.js:31-40,61`** — `role="group"` + descriptive `aria-label`, decorative glyphs marked `aria-hidden="true"`, list semantics with `aria-label="Notes"`.
- **`components/TrustBoundaryMap.js:20,63-71`** — `role="group"` + `aria-label`, semantic `<dl>`/`<dt>`/`<dd>` so the "who proved what" data is a real definition list for AT.
- **`lib/copyCommand.js:23-26,38-39`** — an off-screen `.sr-only` span with `aria-live="polite"` + `role="status"`, text updated on action. **This is the exact idiom Task 2 and Task 5 reuse for the canvas and status announcers.**

---

## Verified findings (confirmed against source — cite these in the PR description)

| # | Finding | Evidence (file:line) |
|---|---------|----------------------|
| F1 | **No skip link.** The only `.sr-only` element is the copy button's live region. First focusable element on load is the first nav anchor. | `index.html:9-91` (no skip link); `styles.css:9178` (only `.sr-only`) |
| F2 | **8 nav links** + search + 2 mode buttons + disclosure + theme button sit in the tab order ahead of `#view-container` on every view. | `index.html:18-28,29-34,37-40,41-59,72-79,91` |
| F3 | **Canvas has zero ARIA.** Created in `mountCinema` with only `id`/`className`; no `role`/`aria-label`/`tabindex`/text alternative/live region. (Note: the canvas DOM is owned by `app.js`, **not** `cinemaMount.js`, which only calls `mountCinema`.) | `cinema-core/app.js:48-50`; `lib/cinemaMount.js:124-129` |
| F4 | **Selection is mousedown-only; no keyboard nav.** `setupInteraction` binds `wheel`/`mousedown`/`mousemove`/`mouseup`/`mouseleave` only — no `keydown`, no focusability, no `focusedNodeIndex`. | `renderer.js:531-571`; `:24` (`selectedNode` only) |
| F5 | **Canvas ignores reduced-motion.** No `matchMedia` read anywhere in `renderer.js`. The rAF loop advances `particlePhase` unconditionally (`:170`); pulse (`:338`), quarantine shake (`:348-351`), anomaly glow (`:356-364`), and entry overshoot (`:334`) all run regardless. CSS guard `styles.css:5568-5574` cannot reach canvas paint. | `renderer.js:167-181,334,338,348-351,356-364` |
| F6 | **Live status not announced.** `#statusText`/`#statusDot` (`index.html:65-68`) and `#headerBlockHeight` (`:69-71`, set by `header.js:143-157`) have no `aria-live`. | `index.html:65-71`; `header.js:143-157` |
| F7 | **No mobile nav collapse.** Under 480px the header goes column (`styles.css:5124-5147`); the 8 nav links wrap into rows, no hamburger/disclosure. | `index.html:18-28`; `styles.css:5124-5147` |
| F8 | **`--text-dim` contrast documented only for dark surfaces.** `#8B94BD` is noted ~5.3-5.9:1 on `#0E1119`/`#1B2031`, but it is also used on `--surface-hover #232940` and on hover states where the ratio is unverified. | `styles.css:40-42` (note), `:33-34` (surfaces) |
| F9 | **No focus management on route change.** `router.activate` toggles `frame.hidden` (`router.js:59-63`) but never moves focus, so SR/keyboard users stay parked on the nav link after navigating. | `router.js:51-92` |
| F10 | **The good pattern exists and is unused by the canvas/header.** `copyCommand.js:25-26` shows the exact `.sr-only` + `aria-live="polite"` + `role="status"` idiom to reuse. | `lib/copyCommand.js:25-26` |

---

## Preconditions

- Branch off `main`. Files touched: `web/index.html`; `web/styles.css`; `web/cinema-core/app.js`; `web/cinema-core/renderer.js`; `web/lib/header.js`; `web/lib/router.js`; **NEW** `web/lib/mobileNav.js`; plus new tests under `web/test/`.
- Baseline green: `go test ./...` and `node --test web/test/*.mjs` (CI runs both — `.github/workflows/ci.yml`).
- **Coordinate with RUNBOOK-05 first.** If RUNBOOK-05 Task 8 has landed, `renderer.js` already has a `matchMedia` hook and an idle-pause loop — Task 4 below extends it rather than duplicating. Grep `matchMedia` in `web/cinema-core/renderer.js` before writing Task 4; if present, reuse `this.reduceMotion`.
- **Coordinate with RUNBOOK-03.** Do not change connection-status *copy* in Task 5; only add the live-region attributes and the announcement throttle.
- Tooling: add `@axe-core/cli` (or `axe-core` + a jsdom harness) as a **devDependency only**; the SPA must keep loading over `file://` and the Go embed with **no runtime dependency** added. axe runs in CI/dev, never ships.
- Do not introduce a bundler. All new JS is plain ESM loaded the same way as `lib/*.js`.

---

## Task 1 — Skip link (WCAG 2.4.1 Bypass Blocks)

**Files & anchors:** `web/index.html:9-11` (open of `<body>` / `<header>`); `web/styles.css` (add near the `.sr-only` block at `:9178` and the `:focus-visible` system at `:7577-7593`).

**Steps (code-level).**

1. In `index.html`, make the skip link the **first child of `<body>`**, before `<header>` (`:11`). It must target the existing content container `#view-container` (`:91`):

```html
<body>

<a class="skip-link" href="#view-container">Skip to content</a>

<header>
```

2. `#view-container` (`index.html:91`) is a `<div>` and is not focusable by default, so `href="#view-container"` will scroll but may not move *focus* in all browsers. Add `tabindex="-1"` to it so the skip target reliably receives focus (also reused by Task 8):

```html
<div id="view-container" tabindex="-1"></div>
```

3. Add the CSS. Visually hidden until focused, then pinned top-left over the header. Place it next to `.sr-only` (`styles.css:9178`) and reuse the established focus-ring tokens from `:7577-7593`:

```css
/* Skip link — WCAG 2.4.1. Off-screen until focused, then pinned. */
.skip-link {
  position: absolute;
  left: 8px;
  top: -48px;                      /* hidden above the viewport */
  z-index: 1000;
  padding: 10px 16px;
  background: var(--accent);
  color: var(--bg);
  font-weight: 600;
  border-radius: 8px;
  text-decoration: none;
  transition: top 0.12s ease-out;
}
.skip-link:focus {
  top: 8px;                        /* slides into view on Tab */
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 24%, transparent);
}
@media (prefers-reduced-motion: reduce) {
  .skip-link { transition: none; }
}
```

**Why.** WCAG 2.4.1 requires a mechanism to bypass blocks of content repeated across pages. The header (logo + 8 nav + search + mode + identity + theme) is repeated on every view; without a skip link a keyboard user re-traverses ~14 stops per navigation (F2).

**Verify.**
- Load the app, press <kbd>Tab</kbd> once from a fresh page: the "Skip to content" pill must appear top-left.
- Press <kbd>Enter</kbd>: focus must jump to `#view-container` (verify `document.activeElement.id === 'view-container'`).
- axe-core: "bypass" rule passes.

**Acceptance.** First <kbd>Tab</kbd> reveals the skip link; activating it moves focus into the view; axe `bypass` rule green. **(2.4.1)**

---

## Task 2 — Cinema canvas: ARIA + text alternative + live region (WCAG 1.1.1 Non-text Content)

**Files & anchors:** `web/cinema-core/app.js:43-51` (DOM skeleton — `stage`/`canvas` creation, the **canonical** place every Cinema surface builds its canvas, so the fix lands once for full/nexus/embed/proof). `lib/cinemaMount.js` is **not** edited for the canvas element itself — it never creates the canvas; it delegates to `mountCinema` (`cinemaMount.js:124-129`). If a per-surface label is desired, pass it through `options` and read it in `app.js`.

**Steps (code-level).**

1. In `mountCinema` (`app.js:43-51`), give the canvas `role`, label, and roledescription right after it is created:

```js
const stage = el('div', 'cinema-stage');
const canvas = document.createElement('canvas');
canvas.id = 'cinema-canvas';
canvas.className = 'cinema-canvas';
canvas.setAttribute('role', 'application');
canvas.setAttribute('aria-roledescription', 'Interactive proof graph');
canvas.setAttribute('aria-label',
  (options.ariaLabel) ||
  'Cinema proof graph. Use arrow keys to move between nodes, Enter to select, Escape to deselect.');
canvas.setAttribute('tabindex', '0');           // focusable — see Task 3
stage.appendChild(canvas);
```

   `role="application"` is deliberate: the canvas implements its own keyboard model (Task 3), so it should take arrow keys rather than have the SR intercept them. The `aria-roledescription` gives AT a human label ("Interactive proof graph") instead of the generic "application".

2. **Off-screen live region.** Reusing the `copyCommand.js:25-26` idiom, create a polite live region inside `stage` (so it is scoped to the Cinema and destroyed with it). It announces the selected/focused node:

```js
const cinemaLive = el('span', 'sr-only');
cinemaLive.id = 'cinema-live';
cinemaLive.setAttribute('aria-live', 'polite');
cinemaLive.setAttribute('role', 'status');
stage.appendChild(cinemaLive);
```

   Wire it to the renderer's existing `nodeSelected` event (the same event the details panel already consumes at `app.js:89`):

```js
renderer.on('nodeSelected', (n) => {
  details.showNode(n);
  cinemaLive.textContent = describeNode(n);
});
```

   Add the `describeNode` helper near the other `app.js` helpers. Map the node's `kind`/`status`/`label` to a sentence (the kinds come from `cinemaMount.graphToScene`: `plan_step`, `outcome`, `dependency`):

```js
function describeNode(n) {
  if (!n) return '';
  const kind = (n.kind || 'node').replace(/_/g, ' ');
  const label = n.label || n.id || 'unlabeled';
  const status = n.status ? (', status ' + n.status) : '';
  return 'Selected: ' + kind + ' ' + label + status + '.';
}
```

3. **Accessible parallel DOM (the text alternative for 1.1.1).** A canvas is opaque to AT; WCAG 1.1.1 requires a text alternative that conveys the same information. Render a visually-hidden list of the scene's nodes and edges alongside the canvas, rebuilt whenever the scene is set. Add a builder in `app.js` and call it from wherever the scene is assigned to the renderer (the `mountCinema` data-source resolution, `app.js:95-96`, and on any subsequent `setScene`):

```js
const cinemaAlt = el('div', 'sr-only');
cinemaAlt.id = 'cinema-alt';
cinemaAlt.setAttribute('role', 'group');
cinemaAlt.setAttribute('aria-label', 'Proof graph contents (text alternative)');
stage.appendChild(cinemaAlt);

function renderCinemaAlt(scene) {
  cinemaAlt.replaceChildren();
  if (!scene) return;
  const nodes = Array.isArray(scene.nodes) ? scene.nodes : Object.values(scene.nodes || {});
  const edges = Array.isArray(scene.edges) ? scene.edges : Object.values(scene.edges || {});

  const nh = el('h3'); nh.textContent = 'Nodes (' + nodes.length + ')';
  cinemaAlt.appendChild(nh);
  const ul = document.createElement('ul');
  for (const n of nodes) {
    const li = document.createElement('li');
    li.textContent = (n.kind || 'node').replace(/_/g, ' ') + ': ' +
      (n.label || n.id) + (n.status ? (' — ' + n.status) : '');
    ul.appendChild(li);
  }
  cinemaAlt.appendChild(ul);

  const eh = el('h3'); eh.textContent = 'Dependencies (' + edges.length + ')';
  cinemaAlt.appendChild(eh);
  const el2 = document.createElement('ul');
  for (const e of edges) {
    const li = document.createElement('li');
    li.textContent = (e.fromNodeId || e.from) + ' → ' + (e.toNodeId || e.to) +
      (e.label ? (' (' + e.label + ')') : '');
    el2.appendChild(li);
  }
  cinemaAlt.appendChild(el2);
}
```

   Call `renderCinemaAlt(scene)` at mount (after the scene is resolved) and inside the renderer's scene-set path (Nexus remounts via `mountNexusCinema` → `mountCinema`, so the alt DOM rebuilds with each remount).

**Why.** WCAG 1.1.1: non-text content (the canvas drawing) needs a text alternative that serves the equivalent purpose. The parallel node/edge list lets a SR user perceive the graph structure; the live region announces interaction results. `role="application"` + `aria-roledescription` give the surface a meaningful identity instead of "canvas, blank". This mirrors the `TrustBoundaryMap` `<dl>` idiom (`TrustBoundaryMap.js:63-71`) — real semantic content for AT.

**Verify.**
- Inspect the DOM after mount: `#cinema-canvas[role=application][aria-label]`, `#cinema-live[aria-live=polite]`, `#cinema-alt` populated with `<ul>` of nodes/edges.
- Select a node by mouse: `#cinema-live` text updates to "Selected: …".
- NVDA/VoiceOver: navigating into `#cinema-alt` reads the node and edge lists.
- axe-core: no "canvas missing alternative"-class violations; `aria-*` attributes valid.

**Acceptance.** The canvas exposes `role`/`aria-label`/`aria-roledescription`; a populated text-alternative list of nodes and edges exists in the DOM; selection updates a polite live region. **(1.1.1, 4.1.2)**

---

## Task 3 — Keyboard node navigation (WCAG 2.1.1 Keyboard)

**Files & anchors:** `web/cinema-core/renderer.js:18-43` (constructor state), `:531-571` (`setupInteraction`), and the render path `:325-341` (focus-ring draw). Builds on the `tabindex="0"` added in Task 2.

**Steps (code-level).**

1. **State.** In the constructor (`renderer.js:24`, next to `selectedNode`), add a focused-index cursor and a flag for whether to paint the keyboard focus ring:

```js
this.selectedNode = null;
this.focusedNodeIndex = -1;   // index into the ordered node list
this.focusVisible = false;    // true only after keyboard focus, for the ring
```

2. **An ordered node accessor.** The scene stores nodes as an array or object (`hitTestNode` already normalizes via `Array.isArray ? : Object.values`, `:579-580`). Add a helper so keyboard order is stable:

```js
orderedNodes() {
  if (!this.sceneGraph || !this.sceneGraph.nodes) return [];
  const n = this.sceneGraph.nodes;
  return Array.isArray(n) ? n : Object.values(n);
}
```

3. **Keyboard handler.** Extend `setupInteraction` (`renderer.js:531-571`) — add after the existing `mouseleave` binding at `:570`:

```js
this.canvas.addEventListener('focus', () => {
  this.focusVisible = true;
  // Land focus on the current selection, else the first node.
  if (this.focusedNodeIndex < 0) {
    const nodes = this.orderedNodes();
    const sel = nodes.findIndex((n) => n.id === this.selectedNode);
    this.focusedNodeIndex = sel >= 0 ? sel : (nodes.length ? 0 : -1);
  }
});
this.canvas.addEventListener('blur', () => { this.focusVisible = false; });

this.canvas.addEventListener('keydown', (e) => {
  const nodes = this.orderedNodes();
  if (!nodes.length) return;
  const last = nodes.length - 1;
  let handled = true;

  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'Tab':
      if (e.key === 'Tab' && e.shiftKey) {            // let Shift+Tab leave the canvas
        handled = false; break;
      }
      if (e.key === 'Tab' && this.focusedNodeIndex >= last) {
        handled = false; break;                       // Tab past the last node → exit canvas
      }
      this.focusedNodeIndex = Math.min(last, this.focusedNodeIndex + 1);
      this.focusVisible = true;
      this.centerOnFocusedNode();
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      this.focusedNodeIndex = Math.max(0, this.focusedNodeIndex - 1);
      this.focusVisible = true;
      this.centerOnFocusedNode();
      break;
    case 'Home':
      this.focusedNodeIndex = 0; this.focusVisible = true; this.centerOnFocusedNode(); break;
    case 'End':
      this.focusedNodeIndex = last; this.focusVisible = true; this.centerOnFocusedNode(); break;
    case 'Enter':
    case ' ':                                          // Space
      {
        const node = nodes[this.focusedNodeIndex];
        if (node) { this.selectedNode = node.id; this.emit('nodeSelected', node); }
      }
      break;
    case 'Escape':
      this.selectedNode = null;
      this.emit('nodeSelected', null);                 // clears the live region (Task 2)
      break;
    default:
      handled = false;
  }
  if (handled) e.preventDefault();                     // arrows must not scroll the page
});
```

   `case ' '` and the arrow keys call `e.preventDefault()` so the canvas, not the page, consumes them. `Tab` is intentionally **not** prevented at the boundaries so the user can leave the canvas naturally (forward off the last node, backward off the first).

4. **Pan to the focused node.** Add `centerOnFocusedNode` so keyboard movement keeps the active node on screen (the camera math mirrors `hitTestNode`, `:575-577`):

```js
centerOnFocusedNode() {
  const nodes = this.orderedNodes();
  const node = nodes[this.focusedNodeIndex];
  if (!node || !node.position) return;
  this.camera.x = -node.position.x * this.camera.zoom;
  this.camera.y = -node.position.y * this.camera.zoom;
  // Announce focus move even before selection, so SR users track position.
  this.emit('nodeFocused', node);
}
```

   In `app.js`, mirror `nodeFocused` to the same live region as selection (Task 2), with a "Focused:" verb instead of "Selected:":

```js
renderer.on('nodeFocused', (n) => {
  cinemaLive.textContent = n ? ('Focused: ' + describeNode(n).replace(/^Selected: /, '')) : '';
});
```

5. **Visible focus ring.** In the node draw loop (`renderer.js:325-341`), after the radius is computed (`:341`), paint a ring on the focused node when `focusVisible` is set. Insert right before the node's own fill:

```js
const nodes = this.orderedNodes();
const isFocused = this.focusVisible && nodes[this.focusedNodeIndex] &&
                  nodes[this.focusedNodeIndex].id === node.id;
if (isFocused) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(nx, ny, radius + 6, 0, Math.PI * 2);
  ctx.lineWidth = 3 / this.camera.zoom;
  ctx.strokeStyle = '#8F82FF';                         // --accent; matches the DOM focus ring
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.restore();
}
```

   (Use `nx`/`ny` — the shake-adjusted center already computed at `:352-353`.)

**Why.** WCAG 2.1.1: all functionality must be operable through a keyboard. Selection was mousedown-only (F4); now Tab focuses the canvas, arrows/Home/End move a focus cursor, Enter/Space select, Escape deselects, and the camera follows so the focused node is visible. The visible focus ring satisfies 2.4.7 (Focus Visible) on the canvas.

**Verify.**
- Tab to the canvas: a focus ring appears on a node (first or current selection).
- Arrow keys move the ring node-to-node and the camera follows; Home/End jump to first/last.
- Enter/Space fires selection (details panel opens, live region says "Selected: …").
- Escape deselects (live region clears).
- Shift+Tab from the first node, or Tab past the last, leaves the canvas to the next/prev control.
- Page does not scroll while arrow keys are pressed inside the canvas.

**Acceptance.** Every canvas interaction reachable by mouse is reachable by keyboard; focus is visible; no keyboard trap (you can Tab in and out). **(2.1.1, 2.1.2, 2.4.7)**

---

## Task 4 — Canvas reduced-motion via JS `matchMedia` (WCAG 2.3.3 Animation from Interactions)

**Files & anchors:** `web/cinema-core/renderer.js:18-43` (constructor), `:167-181` (rAF loop), `:334` (entry overshoot), `:338` (pulse), `:348-351` (quarantine shake), `:356-364` (anomaly glow). **Coordinate with RUNBOOK-05 Task 8** (idle-loop / shared `matchMedia` hook) — if it has landed, reuse its `this.reduceMotion`; do not add a second media query.

**Steps (code-level).**

1. **Read and subscribe.** In the constructor (`renderer.js:18-43`), before `this.startAnimationLoop()` at `:42`:

```js
this.reduceMotion = false;
if (typeof window !== 'undefined' && window.matchMedia) {
  this._mqlReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  this.reduceMotion = this._mqlReduce.matches;
  this._onReduceChange = (e) => { this.reduceMotion = e.matches; };
  // addEventListener is the modern API; addListener is the Safari<14 fallback.
  if (this._mqlReduce.addEventListener) this._mqlReduce.addEventListener('change', this._onReduceChange);
  else if (this._mqlReduce.addListener) this._mqlReduce.addListener(this._onReduceChange);
}
```

2. **Freeze the animation clock.** In `startAnimationLoop` (`:167-181`), only advance `particlePhase` when motion is allowed — this single guard kills pulse, shake, anomaly glow, and edge particles in one place because they are all functions of `particlePhase`:

```js
const loop = () => {
  this.render();
  if (!this.reduceMotion) this.particlePhase += 0.02;   // was: unconditional (:170)
  this.frameCount++;
  // … fps bookkeeping unchanged …
  this.animationFrame = requestAnimationFrame(loop);
};
```

   With `particlePhase` frozen: pulse (`:338`, `Math.sin(particlePhase*3)` → constant), shake (`:348-351` → constant 0-offset only if also guarded — see step 3), anomaly glow (`:356-364`, `Math.sin(particlePhase*4)` → constant), and edge particles (`:482`, `(particlePhase*speed+…)` → constant) all stop oscillating.

3. **Hard-disable the discrete motion sources** so they do not freeze mid-shake. Guard the quarantine shake (`:348-351`):

```js
let sx = 0, sy = 0;
if (node.quarantined && !isGhost && !this.reduceMotion) {   // + !this.reduceMotion
  sx = 3 * Math.sin(this.particlePhase * 20) * Math.cos(this.particlePhase * 7);
  sy = 3 * Math.sin(this.particlePhase * 23) * Math.sin(this.particlePhase * 11);
}
```

   Guard the entry overshoot bounce (`:334`) — under reduced motion, snap to final scale (no back-ease, no bounce):

```js
const entryScale = this.reduceMotion
  ? 1
  : (entryT < 1 ? entryT * (2.7 * entryT * entryT - 1.7 * entryT + 1) : 1);
```

   (Leaving `entryAlpha` at `:335` is fine — a fade-in is not "motion"; but if RUNBOOK-05's idle-pause already snaps entry, defer to it.)

4. **Clean up the listener** in `destroy()` (`renderer.js:655-657`) — currently it only cancels the rAF, which is itself a known leak target (RUNBOOK-05 F10). Add the media-query teardown:

```js
destroy() {
  if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
  if (this._mqlReduce && this._onReduceChange) {
    if (this._mqlReduce.removeEventListener) this._mqlReduce.removeEventListener('change', this._onReduceChange);
    else if (this._mqlReduce.removeListener) this._mqlReduce.removeListener(this._onReduceChange);
  }
}
```

**Why.** WCAG 2.3.3: motion triggered by interaction/auto-update must be disable-able; respecting `prefers-reduced-motion` is the accepted mechanism. The CSS guard (`styles.css:5568-5574`) cannot touch canvas paint (F5), so the renderer must read the media query in JS (roadmap §86). Subscribing to `change` means a user who flips the OS setting mid-session gets the new behavior without reload.

**Verify.**
- Enable "Reduce motion" at the OS level (or DevTools → Rendering → Emulate `prefers-reduced-motion: reduce`). Reload Cinema: nodes are static — no pulse, no shake on quarantined nodes, no glow flicker, no entry bounce; particles do not travel.
- Toggle the emulation off at runtime: motion resumes within one frame (proves the `change` subscription).
- `node --test web/test/cinema_reduced_motion_smoke.mjs` (new — see Test plan) asserts `particlePhase` does not advance when `reduceMotion` is forced true.

**Acceptance.** With `prefers-reduced-motion: reduce`, the canvas runs no oscillating or bouncing animation; toggling the setting updates behavior live; the listener is removed on `destroy`. **(2.3.3)**

---

## Task 5 — Status announcements (WCAG 4.1.3 Status Messages)

**Files & anchors:** `web/index.html:65-71` (status + block-height markup); `web/lib/header.js:143-157` (`initBlockHeight`). **RUNBOOK-03 owns the connection-status copy/polling** — Task 5 adds only the live-region attributes and a throttle.

**Steps (code-level).**

1. **Mark the regions polite-live in markup.** Edit `index.html:65-71`:

```html
<div class="status-indicator" aria-live="polite" aria-atomic="true">
  <span class="status-dot" id="statusDot" aria-hidden="true"></span>
  <span id="statusText">Connected</span>
</div>
<div class="block-height-display" id="blockHeightDisplay" aria-live="polite" aria-atomic="true">
  Block <span id="headerBlockHeight">-</span>
</div>
```

   - `aria-live="polite"` on the wrapper means any text change inside is announced without stealing focus (4.1.3).
   - `aria-atomic="true"` makes the SR read the whole region ("Block 12345") rather than just the changed number.
   - `aria-hidden="true"` on `#statusDot` stops the SR announcing the decorative dot; the meaning is carried by `#statusText`.

2. **Throttle block-height announcements.** `initBlockHeight` (`header.js:143-157`) polls every 8s and writes every observed height; announcing every tick is noise. Announce only the **first** value and **significant jumps**. Replace the write at `header.js:150`:

```js
function initBlockHeight() {
  const el = document.getElementById('headerBlockHeight');
  if (!el) return;
  let lastAnnounced = null;
  const region = document.getElementById('blockHeightDisplay');

  const poll = async () => {
    try {
      const h = await rpcWithDisclosure('nexus.operateHealth', {});
      const bh = h && h.network ? h.network.blockHeight : undefined;
      if (bh === undefined || bh === null) return;
      el.textContent = String(bh);                         // visual update every tick (unchanged cadence)
      // Announce first value, or a jump of >= 1 block, but at most once per poll.
      if (region && (lastAnnounced === null || Number(bh) !== Number(lastAnnounced))) {
        lastAnnounced = bh;
        // The aria-live region re-announces because textContent changed above.
      }
    } catch (_) { /* keep last value */ }
  };
  poll();
  setInterval(poll, 8000);
}
```

   Because the live region is `aria-atomic` on the wrapper and the polling cadence is already 8s, the height is naturally throttled to one announcement per change per 8s — no extra timer needed. If RUNBOOK-03 polls connection status faster than block height, ensure connection changes are debounced to ~1s in *that* runbook so rapid flapping ("Reconnecting"/"Connected") does not spam the SR.

3. **Connection status copy (RUNBOOK-03 boundary).** RUNBOOK-03 sets `#statusText` to `"Connected"` / `"Reconnecting…"` / `"Offline"` and toggles `#statusDot` classes. With the `aria-live="polite"` wrapper from step 1, each text change is announced automatically — RUNBOOK-03 needs no extra ARIA code, only to keep writing `#statusText.textContent`. Document this dependency in both PRs.

**Why.** WCAG 4.1.3: status messages (connection state, chain progress) must be programmatically determinable and presented to AT without moving focus. `aria-live="polite"` on the existing regions achieves exactly that; the dot is decorative and is hidden so the announcement stays clean. Reuses the `copyCommand.js:25-26` live-region idiom at the page level.

**Verify.**
- With a SR running, toggle the network (or simulate via the RUNBOOK-03 hook): "Reconnecting", then "Connected"/"Offline" is spoken without focus moving.
- Advance the chain (or stub `operateHealth`): "Block N" is announced on change, not on every identical poll.
- axe-core: `status-indicator` / `blockHeightDisplay` have valid `aria-live`; no "aria-hidden focusable" issues on the dot.

**Acceptance.** Connection-state transitions and block-height changes are announced politely (no focus theft, no spam). **(4.1.3)**

---

## Task 6 — Mobile nav collapse (supports 2.1.1, 1.4.10 Reflow)

**Files & anchors:** `web/index.html:18-28` (the `<nav class="header-workspaces">`); `web/styles.css:5124-5147` (the `@media (max-width: 480px)` header block); **NEW** `web/lib/mobileNav.js`; wire-up in `web/app.js` (where other `lib/*` initializers run). Count-agnostic so it works for 8 links today and **6 doors after RUNBOOK-01**.

**Steps (code-level).**

1. **Markup: add a hamburger button** as the first child of the header's `.header-inner` row (`index.html:13`), before the nav. It controls the existing nav by id:

```html
<button type="button" class="nav-toggle" id="navToggle"
        aria-expanded="false" aria-controls="headerWorkspaces"
        aria-label="Menu" hidden>
  <span class="nav-toggle-bar" aria-hidden="true"></span>
  <span class="nav-toggle-bar" aria-hidden="true"></span>
  <span class="nav-toggle-bar" aria-hidden="true"></span>
</button>
```

   Add the id to the existing nav (`index.html:18`):

```html
<nav class="header-workspaces" id="headerWorkspaces" aria-label="Workspaces">
```

   The button is `hidden` by default and only revealed under the breakpoint by CSS (so desktop is unchanged and the button never sits in the desktop tab order).

2. **CSS.** Show the toggle and collapse the nav under 480px. Add to the existing `@media (max-width: 480px)` block (`styles.css:5124-5147`):

```css
@media (max-width: 480px) {
  /* … existing rules … */

  .nav-toggle {
    display: inline-flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    width: 40px; height: 40px;          /* >=40px tap target */
    padding: 8px;
    background: var(--surface-alt);
    border: 1px solid var(--border-bold);
    border-radius: 8px;
    cursor: pointer;
  }
  .nav-toggle[hidden] { display: none; }  /* JS un-hides via removeAttribute('hidden') */
  .nav-toggle-bar {
    height: 2px; width: 100%;
    background: var(--text);
    border-radius: 2px;
  }

  /* Collapsed by default on phones; nav stacks as a disclosure panel. */
  .header-workspaces {
    display: none;
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    width: 100%;
  }
  .header-workspaces.nav-open { display: flex; }
  .header-workspaces .workspace-link {
    padding: 12px 14px;                  /* full-width, finger-sized rows */
    border-radius: 8px;
  }
  .header-workspaces .workspace-link:hover,
  .header-workspaces .workspace-link.active { background: var(--surface-hover); }
}
.nav-toggle { display: none; }           /* desktop: never shown */
```

3. **JS: `web/lib/mobileNav.js`.** Keyboard-operable, sets `aria-expanded`, closes on link activation, Escape, and outside click:

```js
// Mobile nav disclosure — collapses .header-workspaces under the phone
// breakpoint behind #navToggle. Count-agnostic: works for any number of
// .workspace-link children (8 today, 6 after RUNBOOK-01).
export function initMobileNav() {
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('headerWorkspaces');
  if (!toggle || !nav) return;

  toggle.removeAttribute('hidden');      // CSS still hides it above the breakpoint

  const setOpen = (open) => {
    nav.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  setOpen(false);

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  // Activating a workspace link closes the menu.
  nav.addEventListener('click', (e) => {
    if (e.target.closest('.workspace-link')) setOpen(false);
  });

  // Escape closes and returns focus to the toggle.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });

  // Click outside closes.
  document.addEventListener('click', (e) => {
    if (toggle.getAttribute('aria-expanded') !== 'true') return;
    if (!nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
  });
}
```

   Call `initMobileNav()` from `app.js` alongside the other header initializers (where `header.js`'s init is called).

**Why.** WCAG 1.4.10 (Reflow) and general operability: 8 (or 6) full-width links wrapping into rows on a 390px screen (F7) is a poor, error-prone target field. A standard disclosure with `aria-expanded`/`aria-controls` is keyboard-operable and announces its state. The button is hidden above the breakpoint so desktop tab order and layout are untouched.

**Verify.**
- At ≤480px: the hamburger appears; nav is hidden until toggled.
- Toggle by mouse and by keyboard (Tab to it, Enter/Space): nav opens, `aria-expanded` flips to `true`.
- Activating a link, pressing Escape, or clicking outside closes it; Escape returns focus to the toggle.
- At >480px: no hamburger, nav is the normal horizontal row; toggle not in tab order.
- After RUNBOOK-01 lands (6 doors): same behavior, no code change (count-agnostic).

**Acceptance.** Under the phone breakpoint the nav collapses into a keyboard-operable disclosure with correct `aria-expanded`/`aria-controls`; desktop is unchanged. **(2.1.1, 1.4.10, 4.1.2)**

---

## Task 7 — Contrast re-audit (WCAG 1.4.3 Contrast Minimum)

**Files & anchors:** `web/styles.css:33-34` (`--surface-alt #1B2031`, `--surface-hover #232940`), `:38-45` (text tokens, incl. the `--text-dim` note), and every `--text-dim` usage on a non-darkest surface or hover state.

**The exact token/surface pairs to re-check.** Build a contrast matrix; AA threshold is **4.5:1** for normal text, **3:1** for large text (≥18.66px bold or ≥24px) and for UI component/state boundaries.

| Foreground token | Hex | On surface token | Hex | Documented? | Action |
|---|---|---|---|---|---|
| `--text-dim` | `#8B94BD` | `--bg` / darkest | `#0E1119` | Yes (~5.9:1) | none |
| `--text-dim` | `#8B94BD` | `--surface-alt` | `#1B2031` | Yes (~5.3:1) | confirm with script |
| `--text-dim` | `#8B94BD` | `--surface-hover` | `#232940` | **No** | **re-check — likely ~4.6:1, near the line** |
| `--text-dim` | `#8B94BD` | `--accent-soft` | `#2D2755` | **No** | **re-check (dim text on accent-soft chips)** |
| `--text-secondary` | `#9BA4C2` | `--surface-hover` | `#232940` | **No** | re-check (should pass comfortably) |
| `--text-dim` on hover rows | `#8B94BD` | rows that swap to `--surface-hover` on `:hover` | `#232940` | **No** | re-check the *hover* state, not just rest |

**Steps (code-level).**

1. **Enumerate usages.** `grep -n "var(--text-dim)" web/styles.css` and, for each, identify the painted `background` (walk up to the nearest rule that sets `background`/`background-color`, including `:hover` rules such as `styles.css:1764` `.spine-table tbody tr:hover { background: var(--surface-alt); }`). Record the (fg hex, bg hex) pair.

2. **Compute ratios** with a tiny script (no runtime dependency; dev-only). Add `web/test/tools/contrast.mjs`:

```js
// Usage: node web/test/tools/contrast.mjs
// Asserts documented dim-text/surface pairs clear WCAG AA (4.5:1).
function srgbToLin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function lum(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}
function ratio(fg, bg) { const a = lum(fg), b = lum(bg); const hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); }

const PAIRS = [
  ['--text-dim on --bg',            '#8B94BD', '#0E1119'],
  ['--text-dim on --surface-alt',   '#8B94BD', '#1B2031'],
  ['--text-dim on --surface-hover', '#8B94BD', '#232940'],
  ['--text-dim on --accent-soft',   '#8B94BD', '#2D2755'],
  ['--text-secondary on --surface-hover', '#9BA4C2', '#232940'],
];
let failed = 0;
for (const [name, fg, bg] of PAIRS) {
  const r = ratio(fg, bg);
  const pass = r >= 4.5;
  console.log((pass ? '  ✓ ' : '  ✗ ') + name + ' = ' + r.toFixed(2) + ':1');
  if (!pass) failed++;
}
process.exit(failed ? 1 : 0);
```

3. **Fix pattern for any pair below 4.5:1** (apply the *first* that holds, in order):
   - **Promote the token on the lighter surface:** swap `var(--text-dim)` → `var(--text-secondary)` (`#9BA4C2`) on rules whose background is `--surface-hover`/`--accent-soft`/hover states. `--text-secondary` is lighter and clears 4.5:1 on all three surfaces — preferred because it touches only the offending rules.
   - **If `--text-dim` itself must stay** (semantic "dim"), lighten the token a step (e.g. `#8B94BD` → `#9098C4`) and re-run the script across *all* surfaces (it must not regress the dark-surface pairs). Update the contrast note at `styles.css:40-42` with the new measured ratios.
   - **Do not** rely on opacity to "dim" — opacity over a textured/gradient background yields an indeterminate effective contrast that axe cannot verify.

4. **Update the documentation comment** (`styles.css:40-42`) to list every surface the token is certified against, with measured ratios, so the next audit is a diff not a rediscovery.

**Why.** WCAG 1.4.3 requires 4.5:1 for normal text. The token is documented only for the darkest surfaces (F8); on `--surface-hover`/`--accent-soft` and hover states the ratio is unverified and `#8B94BD` on `#232940` sits near the 4.5:1 line, so a regression is plausible.

**Verify.**
- `node web/test/tools/contrast.mjs` exits 0 (all enumerated pairs ≥4.5:1).
- axe-core `color-contrast` rule is clean on the top-6 surfaces (Test plan), in all three themes (Aurora/Daylight/Phosphor — Daylight uses the light surface tokens at `styles.css:107-108`, so re-run the matrix with those values too).

**Acceptance.** Every `--text-dim` (and dim-on-hover) pairing on the top surfaces measures ≥4.5:1 in all three themes; the certification comment lists the measured ratios; axe `color-contrast` is green. **(1.4.3)**

---

## Task 8 — Focus management on route change (WCAG 2.4.3 Focus Order)

**Files & anchors:** `web/lib/router.js:51-92` (`activate`), specifically the show/hide at `:59-63`. Reuses the `tabindex="-1"` added to `#view-container` in Task 1 and applies the same to each per-route `view-frame` (`router.js:43-48`).

**Steps (code-level).**

1. **Make each frame focusable.** In the frame-build loop (`router.js:43-47`), add `tabindex="-1"` so a frame can receive programmatic focus without entering the tab order:

```js
const frame = document.createElement('div');
frame.className = 'view-frame';
frame.dataset.route = routeId;
frame.hidden = true;
frame.tabIndex = -1;                 // focus target on activation (2.4.3)
container.appendChild(frame);
```

2. **Move focus on *user-initiated* navigation only.** The tricky part is **not** stealing focus on back/forward, where the user expects the browser's own focus restoration. Distinguish the two: nav-link clicks and in-view `navigateTo` are user-initiated (move focus); `popstate` is back/forward (do **not** force focus). Thread a flag through `activate`:

```js
function activate(routeId, subpath, opts) {
  opts = opts || {};
  if (!routes[routeId]) routeId = defaultRoute;
  const sp = Array.isArray(subpath) ? subpath : [];
  const sameRoute = activeRoute === routeId;
  const sameSubpath = sameRoute && arraysEqual(activeSubpath, sp);
  if (sameRoute && sameSubpath) return;

  for (const { frame } of frames.values()) frame.hidden = true;
  for (const a of navLinks) a.classList.remove('active');

  const entry = frames.get(routeId);
  entry.frame.hidden = false;
  // … existing mount / onSubpathChange logic (:64-86, unchanged) …
  for (const a of navLinks) {
    if (a.dataset.route === routeId) a.classList.add('active');
  }
  activeRoute = routeId;
  activeSubpath = sp;

  // Focus management: land SR/keyboard users in the new content, but only
  // when navigation was user-initiated (not browser back/forward).
  if (opts.moveFocus && !sameRoute) {
    moveFocusToView(entry.frame);
  }
}

function moveFocusToView(frame) {
  // Prefer the view's first heading so the SR announces the content title.
  const heading = frame.querySelector('h1, h2, [role="heading"]');
  const target = heading || frame;
  if (heading && !heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  // Defer to after the view's mount() paints.
  requestAnimationFrame(() => {
    try { target.focus({ preventScroll: false }); } catch (_) { frame.focus(); }
  });
}
```

3. **Pass `moveFocus: true` only from the user paths.** The nav-link click handler (`router.js:105-120`) and `navigateTo` (`:148-155`) are user-initiated:

```js
// nav click (:118):
activate(route, [], { moveFocus: true });

// navigateTo (:154):
activate(route, segs, { moveFocus: true });
```

   Leave the `popstate` handler (`:123-126`) and the initial activation (`:138-139`) **without** the flag — back/forward and first paint should not yank focus (the browser restores focus on history navigation; the skip link covers first paint).

   `hashchange` (`router.js:132-135`) is ambiguous (it fires for both in-app `navigateTo` and manual URL edits). Since `navigateTo` already calls `activate` directly with `moveFocus:true` and only pushes the hash, the subsequent `hashchange` will early-return at the `sameRoute && sameSubpath` guard (`:56`) — no double focus move. Leave `hashchange` without the flag.

**Why.** WCAG 2.4.3 (Focus Order) and the spirit of 2.4.1: after navigating, a keyboard/SR user is still parked on the nav link they clicked (F9) and must hunt for the new content. Moving focus to the view heading announces the new content and places the user at its start. Gating on `moveFocus` respects the convention that back/forward should not steal focus from the browser's restoration.

**Verify.**
- Click a nav link with a SR on: focus lands on the new view's heading and the SR reads it.
- Press browser Back: focus is **not** force-moved into the view (browser restoration applies); no surprise jump.
- Keyboard-only: after activating a nav link, the next Tab continues from inside the new view, not from the header.
- No focus move when re-activating the same route (guard at `:56`).

**Acceptance.** User-initiated navigation moves focus to the new view's heading/container; back/forward does not force focus; same-route re-activation is a no-op. **(2.4.3)**

---

## Test plan

### A. axe-core automated run (top 6 surfaces, all 3 themes)

Run axe-core against the six highest-traffic surfaces, in each theme (Aurora/Daylight/Phosphor — theme buttons at `index.html:75-77`):

1. **Cockpit** (`#/spine`) — default landing.
2. **Studio** (`#/compose`) — forms-heavy.
3. **Atlas** (`#/govern`) — the governance graph + Cinema mount.
4. **Verifier** (`#/prove`) — drop-zone + proof receipt.
5. **Inbox** (`#/inbox`) — list/badges.
6. **Any view that mounts Cinema** (intent execute view) — canvas-bearing.

Add `web/test/a11y_axe_smoke.mjs` (jsdom + `axe-core`, dev-only) that loads each route's mounted DOM and asserts **zero** violations of: `bypass`, `color-contrast`, `aria-allowed-attr`, `aria-required-attr`, `aria-valid-attr-value`, `button-name`, `link-name`, `label`, `aria-hidden-focus`, `landmark-unique`. Fence name: **`a11y_axe_smoke.mjs`**.

> Note: axe in jsdom cannot evaluate canvas pixels — canvas keyboard/motion behavior is covered by the renderer smoke tests and the manual walk-through, not axe.

### B. Manual keyboard walk-through script (no mouse)

Run start-to-finish with the mouse unplugged:

1. Fresh load → press <kbd>Tab</kbd> once → **skip link appears** → <kbd>Enter</kbd> → focus in `#view-container`. *(Task 1)*
2. <kbd>Shift</kbd>+<kbd>Tab</kbd> back to header; Tab through nav → confirm each link is reachable and shows a focus ring (`styles.css:7582-7593`).
3. Resize to 390px → Tab to the **hamburger** → <kbd>Enter</kbd> opens the menu (`aria-expanded=true`) → arrow/Tab through links → <kbd>Esc</kbd> closes, focus returns to toggle. *(Task 6)*
4. Navigate to a Cinema view → Tab until the **canvas** takes focus (ring on a node) → <kbd>→</kbd>/<kbd>←</kbd>/<kbd>Home</kbd>/<kbd>End</kbd> move the focus ring, camera follows → <kbd>Enter</kbd> selects (details open) → <kbd>Esc</kbd> deselects → Tab leaves the canvas to the next control (no trap). *(Tasks 2, 3)*
5. Click a nav link → confirm focus lands on the new view's heading; press Back → confirm focus is **not** force-moved. *(Task 8)*
6. Confirm page does **not** scroll while arrow-navigating inside the canvas. *(Task 3)*

### C. Screen-reader checklist (NVDA on Windows + VoiceOver on macOS)

- [ ] Skip link is announced as "Skip to content, link" on first Tab. *(2.4.1)*
- [ ] Canvas is announced as "Interactive proof graph, application" (the `aria-roledescription`); arrowing announces "Focused: plan step <label>, status <…>"; Enter announces "Selected: …". *(1.1.1, 4.1.2)*
- [ ] Browsing the page in reading mode, the **node/edge text-alternative list** (`#cinema-alt`) is readable under "Proof graph contents". *(1.1.1)*
- [ ] Connection state change is spoken ("Reconnecting", "Connected", "Offline") without focus moving. *(4.1.3)*
- [ ] Block-height change is spoken once per change, not per poll. *(4.1.3)*
- [ ] Hamburger announces "Menu, button, collapsed/expanded". *(4.1.2)*
- [ ] Navigating to a new view, the SR reads the new view's heading. *(2.4.3)*
- [ ] With OS "reduce motion" on, no audible/visible churn from the canvas; with it off, motion resumes. *(2.3.3)*

### D. New `web/test/` additions (fence names)

- **`a11y_axe_smoke.mjs`** — axe-core on the 6 surfaces × 3 themes (Test plan A).
- **`cinema_keyboard_smoke.mjs`** — constructs a `CinemaRenderer` over a stub canvas + a 3-node scene; simulates `focus` then `ArrowRight`/`Enter`/`Escape`; asserts `focusedNodeIndex` advances, `nodeSelected` fires on Enter with the right node, and `selectedNode` clears on Escape. *(Task 3)*
- **`cinema_reduced_motion_smoke.mjs`** — forces `renderer.reduceMotion = true`, runs one loop tick, asserts `particlePhase` is unchanged and entry/shake guards return static values; flips to false and asserts it advances. *(Task 4)*
- **`contrast.mjs`** (under `web/test/tools/`) — the WCAG ratio assertion script from Task 7.
- **`mobile_nav_smoke.mjs`** — jsdom: `initMobileNav()` then assert toggle click flips `aria-expanded` and `.nav-open`, link click + Escape close. *(Task 6)*
- **`router_focus_smoke.mjs`** — assert `activate(route, [], {moveFocus:true})` focuses the frame heading, and `popstate`-path activation does not. *(Task 8)*

All run under the existing CI command `node --test web/test/*.mjs` (`.github/workflows/ci.yml`).

---

## Acceptance criteria (WCAG 2.1 AA, mapped)

| SC | Criterion | Satisfied by | Proof |
|----|-----------|--------------|-------|
| **2.4.1** | Bypass Blocks | Task 1 (skip link) | axe `bypass` green; first-Tab manual check |
| **2.1.1** | Keyboard | Task 3 (canvas keyboard nav), Task 6 (nav toggle) | `cinema_keyboard_smoke.mjs`; manual walk-through |
| **2.1.2** | No Keyboard Trap | Task 3 (Tab in/out of canvas) | manual walk-through step 4 |
| **1.1.1** | Non-text Content | Task 2 (canvas ARIA + text-alternative list) | SR reads `#cinema-alt`; DOM inspection |
| **2.3.3** | Animation from Interactions | Task 4 (JS `matchMedia` reduced-motion) | `cinema_reduced_motion_smoke.mjs`; emulation toggle |
| **4.1.3** | Status Messages | Task 5 (`aria-live` on status + block height) | SR checklist; axe valid-aria |
| **1.4.3** | Contrast (Minimum) | Task 7 (dim-text re-audit) | `contrast.mjs` exits 0; axe `color-contrast` green ×3 themes |
| **2.4.3** | Focus Order | Task 8 (focus to view on nav) | `router_focus_smoke.mjs`; manual step 5 |
| **2.4.7** | Focus Visible | Task 3 (canvas focus ring) + existing `:focus-visible` (`styles.css:7582-7593`) | manual ring check |
| **4.1.2** | Name, Role, Value | Tasks 2, 6 (`role`/`aria-label`/`aria-expanded`) | axe `aria-*` rules green; SR checklist |

**Exit-gate-2 accessibility clause is met when:** axe-core is clean on the 6 surfaces × 3 themes; the manual keyboard walk-through completes mouse-free including full canvas operation; the SR checklist passes on NVDA and VoiceOver; and all six new test fences are green in CI.

---

## Rollback

Each task is independent and individually revertible; nothing here changes data, RPC, or persisted state — all changes are markup, CSS, and view-layer JS.

- **Task 1 (skip link):** remove the `<a class="skip-link">` from `index.html`, the `.skip-link` CSS, and the `tabindex="-1"` on `#view-container`. No dependency.
- **Task 2 (canvas ARIA/alt):** remove the `setAttribute` calls and the `#cinema-live`/`#cinema-alt` elements in `app.js`. The canvas reverts to no-ARIA; no functional regression for mouse users.
- **Task 3 (keyboard nav):** remove the `focus`/`blur`/`keydown` listeners and the focus-ring draw block in `renderer.js`; drop `focusedNodeIndex`/`focusVisible`/`orderedNodes`/`centerOnFocusedNode`. Mouse selection (`:538-548`) is untouched. **Note:** if rolling back Task 3 but keeping Task 2, the canvas `aria-label` still promises arrow-key nav — also remove that sentence from the label.
- **Task 4 (reduced-motion):** revert the `particlePhase` guard, the shake/entry guards, and the constructor/`destroy` `matchMedia` block. Coordinate with RUNBOOK-05 Task 8 — if it shares `this.reduceMotion`, do **not** delete the flag, only this runbook's behavioral guards.
- **Task 5 (status announce):** remove the `aria-live`/`aria-atomic`/`aria-hidden` attributes from `index.html:65-71` and revert `initBlockHeight`. RUNBOOK-03's copy/polling is unaffected.
- **Task 6 (mobile nav):** delete `web/lib/mobileNav.js` and its `app.js` call, remove `#navToggle` markup, the nav `id`, and the `@media` additions. Nav reverts to the wrapping rows (F7) — degraded but functional.
- **Task 7 (contrast):** revert any token swaps / hex changes and the doc comment; delete `web/test/tools/contrast.mjs`.
- **Task 8 (focus on route change):** drop the `moveFocus` opt and `moveFocusToView`; revert `frame.tabIndex`. Router behavior returns to `:51-92` baseline.

Full rollback = `git revert` the runbook's commit range; CI (`go test ./...`, `node --test web/test/*.mjs`) returns to the pre-runbook baseline since all new tests are additive.
