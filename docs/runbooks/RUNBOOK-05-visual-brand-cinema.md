# RUNBOOK-05 — Ship the Brand, Finish the Visual Centerpiece

> **Parent:** [`../nexus-ux-review-2026-06.md`](../nexus-ux-review-2026-06.md) **§4.5** ("Visual — ship the brand, finish the centerpiece"; review line 138–139); supporting evidence **Part 2 / point 5** (review lines 22, 74).
> **Roadmap:** [`RUNBOOK-00`](./RUNBOOK-00-roadmap.md) — Phase 0 item "Load fonts" (roadmap §32, exit-gate 0 "fonts render"); the Cinema + elevation + motion work is Phase 2 (roadmap §54–61, exit-gate 2 "Cinema is sharp on retina, theme-aware, and draws all specified shapes; reduced-motion honored including canvas").
> **Audience:** One IC, end-to-end. Every change has a file, an anchor, and the exact code. No further design decisions required except the one self-host-vs-CDN call in Task 1 (recommendation given).
> **Golden rule for this runbook:** *The brand must physically render, and the namesake (Cinema) must be sharp, theme-true, and honest about its own performance — no "60 FPS" badge bolted onto an unconditional 60fps loop, no teal island ignoring the app's theme.*

---

## Objective

Two things are visibly broken to anyone who opens the product on a modern machine:

1. **The brand never renders.** `Inter` and `JetBrains Mono` are named in the type tokens (`styles.css:75-76`) but **no `@font-face`, no CDN `<link>`, and no `.woff2/.ttf` exist anywhere in the repo**. The "distinctive" identity ships as `system-ui`. (Phase 0, exit-gate-0 blocking.)
2. **The Cinema — the namesake centerpiece — is half-finished and dishonest:** blurry on retina (no `devicePixelRatio`), it paints a `"60 FPS"` HUD over an unconditional 60fps `requestAnimationFrame` loop that never idles / never pauses off-screen, it hardcodes dark colors and so ignores Daylight/Phosphor, it draws only **4 of the 12** vocabulary shapes, its legend swatches are CSS fakes that don't match the canvas, the Nexus-embedded scene is a grid of identical rectangles, and it leaks a `window resize` listener on every remount.

This runbook ships the fonts first (Phase 0), then makes Cinema sharp, idle-friendly, theme-aware, and shape-complete (Phase 2), adds real depth/elevation and a signature TrustBoundaryMap reveal, and lands the motion-performance + touch fixes.

### Exit-gate alignment

**Exit gate 0 (blocking — this runbook owns one line item):** *"…fonts render…"* — **Task 1** is the gate-0 blocker. Tasks 2 and 3 (DPR, kill the FPS HUD) are tiny, ship-with-Task-1 Phase-0 polish (they remove the two most embarrassing "it's broken" tells) but are not themselves gate-0 blockers.

**Exit gate 2 (this runbook owns most of it):** *"Cinema is sharp on retina, theme-aware, and draws all specified shapes; reduced-motion honored including canvas."* — **Tasks 2, 4, 5, 6, 8** directly satisfy it. Task 7 (elevation + TrustBoundaryMap reveal) and Task 9 (touch) are the Phase-2 finish.

**Cross-runbook seams (do not duplicate):**
- **Canvas reduced-motion via JS `matchMedia`** and **canvas keyboard nav / ARIA** are owned by [`RUNBOOK-06`](./RUNBOOK-06-accessibility.md) (roadmap §86: "if canvas/rAF, by a JS `matchMedia` read"). Task 8 here adds the renderer-side `matchMedia` *plumbing hook* and Task 9 adds pointer/touch; coordinate the exact ARIA/keyboard surface in RUNBOOK-06.
- The **7-stage spine hero + single `STAGES` source** is owned by [`RUNBOOK-02`](./RUNBOOK-02-cockpit-spine-hero.md). Task 7's stage-spotlight reads the spine-stage tokens (`styles.css:58-66`) but does not re-home `STAGES`.

---

## Verified findings (confirmed against source — cite these in the PR description)

| # | Finding | Evidence (file:line) |
|---|---------|----------------------|
| F1 | `--font: 'Inter', …` / `--mono: 'JetBrains Mono', …` are declared but **never loaded**. No `@font-face` (grep `@font-face` → 0 hits), no CDN/preconnect (`index.html:7` is the only stylesheet link; no font `<link>`), no `.woff2/.ttf/.otf` in the repo (glob → 0 hits). Ships as `system-ui`. | `styles.css:75-76`; `index.html:7` |
| F2 | The Go embed **already ships `web/fonts/`** the moment the files exist: `//go:embed all:web` (`assets.go:26`) walks the whole tree, and `contentTypeFor` already returns `font/woff2` (`assets.go:116`). **No Go change is required** — only add the files + the CSS. | `assets.go:26,116` |
| F3 | `resizeCanvas` sets `canvas.width/height` to **CSS pixels** with no `devicePixelRatio` and no `ctx.scale` — blurry on every retina/HiDPI display. | `renderer.js:45-49` |
| F4 | `drawHUD` paints a literal `"${this.fps} FPS"` counter — debug chrome shipped to operators. | `renderer.js:523-529` |
| F5 | `startAnimationLoop` runs an **unconditional** `requestAnimationFrame` at ~60fps forever: no dirty-flag, no `document.hidden` pause, no `IntersectionObserver`. `requestRender()` is a **no-op** comment. A backgrounded / off-screen Cinema still burns a full core. | `renderer.js:163-165` (no-op), `:167-181` (unconditional loop) |
| F6 | Background, edge labels, gas labels, and node labels are **hardcoded** (`#0a0a1a`/`#0e0e24`, `#fff`, `#f0a030`, `rgba(204,204,204,…)`). Cinema is invisible/wrong in Daylight and Phosphor. The chrome tokens (`cinemaTokens.css`) are a **separate** palette (`--cinema-accent: #5cd4e4` teal) that never reconciles with the app accent (`--accent`, violet). | `renderer.js:188-192,283,293,467`; `cinemaTokens.css:10,17` |
| F7 | `drawGraph` implements only `hexagon`, `diamond`, `rectangle`, else-`circle` — **4 of 12** shapes (`SHAPES` has `circle, hexagon, shield, diamond, rectangle, gauge, star, gate, document, arrow, octagon, pentagon`). `shield/gauge/star/gate/document/arrow/octagon/pentagon` all silently fall through to a circle. | `renderer.js:415-423`; `visualVocabulary.js:108-121` |
| F8 | `cinemaMount.graphToScene` hardcodes `shape: 'rectangle'` on every step node and one `'circle'` for the outcome — so the Nexus-embedded Cinema is a grid of identical rectangles regardless of node kind. | `cinemaMount.js:54,83` |
| F9 | The legend swatches are **CSS-faked shapes** (`border-radius` tricks: diamonds via `rotate(45deg)`, "hexagons" via `border-radius:3px`) that do not match the canvas glyphs. | `legend.js:51-57`; `cinema-core/styles.css:126-129` |
| F10 | `destroy()` only cancels the rAF; the `window.addEventListener('resize', …)` registered in the constructor (anonymous arrow) is **never removed** → leaks one live resize handler per mount/remount (Nexus remounts on every intent change via `mountCinema`). | `renderer.js:40` (add), `:655-657` (destroy) |
| F11 | `setupInteraction` binds `wheel`/`mousedown`/`mousemove`/`mouseup`/`mouseleave` only — **no touch / pointer** events, so pan/zoom is dead on touch devices. | `renderer.js:531-571` |
| F12 | Particles animate the **`left`** property (`@keyframes particle-flow` `0%{left:0%}`→`100%{left:100%}`; same for `strip-particle`) — a layout/paint-bound property, not compositor-friendly. | `styles.css:3703-3708`, `:4238-4243` |
| F13 | 10 `transition: all …` declarations animate every property (incl. layout) instead of `transform`/`opacity`/`color`. | `styles.css:348,364,479,631,703,877,938,1010,1036,1200` |
| F14 | Infinite pulses run as fast as **0.7s** (`health-badge.frozen`), with `paused` at 1s — fast strobing, accessibility risk. | `styles.css:817-819` (`pulse-badge 1.5s/1s/0.7s infinite`) |
| F15 | The CSS reduced-motion guard exists (`@media (prefers-reduced-motion: reduce)` neutralizes all CSS animation/transition) but **canvas rAF is JS and is not covered** — Cinema keeps animating particles/pulses/shake under reduced-motion. | `styles.css:5568-5574`; `renderer.js` (no `matchMedia`) |
| F16 | `TrustBoundaryMap` ("who proved what") renders a quiet static `<dl>` — no staged reveal, no cinematic proof moment. | `components/TrustBoundaryMap.js:63-71` |

---

## Preconditions

- Branch off `main`. Files touched: **NEW** `web/fonts/*.woff2` + `web/fonts/LICENSE*`; `web/styles.css`; `web/cinema-core/renderer.js`; `web/cinema-core/visualVocabulary.js`; `web/cinema-core/legend.js`; `web/cinema-core/cinemaTokens.css`; `web/cinema-core/styles.css`; `web/lib/cinemaMount.js`; `web/components/TrustBoundaryMap.js`; plus tests under `web/test/` and one Go fence at repo root.
- Baseline green: `go test ./...` and `node --test web/test/*.mjs` (CI runs both — `.github/workflows/ci.yml`). The Cinema DAG smoke (`web/test/cinema_dag_smoke.mjs`) exercises the **step-card** DAG (`web/lib/dagRenderer.js`), *not* the canvas `CinemaRenderer`; the canvas renderer ships with no node test today, so Task 2/4/5/6 add the first `cinema_renderer_smoke.mjs`.
- **Do not** introduce a bundler or a network font fetch at runtime — the SPA loads over `file://` and from the Go embed (`assets.go`). Everything must work self-hosted and offline. This is why Task 1 prefers self-host: a CDN font breaks the offline/portable-proof story.
- Cross-cutting motion convention (roadmap §86): every new animation gated by CSS `@media (prefers-reduced-motion: reduce)` **and**, if canvas/rAF, by a JS `matchMedia` read.

### Recommended execution order

`Task 1` (fonts — Phase 0, independent) → `Task 3` (delete FPS HUD — one line) → `Task 2` (DPR — touches `render()` coordinates that Task 4/5/6 also touch, so land it first) → `Task 4` (idle loop + destroy leak) → `Task 5` (theme tokens) → `Task 6` (12 shapes + scene mapping + legend) → `Task 8` (motion perf, incl. the renderer `matchMedia` hook) → `Task 7` (elevation + TrustBoundaryMap) → `Task 9` (touch). Tasks 2, 4, 5, 6, 8, 9 all edit `renderer.js` — keep them as separate commits but expect to resolve adjacent diffs.

---

## Task 1 — Load the brand fonts (self-host Inter + JetBrains Mono)  *(Phase 0 — exit-gate-0 blocking)*

**Files & anchors:**
- **NEW** `web/fonts/InterVariable.woff2`, `web/fonts/InterVariable-Italic.woff2`, `web/fonts/JetBrainsMono[wght].woff2`, `web/fonts/JetBrainsMono-Italic[wght].woff2` (+ the upstream `OFL.txt` license files).
- `web/styles.css` — add the `@font-face` block **at the very top of the file** (before `:root`, so the faces are registered before first use); the existing tokens at `styles.css:75-76` are then satisfied unchanged.
- `web/index.html:7` — add `<link rel="preload">` for the two fonts actually used above the fold.
- `assets.go` — **no change** (F2): `//go:embed all:web` ships `web/fonts/`, and `contentTypeFor` already returns `font/woff2`.

### Step 1.1 — Drop in the variable woff2 files

Use the upstream variable builds (single file per family covers the whole weight axis — smallest payload, exact-grade control):

- **Inter** — `InterVariable.woff2` + `InterVariable-Italic.woff2` from the official Inter release (`rsms/inter`, `OFL-1.1`). Weight axis `100–900`.
- **JetBrains Mono** — `JetBrainsMono[wght].woff2` + `JetBrainsMono-Italic[wght].woff2` from the JetBrains release (`OFL-1.1`). Weight axis `100–800`.

Place them under `web/fonts/` and copy each family's `OFL.txt` to `web/fonts/Inter-OFL.txt` / `web/fonts/JetBrainsMono-OFL.txt` (OFL requires the license to ship with the binaries — and the repo embeds the whole tree, so the license travels automatically).

> Self-host (not CDN) is the call here: it keeps the Go embed self-contained (F2), satisfies the portable/offline-proof story, and removes a third-party runtime dependency + a `preconnect` round-trip. **Only if** product later mandates a CDN would you add `<link rel="preconnect" href="https://…" crossorigin>` to `index.html` — do not do both.

### Step 1.2 — `@font-face` with `font-display: swap`

Insert at the **top** of `web/styles.css` (line 1, before the `:root{…}` token block):

```css
/* === Brand fonts — self-hosted variable woff2 (shipped via assets.go //go:embed all:web). === */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 100 900;            /* variable weight axis */
  font-display: swap;              /* show fallback immediately, swap when loaded */
  src: url('/fonts/InterVariable.woff2') format('woff2-variations'),
       url('/fonts/InterVariable.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-style: italic;
  font-weight: 100 900;
  font-display: swap;
  src: url('/fonts/InterVariable-Italic.woff2') format('woff2-variations'),
       url('/fonts/InterVariable-Italic.woff2') format('woff2');
}
@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 100 800;
  font-display: swap;
  src: url('/fonts/JetBrainsMono[wght].woff2') format('woff2-variations'),
       url('/fonts/JetBrainsMono[wght].woff2') format('woff2');
}
@font-face {
  font-family: 'JetBrains Mono';
  font-style: italic;
  font-weight: 100 800;
  font-display: swap;
  src: url('/fonts/JetBrainsMono-Italic[wght].woff2') format('woff2-variations'),
       url('/fonts/JetBrainsMono-Italic[wght].woff2') format('woff2');
}
```

> The dual `src` (`woff2-variations` then `woff2`) lets older engines that don't grok the variations hint still load the same file as a static woff2. The `[wght]` brackets in the filename are literal in the JetBrains release; keep the URL exactly matching the on-disk name (or rename the files to avoid the brackets and update both sides). The token references at `styles.css:75-76` (`--font`, `--mono`) need **no change** — they already name `'Inter'` / `'JetBrains Mono'` with `system-ui` fallbacks, which `font-display: swap` now uses during the swap window.

### Step 1.3 — Preload the above-the-fold faces

In `web/index.html`, immediately **before** the stylesheet link at line 7, preload the two faces the first paint actually needs (upright UI + mono); the italics are not above-the-fold, so leave them to lazy `swap`:

```html
<link rel="preload" href="/fonts/InterVariable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/JetBrainsMono[wght].woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css">
```

`crossorigin` is required on `as="font"` preloads even for same-origin (fonts are always fetched in CORS mode); without it the preload is ignored and re-fetched.

**Why:** F1/F2 — the entire visual identity is declared and paid for in tokens but never loaded; the embed already ships and serves woff2, so this is purely "add the files + register the faces."

**Verify:**
- DevTools → Network, hard reload `#/spine`: `InterVariable.woff2` and `JetBrainsMono[wght].woff2` return **200** with `Content-Type: font/woff2` (proves `assets.go:116` path) and **no 404**.
- DevTools → Rendering / Elements → Computed → `font-family` on `body` resolves to **Inter** (not the `system-ui` fallback); a `.mono` element resolves to **JetBrains Mono**.
- `curl -I http://localhost:<port>/fonts/InterVariable.woff2` → `200`, `font/woff2`.
- `go test ./...` — the embed still compiles (the new files are inert assets).

**Acceptance:** `grep -c '@font-face' web/styles.css` ≥ 4; `web/fonts/` contains the four woff2 + both OFL licenses; `index.html` preloads exactly the two upright faces with `crossorigin`; computed `font-family` is Inter/JetBrains Mono on a running build; **no Go source changed**.

---

## Task 2 — Cinema DPR fix (sharp on retina)  *(Phase 0 polish; exit-gate-2 "sharp on retina")*

**Files & anchors:**
- `renderer.js:45-49` — `resizeCanvas` (set device-pixel backing store + CSS box).
- `renderer.js:183-212` — `render()` (reset transform to `dpr` scale; draw in CSS px).
- `renderer.js:104-105` (`fitToView`), `:576-577`/`:594-595` (`hitTestNode`/`hitTestEdge`) — these read `canvas.width/height`; after the change those are **device** px, so switch them to the new CSS-px fields.

### Step 2.1 — `resizeCanvas`: device backing store + CSS box

```js
    resizeCanvas() {
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        const w = this.canvas.parentElement.clientWidth;
        const h = this.canvas.parentElement.clientHeight;
        this.dpr = dpr;
        this.cssWidth = w;            // logical (CSS) px — all drawing uses these
        this.cssHeight = h;
        this.canvas.width = Math.round(w * dpr);   // device px backing store
        this.canvas.height = Math.round(h * dpr);
        this.canvas.style.width = w + 'px';        // keep the CSS box at logical size
        this.canvas.style.height = h + 'px';
        this.requestRender();
    }
```

### Step 2.2 — `render()`: scale the context by `dpr`, draw in CSS px

Replace the head of `render()` (`renderer.js:183-195`) so every draw call works in logical px and the `dpr` scale is applied once via `setTransform`:

```js
    render() {
        const { ctx, camera } = this;
        const w = this.cssWidth, h = this.cssHeight, dpr = this.dpr || 1;

        // Map CSS px → device px for this whole frame (replaces any prior transform).
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        // Background gradient (theme tokens land in Task 5; CSS-px coords here).
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0a0a1a');
        grad.addColorStop(1, '#0e0e24');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.translate(w / 2 + camera.x, h / 2 + camera.y);
        ctx.scale(camera.zoom, camera.zoom);
        // … ghost + main graph unchanged …
        ctx.restore();
        this.drawHUD();   // (Task 3 deletes/gates this)
    }
```

The `save()/restore()` pair returns the context to the `setTransform(dpr,…)` baseline, so `drawHUD` (if kept behind the Task-3 flag) draws crisply in CSS px at `(8,14)`.

### Step 2.3 — Fix the four `canvas.width/height` readers

`fitToView` (`renderer.js:104-105`) and both hit-tests (`renderer.js:576-577`, `:594-595`) currently divide by `this.canvas.width/2` etc. Those are now **device** px, but `getBoundingClientRect()` returns **CSS** px, so the math would be off by `dpr`. Swap each `this.canvas.width` → `this.cssWidth` and `this.canvas.height` → `this.cssHeight` (4 read sites in `fitToView`, 1 pair in each hit-test). Initialize `this.cssWidth/cssHeight/dpr` in the constructor before `resizeCanvas()` runs (they are set inside it, but guard against a 0/undefined first paint by defaulting `this.dpr = 1` in the constructor at `renderer.js:33-37`).

**Why:** F3 — the backing store is CSS-sized, so every glyph and edge is upscaled by the OS. Sizing the buffer by `devicePixelRatio` and scaling the context once gives 1:1 device pixels; keeping all drawing in logical px means camera math, fit-to-view, and hit-testing stay in the same coordinate space as pointer events.

**Verify:** On a retina display (or DevTools device toolbar at DPR 2/3), node labels, edge labels, and the lock glyph are crisp, not fuzzy. Pan/zoom still tracks the cursor exactly (hit-testing unaffected). Resize the window → no blur, no offset. On a DPR-1 display behavior is identical to before.

**Acceptance:** `resizeCanvas` multiplies by `devicePixelRatio` and sets `canvas.style.width/height`; `render()` calls `ctx.setTransform(dpr,0,0,dpr,0,0)`; no remaining `canvas.width`/`canvas.height` reads in `fitToView`/`hitTestNode`/`hitTestEdge` (covered by `cinema_renderer_smoke.mjs`, Test plan §B).

---

## Task 3 — Delete the "60 FPS" HUD (gate behind a debug flag)  *(Phase 0 polish)*

**Files & anchors:** `renderer.js:523-529` (`drawHUD`), called at `renderer.js:211`.

The FPS counter is debug chrome. Gate it behind an explicit opt-in so it never ships to operators but stays available for perf work:

```js
    drawHUD() {
        // Debug-only FPS counter. Opt in with `?cinemaDebug=1` or window.__CINEMA_DEBUG__.
        if (!this._debugHud) return;
        this.ctx.fillStyle = '#444';
        this.ctx.font = '10px monospace';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`${this.fps} FPS`, 8, 14);
    }
```

Set the flag once in the constructor (`renderer.js:33-37`):

```js
        this._debugHud = (typeof window !== 'undefined') && (
            window.__CINEMA_DEBUG__ === true ||
            /[?&]cinemaDebug=1\b/.test(window.location ? window.location.search : '')
        );
```

Keep the `fps` accounting in `startAnimationLoop` only if Task 4 still needs it for the debug HUD; otherwise it falls out naturally (Task 4 removes the per-frame counter from the hot path).

**Why:** F4 — a "60 FPS" badge on the centerpiece reads as an unfinished dev build, and (compounded by F5) it advertises a number produced by a loop that shouldn't be running at 60fps in the first place.

**Verify:** Default load → no FPS text on the canvas. Append `?cinemaDebug=1` → the counter returns. Acceptance: `grep "FPS" web/cinema-core/renderer.js` only appears inside the `_debugHud`-guarded branch.

---

## Task 4 — Idle the render loop + fix the leaked resize listener  *(Phase 2 — exit-gate-2)*

**Files & anchors:**
- `renderer.js:163-165` (`requestRender` no-op), `:167-181` (`startAnimationLoop`), `:39-42` (constructor wiring), `:655-657` (`destroy`).
- Constructor resize add at `renderer.js:40`.

### Step 4.1 — `requestRender`: a real dirty-flag + on-demand scheduler

```js
    requestRender() {
        this._dirty = true;
        if (this._rafScheduled || this._paused) return;
        this._rafScheduled = true;
        this.animationFrame = requestAnimationFrame(this._frame);
    }
```

### Step 4.2 — Replace `startAnimationLoop` with an on-demand frame

The loop now renders only when (a) something marked it dirty (camera/hover/selection/scene change) **or** (b) a live animation is in flight (entry tweens, animated edges, anomaly/breaker pulses, quarantine shake). When neither holds, it stops scheduling frames — the CPU goes to zero — and any `requestRender()` restarts it.

```js
    startAnimationLoop() {
        this._frame = () => {
            this._rafScheduled = false;
            if (this._paused) return;                 // hidden tab / off-screen

            const animating = this.needsContinuousAnimation();
            if (this._dirty || animating) {
                this._dirty = false;
                if (animating) this.particlePhase += 0.02;   // only advance time when needed
                this.render();
                if (this._debugHud) this.tickFps();
            }
            // Keep scheduling only while a live animation is running; otherwise idle.
            if (animating) {
                this._rafScheduled = true;
                this.animationFrame = requestAnimationFrame(this._frame);
            }
        };
        this.requestRender();   // first paint
    }

    // True while any time-driven visual is mid-flight (so we must keep ticking).
    needsContinuousAnimation() {
        if (this._reducedMotion) return false;         // Task 8: matchMedia hook
        const now = performance.now();
        // Entry tweens (500ms node / 300ms edge).
        for (const t of this.nodeEntryTimes.values()) if (now - t < 500) return true;
        for (const t of this.edgeEntryTimes.values()) if (now - t < 300) return true;
        const g = this.sceneGraph;
        if (!g) return false;
        let nodes = g.nodes || g.Nodes || [];
        if (!Array.isArray(nodes)) nodes = Object.values(nodes);
        for (const n of nodes) {
            if (n.quarantined || n.anomalyScore > 0 || n.breakerState || (n.glow || 0) > 0) return true;
        }
        let edges = g.edges || g.Edges || [];
        if (!Array.isArray(edges)) edges = Object.values(edges);
        for (const e of edges) if (e.animated) return true;
        return false;
    }

    tickFps() {
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFPSTime > 1000) {
            this.fps = Math.round(this.frameCount * 1000 / (now - this.lastFPSTime));
            this.frameCount = 0; this.lastFPSTime = now;
        }
    }
```

Every existing mutator already calls `requestRender()` (`setSceneGraph`, `applyUpdate`, `setGhostGraph`, `resetView`, `resizeCanvas`); add `this.requestRender()` to the hover/select/drag branches in `setupInteraction` (Step 4.4) so interaction repaints on demand.

### Step 4.3 — Pause on hidden tab + off-screen (`IntersectionObserver`)

In the constructor (`renderer.js:39-42`), after `this.startAnimationLoop()`:

```js
        // Pause when the tab is hidden.
        this._onVisibility = () => this.setPaused(document.hidden || this._offscreen);
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVisibility);

        // Pause when the canvas scrolls off-screen.
        if (typeof IntersectionObserver !== 'undefined') {
            this._io = new IntersectionObserver((entries) => {
                this._offscreen = !entries[0].isIntersecting;
                this.setPaused((typeof document !== 'undefined' && document.hidden) || this._offscreen);
            }, { threshold: 0.01 });
            this._io.observe(this.canvas);
        }
```

```js
    setPaused(paused) {
        if (paused === this._paused) return;
        this._paused = paused;
        if (!paused) this.requestRender();   // resume → repaint + reschedule if animating
    }
```

### Step 4.4 — `setupInteraction`: repaint on demand

After each state change in the wheel/mousedown/mousemove handlers (`renderer.js:532-567`), call `this.requestRender();` (e.g. after `this.camera.zoom = …`, after setting `this.selectedNode`, after updating `camera.x/y`, after `this.hoveredNode = …`). Without this the dirty-flag loop won't repaint a hover/pan.

### Step 4.5 — `destroy`: stop everything and unleak the resize listener (F10)

The constructor adds the resize listener as an anonymous arrow (`renderer.js:40`) that can't be removed. Bind it once and remove it on destroy:

```js
        // constructor (replace renderer.js:40):
        this._onResize = () => this.resizeCanvas();
        window.addEventListener('resize', this._onResize);
```

```js
    destroy() {
        if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
        this._rafScheduled = false;
        this._paused = true;
        if (this._onResize) window.removeEventListener('resize', this._onResize);
        if (this._onVisibility && typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this._onVisibility);
        }
        if (this._io) { this._io.disconnect(); this._io = null; }
        if (this._mqlHandler && this._mql) {       // Task 8 matchMedia listener
            this._mql.removeEventListener
                ? this._mql.removeEventListener('change', this._mqlHandler)
                : this._mql.removeListener(this._mqlHandler);
        }
    }
```

**Why:** F5 + F10 — an unconditional 60fps loop burns a core per open (and per *leaked-but-still-running* prior mount, because the resize handler keeps a closure alive). Nexus remounts Cinema on every selected-intent change (`cinemaMount.js:123` destroys then `mountCinema` recreates), so the leak compounds. A dirty-flag loop that idles to zero, pauses on hidden/off-screen, and a `destroy` that actually unwinds, makes Cinema a good citizen.

**Verify:**
- Open Cinema with a static scene (no animated edges / breakers): DevTools → Performance → after the entry tweens settle (~0.5s) the main thread goes **idle** (no rAF). Hover a node → one repaint; stop → idle again.
- Background the tab → rAF stops (Performance shows no frames); foreground → resumes.
- Scroll Cinema off-screen (Nexus embed in a long view) → loop pauses; scroll back → resumes.
- Mount → unmount → mount 10× (switch intents in Nexus): `getEventListeners(window).resize` count stays flat (Chrome console), no growth; heap snapshot shows prior `CinemaRenderer` instances are GC'd.

**Acceptance:** `requestRender` sets a dirty flag and schedules a frame; the loop does **not** schedule frames while idle (no animation + not dirty); `document.hidden` and an `IntersectionObserver` both pause it; `destroy` removes the resize + visibilitychange listeners and disconnects the observer. Covered by `cinema_renderer_smoke.mjs` (Test plan §B) asserting a destroyed renderer cancels rAF and removes its window listener.

---

## Task 5 — Theme-aware Cinema (read CSS custom props; reconcile accents)  *(Phase 2 — exit-gate-2 "theme-aware")*

**Files & anchors:**
- `renderer.js:188-192` (bg), `:283` (edge label `#fff`), `:293` (gas label `#f0a030`), `:467` (node label `rgba(204,204,204,…)`).
- `cinema-core/cinemaTokens.css:9-36` — add the missing render tokens and reconcile `--cinema-accent` with the app `--accent`.
- `renderer.js` constructor + a new `readThemeColors()` + a `matchMedia`/theme re-read hook.

### Step 5.1 — Add the render tokens; reconcile the accent

`cinemaTokens.css` is scoped under `.cinema-root`. The app theme lives on `:root[data-theme=…]` (`styles.css:101`, `:5582`), so `.cinema-root` inherits the app tokens (`--accent`, `--bg`, `--text`, the `--spine-*` ramp). Reconcile the teal island with the app accent and expose the four colors the canvas needs, **all falling through to the app tokens** so themes flow automatically:

```css
/* cinemaTokens.css — replace the hardcoded values at :10,:17 and add render tokens. */
.cinema-root {
  /* Inherit the app theme; keep the dark Cinema look as a fallback only. */
  --cinema-bg:   var(--bg-deep, #0a0a1a);
  --cinema-bg-2: var(--bg-alt,  #0e0e24);
  --cinema-accent: var(--accent, #5cd4e4);      /* was #5cd4e4 teal — now follows the app accent */
  --cinema-accent-text: var(--bg, #07212a);

  /* Canvas-only render tokens (consumed by renderer.js via getComputedStyle). */
  --cinema-canvas-bg-top:    var(--bg-deep, #0a0a1a);
  --cinema-canvas-bg-bottom: var(--bg-alt,  #0e0e24);
  --cinema-edge-label:  var(--text, #ffffff);
  --cinema-gas-label:   var(--warn, #f0a030);
  --cinema-node-label:  var(--text-secondary, #cccccc);
  /* … keep the existing status hues (--cinema-normal … --cinema-encrypted) … */
}
```

### Step 5.2 — `readThemeColors()`: resolve the tokens once per theme

The renderer only holds the `<canvas>`; `getComputedStyle(this.canvas)` resolves the inherited custom props from the nearest `.cinema-root`. Cache them and re-read on theme change:

```js
    readThemeColors() {
        const cs = (typeof getComputedStyle !== 'undefined') ? getComputedStyle(this.canvas) : null;
        const get = (name, fallback) => {
            const v = cs ? cs.getPropertyValue(name).trim() : '';
            return v || fallback;
        };
        this.theme = {
            bgTop:    get('--cinema-canvas-bg-top', '#0a0a1a'),
            bgBottom: get('--cinema-canvas-bg-bottom', '#0e0e24'),
            edgeLabel: get('--cinema-edge-label', '#ffffff'),
            gasLabel:  get('--cinema-gas-label', '#f0a030'),
            nodeLabel: get('--cinema-node-label', '#cccccc'),
            accent:    get('--cinema-accent', '#5cd4e4'),
        };
        this.requestRender();
    }
```

Call `this.readThemeColors()` in the constructor (before the first `requestRender`) and wire a re-read on theme change. The app toggles `data-theme` on the `:root` element (`index.html:74-78` theme popover); observe it:

```js
        // Re-read tokens whenever the app theme attribute flips.
        if (typeof MutationObserver !== 'undefined') {
            this._themeObserver = new MutationObserver(() => this.readThemeColors());
            this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        }
```

(Disconnect it in `destroy()` alongside the IntersectionObserver.)

### Step 5.3 — Use the tokens in `render()`/`drawGraph`

- Background (`renderer.js:189-190`): `grad.addColorStop(0, this.theme.bgTop); grad.addColorStop(1, this.theme.bgBottom);`
- Edge label (`renderer.js:283`): `ctx.fillStyle = this.theme.edgeLabel;`
- Gas label (`renderer.js:293`): `ctx.fillStyle = this.theme.gasLabel;`
- Node label (`renderer.js:467`): build with the token's RGB but keep the entry-fade alpha — since labels need a per-node alpha, store the node-label color as `rgba()` by resolving the token to RGB once, or simpler: keep `entryAlpha` as `globalAlpha` for the label draw and set `ctx.fillStyle = this.theme.nodeLabel`. The minimal change preserving the fade:

```js
            if (node.label && entryAlpha > 0.5) {
                ctx.save();
                ctx.globalAlpha = entryAlpha;
                ctx.fillStyle = this.theme.nodeLabel;
                ctx.font = `${Math.max(9, 10 / this.camera.zoom)}px monospace`;
                ctx.textAlign = 'center';
                const label = node.label.length > 20 ? node.label.slice(0, 18) + '..' : node.label;
                ctx.fillText(label, nx, ny + radius + 14);
                ctx.restore();
            }
```

> The node fill/stroke colors come from the **scene** `node.color` RGBA (the vocabulary status hues, `visualVocabulary.js:125-179`) — those are semantic and stay as-is. Only the chrome (bg + label colors) is theme-driven.

**Why:** F6 — Cinema hardcodes a dark palette and a teal accent disjoint from the app's violet `--accent`, so it's unreadable in Daylight, wrong in Phosphor, and visually a different product. Reading the inherited tokens makes the canvas chrome track the active theme, and folding `--cinema-accent` into `--accent` unifies the two design systems.

**Verify:** Switch theme via the header (Aurora → Daylight → Phosphor): the Cinema background, edge/gas/node labels, and accent (panel focus rings, controls) update **without remount**. In Daylight, labels are dark-on-light and legible; in Phosphor, the background goes black and chrome inherits the terminal palette. `--cinema-accent` resolves to the app `--accent` (DevTools → Computed on a `.cinema-root`).

**Acceptance:** No hardcoded `#0a0a1a`/`#0e0e24`/`#fff`/`#f0a030`/`rgba(204,204,204…)` remain in `render()`/`drawGraph`; `renderer.js` reads bg/edge/gas/node/accent via `getComputedStyle`; a `data-theme` change triggers `readThemeColors()`; `cinemaTokens.css` defines `--cinema-accent: var(--accent, …)`.

---

## Task 6 — Render the full 12-shape vocabulary + correct scene shapes + real legend glyphs  *(Phase 2 — exit-gate-2 "draws all specified shapes")*

**Files & anchors:**
- `renderer.js:413-423` — the 4-shape `if/else` in `drawGraph`; add shape path builders near `drawHexagon`/`drawDiamond` (`renderer.js:506-521`).
- `visualVocabulary.js:108-121` (`SHAPES`) + a new exported `shapeForKind(kind)` mapping (single source of truth, reused by `cinemaMount`).
- `cinemaMount.js:42-59` (step nodes) + `:76-85` (outcome) — emit the correct shape per kind.
- `legend.js:51-57` — replace the CSS-fake swatch with a real inline-SVG glyph; remove the fakes at `cinema-core/styles.css:126-129`.

### Step 6.1 — Implement the 8 missing shape path builders

Add beside `drawHexagon`/`drawDiamond` (`renderer.js:521`). Each appends a closed path to the current `ctx` (the caller already did `ctx.beginPath()` and will `fill()`/`stroke()`):

```js
    drawShield(ctx, x, y, r) {
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r * 0.85, y - r * 0.5);
        ctx.lineTo(x + r * 0.85, y + r * 0.25);
        ctx.quadraticCurveTo(x + r * 0.85, y + r * 0.9, x, y + r);
        ctx.quadraticCurveTo(x - r * 0.85, y + r * 0.9, x - r * 0.85, y + r * 0.25);
        ctx.lineTo(x - r * 0.85, y - r * 0.5);
        ctx.closePath();
    }
    drawGate(ctx, x, y, r) {                       // archway / approval gate
        const w = r * 1.5, h = r * 1.4;
        ctx.moveTo(x - w / 2, y + h / 2);
        ctx.lineTo(x - w / 2, y - h / 4);
        ctx.quadraticCurveTo(x, y - h, x + w / 2, y - h / 4);
        ctx.lineTo(x + w / 2, y + h / 2);
        ctx.closePath();
    }
    drawDocument(ctx, x, y, r) {                    // page with a folded corner
        const w = r * 1.3, h = r * 1.6, f = r * 0.5;
        ctx.moveTo(x - w / 2, y - h / 2);
        ctx.lineTo(x + w / 2 - f, y - h / 2);
        ctx.lineTo(x + w / 2, y - h / 2 + f);
        ctx.lineTo(x + w / 2, y + h / 2);
        ctx.lineTo(x - w / 2, y + h / 2);
        ctx.closePath();
    }
    drawArrow(ctx, x, y, r) {                       // right-pointing intent arrow
        const w = r * 1.6, h = r * 1.1;
        ctx.moveTo(x - w / 2, y - h / 4);
        ctx.lineTo(x + w / 6, y - h / 4);
        ctx.lineTo(x + w / 6, y - h / 2);
        ctx.lineTo(x + w / 2, y);
        ctx.lineTo(x + w / 6, y + h / 2);
        ctx.lineTo(x + w / 6, y + h / 4);
        ctx.lineTo(x - w / 2, y + h / 4);
        ctx.closePath();
    }
    drawPolygon(ctx, x, y, r, sides, rot) {        // shared n-gon (octagon=8, pentagon=5)
        const a0 = (rot == null ? -Math.PI / 2 : rot);
        ctx.moveTo(x + r * Math.cos(a0), y + r * Math.sin(a0));
        for (let i = 1; i <= sides; i++) {
            const a = a0 + (2 * Math.PI / sides) * i;
            ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
        }
        ctx.closePath();
    }
    drawStar(ctx, x, y, r) {                        // 5-point star
        const inner = r * 0.45;
        for (let i = 0; i < 10; i++) {
            const rad = (i % 2 === 0) ? r : inner;
            const a = -Math.PI / 2 + (Math.PI / 5) * i;
            const px = x + rad * Math.cos(a), py = y + rad * Math.sin(a);
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
    }
    drawGauge(ctx, x, y, r) {                       // 3/4 arc dial (gas meter)
        ctx.arc(x, y, r, Math.PI * 0.75, Math.PI * 0.25);   // open at bottom
    }
```

### Step 6.2 — Dispatch on shape in `drawGraph`

Replace the `if/else` at `renderer.js:415-423` with a full dispatch (rectangle keeps its non-`beginPath`-path `ctx.rect`, which is fine inside the existing `beginPath()`):

```js
            ctx.beginPath();
            switch (node.shape) {
                case 'hexagon':  this.drawHexagon(ctx, nx, ny, radius); break;
                case 'diamond':  this.drawDiamond(ctx, nx, ny, radius); break;
                case 'shield':   this.drawShield(ctx, nx, ny, radius); break;
                case 'gate':     this.drawGate(ctx, nx, ny, radius); break;
                case 'document': this.drawDocument(ctx, nx, ny, radius); break;
                case 'arrow':    this.drawArrow(ctx, nx, ny, radius); break;
                case 'octagon':  this.drawPolygon(ctx, nx, ny, radius, 8, -Math.PI / 8); break;
                case 'pentagon': this.drawPolygon(ctx, nx, ny, radius, 5); break;
                case 'star':     this.drawStar(ctx, nx, ny, radius); break;
                case 'gauge':    this.drawGauge(ctx, nx, ny, radius); break;
                case 'rectangle': ctx.rect(nx - radius, ny - radius * 0.6, radius * 2, radius * 1.2); break;
                case 'circle':
                default:         ctx.arc(nx, ny, radius, 0, Math.PI * 2); break;
            }
```

> Also update the quarantine dashed-border re-stroke (`renderer.js:441-453`), which currently only re-draws `hexagon`-or-circle, to call the same dispatch (extract a `tracePath(ctx, shape, nx, ny, r)` helper used by both sites) so a quarantined `shield`/`document` gets a shape-correct dashed outline. `drawGauge` is an open arc — for the border re-stroke fall back to a circle for it.

### Step 6.3 — One source of truth: `shapeForKind(kind)`

Add to `visualVocabulary.js` (after `kindFamily`, `:232`) a kind→shape map mirroring the Go scene defaults, and export it on the namespace so both the renderer's fallback and `cinemaMount` use the same mapping (keeps parity with `pkg/cinema/scene/types.go`):

```js
  // Default shape per node kind (mirrors the Go SceneNode shape defaults). Used
  // by cinemaMount to build scenes and as a renderer fallback when a node omits
  // an explicit shape.
  const SHAPE_BY_KIND = {
    contract: 'hexagon', account: 'circle', token_pool: 'circle',
    invariant: 'shield', circuit_breaker: 'octagon', block: 'rectangle',
    gas_meter: 'gauge',
    plan_timeline: 'rectangle', plan_step: 'rectangle',
    ghost_prediction: 'diamond', ghost_drift: 'diamond', ghost_actual: 'circle',
    swarm_governance: 'pentagon', swarm_member_status: 'circle',
    approver: 'pentagon', approval_gate: 'gate',
    policy: 'octagon', policy_decision: 'octagon',
    intent: 'arrow', outcome: 'star', evidence: 'document', evidence_link: 'document',
    trust_profile: 'pentagon', trust_domain: 'pentagon', capability: 'shield',
    trust_bridge: 'hexagon', trust_feed: 'circle', trust_credential: 'document',
    trust_verifier: 'shield', trust_oracle: 'pentagon', trust_ml_model: 'pentagon',
    trust_governance: 'pentagon',
    role: 'pentagon', role_binding: 'pentagon',
    settlement: 'circle', escrow: 'shield', reservation: 'circle', netting_group: 'circle',
    disclosure_grant: 'diamond', anchor: 'diamond', l0_bridge: 'hexagon',
  };
  function shapeForKind(kind) { return SHAPE_BY_KIND[kind] || 'circle'; }
```

Add `SHAPE_BY_KIND, shapeForKind` to the `api` object (`visualVocabulary.js:245-248`) and to `Object.assign(ns, api)`.

### Step 6.4 — `cinemaMount.graphToScene`: emit the right shape per kind (F8)

`cinemaMount` builds Nexus scenes. Today every step is `shape: 'rectangle'` (`cinemaMount.js:54`) and the outcome is `'circle'` (`:83`). Use the vocabulary mapping. The Nexus projection nodes are execution **plan steps** (legitimately `plan_step` → `rectangle`), but kind it from the step's own `kind`/`spineStage` when present so a step that is really an approval gate / evidence node renders correctly:

```js
  const shapeForKind = (vocab && vocab.shapeForKind) || ((k) => 'rectangle');
  // … inside steps.map():
    const kind = s.kind || 'plan_step';
    return {
      id: s.id,
      kind,
      label: s.name || s.label || s.id,
      position: { x: depth * 140, y: row * 90 },
      size: 16,
      color,
      shape: shapeForKind(kind),     // was hardcoded 'rectangle'
      // …
    };
```

And the outcome node (`cinemaMount.js:76-85`):

```js
      kind: 'outcome',
      // …
      shape: shapeForKind('outcome'),   // 'star' — was 'circle'
```

### Step 6.5 — Legend: real SVG glyphs that match the canvas (F9)

Replace the CSS-faked swatch in `legend.js:54-57` with a tiny inline-SVG renderer that draws the **same** shape the canvas draws, filled with the same color. Add a `shapeSvg(shape, fill)` helper in `legend.js` and use it:

```js
  function shapeSvg(shape, fill) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('width', '14'); svg.setAttribute('height', '14');
    const el = document.createElementNS(NS, shape === 'circle' ? 'circle' : 'polygon');
    if (shape === 'circle') { el.setAttribute('cx', '8'); el.setAttribute('cy', '8'); el.setAttribute('r', '6'); }
    else el.setAttribute('points', POINTS[shape] || POINTS.circle);
    el.setAttribute('fill', fill);
    svg.appendChild(el);
    return svg;
  }
  // 16×16 polygon point sets matching the canvas builders (octagon/pentagon/diamond/hexagon/
  // shield/gate/document/arrow/star); gauge/rectangle/circle handled inline.
  const POINTS = {
    diamond:  '8,1 15,8 8,15 1,8',
    hexagon:  '14,8 11,13 5,13 2,8 5,3 11,3',
    octagon:  '5,1 11,1 15,5 15,11 11,15 5,15 1,11 1,5',
    pentagon: '8,1 15,6 12,15 4,15 1,6',
    shield:   '8,1 14,4 14,9 8,15 2,9 2,4',
    gate:     '2,15 2,7 8,1 14,7 14,15',
    document: '3,1 11,1 14,4 14,15 3,15',
    arrow:    '1,5 9,5 9,2 15,8 9,14 9,11 1,11',
    star:     '8,1 10,6 15,6 11,9 13,15 8,11 3,15 5,9 1,6 6,6',
    rectangle:'1,4 15,4 15,12 1,12',
  };
```

Then in `build()` (`legend.js:54-57`), replace the `<span class="cinema-legend-swatch cinema-shape-…">` with:

```js
        const sw = shapeSvg(shape, ns.colorCss ? ns.colorCss(c) : `rgb(${c.r},${c.g},${c.b})`);
        sw.classList.add('cinema-legend-swatch');
```

Delete the now-dead fake-shape CSS at `cinema-core/styles.css:127-129` (`.cinema-shape-diamond { transform: rotate(45deg) }`, the `…rectangle/document/gate` and `…hexagon/octagon/pentagon` `border-radius` rules); keep `.cinema-legend-swatch { width:14px; height:14px }` (drop the `border-radius:50%` since the SVG owns the shape).

**Why:** F7/F8/F9 — the visual vocabulary is the whole point of Cinema ("the standalone product and the Nexus-mounted view prove the SAME things with the SAME symbols", `visualVocabulary.js:6-9`), but 8 of 12 shapes collapse to circles, the Nexus scene is all rectangles, and the legend teaches shapes the canvas never draws. One `shapeForKind` map drives scene-building, the renderer dispatch, and the legend glyphs so all three agree.

**Verify:**
- Load a scene containing each kind (use the export/share fixture or `web/test/tools`): every node renders its distinct shape — gates look like arches, evidence like pages, anchors like diamonds, policies like octagons, intents like arrows, outcomes like stars.
- In Nexus, mount a multi-kind execution graph: steps are no longer a uniform rectangle grid; the outcome is a star.
- Open the legend: each swatch SVG visually matches the canvas glyph for that row (e.g. the "Policy allow" octagon swatch matches the octagon on canvas).

**Acceptance:** `drawGraph` has a `switch` covering all 12 `SHAPES`; `visualVocabulary.js` exports `shapeForKind`; `cinemaMount` calls it (no literal `shape: 'rectangle'`/`'circle'`); `legend.js` builds inline-SVG swatches; the fake-shape CSS at `cinema-core/styles.css:127-129` is gone. Covered by `cinema_renderer_smoke.mjs` asserting `shapeForKind` returns the expected shape for representative kinds and that the renderer has a builder for every `SHAPES` value.

---

## Task 7 — Depth, elevation, and signature moments  *(Phase 2)*

**Files & anchors:**
- `web/styles.css` — shadow tokens (`styles.css:69-72`), spine ramp (`:58-66`), Aurora ribbon (`:170-186`); add hover-lift + stage-spotlight rules.
- `web/components/TrustBoundaryMap.js:63-73` — staged reveal.

### Step 7.1 — Real hover-lift on cards

Today cards use `transition: all` (F13) and a flat shadow. Add a reusable lift that jumps elevation (`--shadow-md` → `--shadow-lg`, `styles.css:70-71`) and nudges scale + translateY, on `transform/box-shadow` only:

```css
/* Reusable elevation lift — apply to .strip-card, .cockpit-rail, .cinema-narrative-card-btn, proof/receipt cards. */
.hover-lift {
  transition: transform var(--motion-base), box-shadow var(--motion-base);
  will-change: transform;
}
.hover-lift:hover {
  transform: translateY(-3px) scale(1.012);
  box-shadow: var(--shadow-lg);
}
.hover-lift:active { transform: translateY(-1px) scale(1.004); }
@media (prefers-reduced-motion: reduce) {
  .hover-lift { transition: none; }
  .hover-lift:hover { transform: none; box-shadow: var(--shadow-lg); } /* keep the elevation cue, drop the motion */
}
```

Add the `hover-lift` class to the existing interactive cards (in their builders): the spine strip cards, cockpit rail cards, the Cinema narrative cards (`cinema-core/styles.css:249`), and the proof/receipt cards (`components/ProofReceiptCard.js`, `components/AssuranceBadge.js`). Where a card already has a `:hover` border-color rule, keep it — `border-color` is added to its scoped transition in Task 8.

### Step 7.2 — Stage-colored spotlight that tracks the focused stage

The Aurora ribbon (`styles.css:170-186`) is a static top wash. Add a **stage spotlight**: a CSS var `--focus-stage` (set by JS to the focused stage's spine color, `--spine-1`…`--spine-7`) drives a soft radial glow behind the focal surface.

```css
/* Stage spotlight — a soft glow tinted by the currently focused spine stage. */
.stage-spotlight {
  position: relative;
}
.stage-spotlight::before {
  content: '';
  position: absolute; inset: -2px;
  border-radius: inherit;
  pointer-events: none;
  background: radial-gradient(ellipse 120% 140% at 50% 0%,
              color-mix(in srgb, var(--focus-stage, var(--accent)) 22%, transparent) 0%, transparent 70%);
  opacity: 0; transition: opacity var(--motion-slow), background var(--motion-slow);
  z-index: 0;
}
.stage-spotlight.is-focused::before { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .stage-spotlight::before { transition: none; } }
:root[data-theme="contrast"] .stage-spotlight::before { display: none; }   /* Phosphor: no wash, matches Aurora-off (styles.css:187) */
```

JS hook (wherever the focused stage is known — the spine strip / execution stage track): set the var and toggle the class when focus moves between stages:

```js
// el is the focal surface; stageIndex is 1..7.
function setStageSpotlight(el, stageIndex) {
  el.style.setProperty('--focus-stage', `var(--spine-${stageIndex})`);
  el.classList.add('stage-spotlight', 'is-focused');
}
```

### Step 7.3 — TrustBoundaryMap as a staged cinematic proof reveal (F16)

`buildTrustBoundaryMap` (`components/TrustBoundaryMap.js:17-73`) renders a static `<dl>`. Turn the row reveal into a sequenced "proof builds up" moment — `Infrix ✓ → Accumulate L0 ✓ → witness…` — with each row fading/sliding in on a stagger, gated by reduced-motion. Keep the DOM and semantics identical (it must never *claim* a boundary the state doesn't support); only add reveal classes + a stagger index.

In the row loop (`TrustBoundaryMap.js:64-70`), tag each `dt`/`dd` pair with a reveal class and an index custom property:

```js
  const dl = elt('dl', 'ux-trust-map-rows ux-trust-reveal');
  rows.forEach((r, i) => {
    const dt = elt('dt', 'ux-trust-who ux-trust-row', r.who);
    setAttrs(dt, { 'data-state': r.state, style: `--reveal-i:${i}` });
    const dd = elt('dd', 'ux-trust-what ux-trust-row', r.what);
    setAttrs(dd, { style: `--reveal-i:${i}` });
    dl.appendChild(dt);
    dl.appendChild(dd);
  });
  map.appendChild(dl);
```

Add a `play()` that respects `matchMedia` (the JS half of the reduced-motion gate — see Task 8 / RUNBOOK-06): if reduced-motion, render everything immediately (no stagger); otherwise add the `play` class that triggers the staggered keyframes.

```js
export function mountTrustBoundaryMap(container, state, ctx = {}) {
  const el = buildTrustBoundaryMap(state, ctx);
  if (container) container.replaceChildren(el);
  const reduce = (typeof matchMedia !== 'undefined') && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dl = el.querySelector('.ux-trust-reveal');
  if (dl && !reduce) requestAnimationFrame(() => dl.classList.add('play'));
  else if (dl) dl.classList.add('play', 'no-anim');   // visible, no motion
  return el;
}
```

CSS (add near the trust-map styles in `styles.css`):

```css
.ux-trust-reveal .ux-trust-row { opacity: 0; transform: translateX(-8px); }
.ux-trust-reveal.play .ux-trust-row {
  animation: trust-row-in var(--motion-slow) ease-out forwards;
  animation-delay: calc(var(--reveal-i, 0) * 140ms);   /* staged: Infrix → L0 → operator → you → remaining */
}
.ux-trust-reveal.play.no-anim .ux-trust-row { opacity: 1; transform: none; animation: none; }
@keyframes trust-row-in {
  from { opacity: 0; transform: translateX(-8px); }
  to   { opacity: 1; transform: translateX(0); }
}
/* Verdict color cue keyed off the existing data-state (yes/pending/attested/open/none). */
.ux-trust-who[data-state="yes"]      { border-left: 3px solid var(--ok); padding-left: 8px; }
.ux-trust-who[data-state="pending"]  { border-left: 3px solid var(--warn); padding-left: 8px; }
.ux-trust-who[data-state="open"]     { border-left: 3px solid var(--alert); padding-left: 8px; }
@media (prefers-reduced-motion: reduce) {
  .ux-trust-reveal .ux-trust-row { opacity: 1; transform: none; }
  .ux-trust-reveal.play .ux-trust-row { animation: none; }
}
```

**Why:** the review calls Cinema and the proof surfaces the "centerpiece"; flat shadows + a static `<dl>` undersell the one moment that matters — *who proved what*. A meaningful elevation jump on hover, a stage-tinted spotlight that follows focus, and a sequenced trust reveal give the product its signature depth without faking any claim.

**Verify:**
- Hover a strip/rail/proof card → it lifts (shadow jumps to `--shadow-lg`, subtle scale), smoothly; under `prefers-reduced-motion: reduce` it gains the elevation but does not move.
- Focus moves across spine stages → the spotlight tint follows the spine color (`--spine-1`…`--spine-7`); Phosphor shows none (consistent with `styles.css:187`).
- Open a proof receipt → the TrustBoundaryMap rows reveal in order (Infrix → L0 → operator → you → remaining), 140ms apart; with reduced-motion all rows are present instantly. The `data-state` color cue (green/amber/red left border) matches the honest state — a `pending` L0 is amber, never green.

**Acceptance:** a reusable `.hover-lift` lifts shadow + scale and is reduced-motion-safe; `.stage-spotlight` reads `--focus-stage`; `TrustBoundaryMap` reveals rows on a stagger gated by both CSS media query and JS `matchMedia`, with no change to the rows' truth content.

---

## Task 8 — Motion performance + reduced-motion (CSS and canvas)  *(Phase 2 — exit-gate-2 "reduced-motion honored including canvas")*

**Files & anchors:**
- `styles.css:3700-3708` (`.stage-pipe-particle` + `@keyframes particle-flow`), `:4235-4243` (`.strip-particle` + `@keyframes strip-particle`) — `left` → `transform`.
- `styles.css:348,364,479,631,703,877,938,1010,1036,1200` — `transition: all`.
- `styles.css:817-819` — cap the fastest pulse.
- `styles.css:5568-5574` — the CSS reduced-motion guard (already correct; verify it still covers the new keyframes).
- `renderer.js` — the canvas `matchMedia` hook (consumed by `needsContinuousAnimation` in Task 4).

### Step 8.1 — Particles: animate `transform`, not `left` (F12)

The particle is absolutely positioned (`left:0`, `transform: translate(-50%,-50%)`); animating `left:0%→100%` is layout/paint-bound. Drive horizontal travel with a compositor-friendly `translateX`, parameterized by a `--travel` length the spawn code sets from the pipe width:

```css
.stage-pipe-particle {
  /* …existing… */ left: 0; will-change: transform, opacity;
}
.stage-pipe-particle.go { animation: particle-flow 1.2s cubic-bezier(0.55,0.06,0.45,0.94) forwards; }
@keyframes particle-flow {
  0%   { opacity: 0; transform: translate(-50%, -50%) translateX(0) scale(0.4); }
  10%  { opacity: 1; transform: translate(-50%, -50%) translateX(calc(var(--travel, 200px) * 0.1)) scale(1); }
  90%  { opacity: 1; transform: translate(-50%, -50%) translateX(calc(var(--travel, 200px) * 0.9)) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) translateX(var(--travel, 200px)) scale(0.4); }
}
```

Apply the identical change to `.strip-particle` / `@keyframes strip-particle` (`styles.css:4235-4243`). At the **spawn site** (wherever `.go` is added to a particle — search `classList.add('go')` for `stage-pipe-particle`/`strip-particle`), set the travel distance from the track's width just before adding `.go`:

```js
particle.style.setProperty('--travel', (pipeEl.offsetWidth || 200) + 'px');
particle.classList.add('go');
```

> Keep `left: 0` as the anchor; only the animated property changes from `left` to `transform`. Read `offsetWidth` **once** at spawn (it's a layout read; batch it before the write to avoid thrash).

### Step 8.2 — Scope every `transition: all` (F13)

At each of the 10 sites (`styles.css:348,364,479,631,703,877,938,1010,1036,1200`), replace `transition: all <dur>` with the properties the rule actually animates — for the common card/button case that is:

```css
  transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s, background-color 0.15s, color 0.15s;
```

Inspect each rule and drop any property it doesn't change (e.g. a hover that only recolors needs just `background-color, border-color, color`; the lifted cards from Task 7 need `transform, box-shadow`). Never leave `all`, which animates layout properties (`width/height/top/left`) and forces paint.

### Step 8.3 — Cap the fastest infinite pulse to ≥ 1s (F14)

`styles.css:817-819`:

```css
.health-badge.throttled { /* … */ animation: pulse-badge 2s infinite; }
.health-badge.paused    { /* … */ animation: pulse-badge 1.5s infinite; }
.health-badge.frozen    { /* … */ animation: pulse-badge 1s infinite; }   /* was 0.7s */
```

Severity stays legible through cadence + color; nothing strobes faster than 1s.

### Step 8.4 — Canvas reduced-motion via JS `matchMedia` (F15)

The CSS guard (`styles.css:5568-5574`) cannot touch the canvas rAF. Add the `matchMedia` read in the renderer (the flag `needsContinuousAnimation` already checks in Task 4 — `this._reducedMotion`). Constructor:

```js
        // Honor prefers-reduced-motion for the canvas (CSS can't reach rAF).
        this._reducedMotion = false;
        if (typeof matchMedia !== 'undefined') {
            this._mql = matchMedia('(prefers-reduced-motion: reduce)');
            this._reducedMotion = this._mql.matches;
            this._mqlHandler = (e) => { this._reducedMotion = e.matches; this.requestRender(); };
            this._mql.addEventListener ? this._mql.addEventListener('change', this._mqlHandler)
                                       : this._mql.addListener(this._mqlHandler);
        }
```

When `_reducedMotion` is true: `needsContinuousAnimation()` returns `false` (Task 4) so the loop renders a **single static frame** and idles — no particle flow, no anomaly pulse, no quarantine shake, no entry overshoot. To also freeze the per-frame time-driven effects in a one-shot render, guard the shake/pulse math: in `drawGraph`, skip the quarantine shake (`renderer.js:348-351`) and the `pulseAmount`/anomaly/breaker phase terms when `this._reducedMotion` (multiply those `Math.sin(this.particlePhase …)` terms by `(this._reducedMotion ? 0 : 1)`), so a reduced-motion render is stable. Cross-reference [`RUNBOOK-06`](./RUNBOOK-06-accessibility.md) for the canonical canvas-a11y contract (keyboard nav + ARIA live region announcing scene changes); this task only lands the motion gate. The `_mql` listener is removed in `destroy()` (Task 4 already includes it).

**Why:** F12–F15 — particles repaint a layout property 60×/s, `transition: all` animates layout, a 0.7s strobe is a vestibular hazard, and the canvas ignored reduced-motion entirely. Moving travel to `transform`, scoping transitions, capping cadence, and gating the rAF on `matchMedia` makes motion both cheaper and accessible.

**Verify:**
- DevTools → Performance while particles fly: the particle layers are **composited** (no "Layout"/"Paint" entries per frame for the particle elements); CPU drops vs. baseline.
- Set OS / DevTools "Emulate `prefers-reduced-motion: reduce`": CSS animations stop (existing guard) **and** the Cinema canvas freezes to a static frame (no particle flow / pulse / shake) and idles in Performance. Toggle back → motion resumes without remount.
- No infinite animation in `styles.css` has a duration < 1s (`grep -nE 'infinite' web/styles.css` → audit durations).

**Acceptance:** neither particle keyframe animates `left`; zero `transition: all` remain in `styles.css`; the fastest infinite pulse is ≥ 1s; `renderer.js` reads `matchMedia('(prefers-reduced-motion: reduce)')` and, when set, renders a static frame and idles. Covered by `cinema_renderer_smoke.mjs` (reduced-motion → `needsContinuousAnimation()` false) and a Go fence grep (Test plan §C).

---

## Task 9 — Touch / pointer support for pan + pinch-zoom  *(Phase 2; cross-ref RUNBOOK-06 mobile)*

**Files & anchors:** `renderer.js:531-571` (`setupInteraction`).

The current handlers are mouse-only (F11). Add Pointer Events (which unify mouse/touch/pen) for drag-pan and a two-pointer pinch for zoom, keeping the existing wheel/mouse paths working. Track active pointers in a map.

```js
    setupInteraction() {
        const c = this.canvas;
        c.style.touchAction = 'none';   // we own pan/zoom; stop the browser scrolling the page

        // --- Wheel zoom (unchanged, plus a repaint) ---
        c.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            this.camera.zoom = Math.max(0.05, Math.min(20, this.camera.zoom * factor));
            this.requestRender();
        }, { passive: false });

        // --- Unified pointer pan + pinch ---
        this._pointers = new Map();      // pointerId → {x,y}
        this._pinchDist = 0;

        c.addEventListener('pointerdown', (e) => {
            c.setPointerCapture(e.pointerId);
            this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (this._pointers.size === 1) {
                this.isDragging = true;
                this.lastMouse = { x: e.clientX, y: e.clientY };
                const node = this.hitTestNode(e.clientX, e.clientY);
                this.selectedNode = node ? node.id : null;
                if (node) this.emit('nodeSelected', node);
                this.requestRender();
            } else if (this._pointers.size === 2) {
                this.isDragging = false;            // second finger → pinch, not pan
                this._pinchDist = this._twoPointerDist();
            }
        });

        c.addEventListener('pointermove', (e) => {
            if (!this._pointers.has(e.pointerId)) {           // hover (mouse only)
                const node = this.hitTestNode(e.clientX, e.clientY);
                const id = node ? node.id : null;
                if (id !== this.hoveredNode) { this.hoveredNode = id; this.requestRender(); }
                if (node) this.emit('nodeHovered', node);
                else { const edge = this.hitTestEdge(e.clientX, e.clientY); this.hoveredEdge = edge; if (edge) this.emit('edgeHovered', edge); }
                return;
            }
            this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (this._pointers.size === 2) {                  // pinch-zoom about the midpoint
                const dist = this._twoPointerDist();
                if (this._pinchDist > 0) {
                    const factor = dist / this._pinchDist;
                    this.camera.zoom = Math.max(0.05, Math.min(20, this.camera.zoom * factor));
                }
                this._pinchDist = dist;
                this.requestRender();
            } else if (this.isDragging) {                     // single-pointer pan
                this.camera.x += e.clientX - this.lastMouse.x;
                this.camera.y += e.clientY - this.lastMouse.y;
                this.lastMouse = { x: e.clientX, y: e.clientY };
                this.requestRender();
            }
        });

        const endPointer = (e) => {
            this._pointers.delete(e.pointerId);
            try { c.releasePointerCapture(e.pointerId); } catch (_) {}
            if (this._pointers.size < 2) this._pinchDist = 0;
            if (this._pointers.size === 0) this.isDragging = false;
            if (this._pointers.size === 1) {                  // lifted one finger of a pinch → resume pan
                const [p] = this._pointers.values();
                this.isDragging = true; this.lastMouse = { x: p.x, y: p.y };
            }
        };
        c.addEventListener('pointerup', endPointer);
        c.addEventListener('pointercancel', endPointer);
        c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.isDragging = false; });
    }

    _twoPointerDist() {
        const [a, b] = [...this._pointers.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
    }
```

> This replaces the five `mouse*` listeners (`renderer.js:532-570`) with pointer equivalents; Pointer Events fire for mouse too, so desktop behavior is preserved (hover, click-select, wheel-zoom, drag-pan). `touch-action: none` is what makes one-finger drag pan the canvas instead of scrolling the page — coordinate with RUNBOOK-06 so the surrounding mobile layout still allows page scroll *outside* the canvas.

**Why:** F11 — Cinema is unusable on touch today. Pointer Events give one code path for mouse/touch/pen, plus the pinch gesture operators expect on tablets/phones.

**Verify:** On a touch device / DevTools device-mode with touch: one finger pans, two fingers pinch-zoom about the midpoint, a tap selects a node (emits `nodeSelected`). On desktop: hover, wheel-zoom, click-select, drag-pan all still work. Lifting one finger mid-pinch smoothly resumes single-finger pan. The page does not scroll while dragging on the canvas.

**Acceptance:** `setupInteraction` registers `pointerdown/move/up/cancel` (no bare `mousedown/up/move` remain), tracks a pointer map, implements two-pointer pinch, and sets `touch-action: none`; desktop interactions unchanged. (Manual touch verification — note it in the PR; no node test for gestures.)

---

## Test plan

CI runs `node --test web/test/*.mjs` and `go test ./...`. Add the following; most of this runbook is **visual** and verified manually (call out the retina + theme checks explicitly in the PR).

### §A — Manual visual checklist (attach screenshots to the PR)

1. **Fonts (Task 1):** Network tab shows `*.woff2` → 200 `font/woff2`; computed `font-family` on `body` = Inter, on `.mono` = JetBrains Mono. Repeat with cache disabled (cold load) to confirm `swap` (fallback flashes, then Inter).
2. **Retina (Task 2):** At DPR 2 and 3 (DevTools device toolbar), Cinema labels/edges/glyphs are crisp; pan/zoom tracks the cursor.
3. **Themes (Task 5):** Toggle Aurora / Daylight / Phosphor — Cinema bg + labels + accent update live, legible in each; `--cinema-accent` resolves to `--accent`.
4. **Shapes (Task 6):** A full-vocabulary scene renders 12 distinct shapes; legend swatches match the canvas.
5. **Idle/pause (Task 4):** Performance panel shows the loop idles when static, pauses on hidden/off-screen, and a 10× remount doesn't grow `window` resize listeners.
6. **Motion (Task 8):** Emulate `prefers-reduced-motion: reduce` → CSS animations and the Cinema canvas both stop; particles composite (no per-frame paint) when motion is on.
7. **Touch (Task 9):** Pinch-zoom + one-finger pan in device mode.

### §B — `web/test/cinema_renderer_smoke.mjs` (NEW) — canvas renderer structural smoke

Follow the DOM-shim pattern already established in `web/test/cinema_dag_smoke.mjs:20-110` (FakeNode + `getComputedStyle`/`requestAnimationFrame`/`matchMedia` stubs). `renderer.js` is a classic script attaching to a `root.InfrixCinema` namespace, so load it by evaluating the file against a fake `globalThis` (or `import` the ESM shim `cinema-core/esm.js` if it re-exports the renderer). Assert the no-browser-needed invariants:

```js
// Pseudocode of the assertions (wire to the project's shim style):
import { strict as assert } from 'node:assert';
// … install FakeNode DOM + a fake 2D context that records calls …
globalThis.matchMedia = (q) => ({ matches: false, addEventListener(){}, removeEventListener(){} });
globalThis.devicePixelRatio = 2;

const { CinemaRenderer } = loadRendererUnderShim();   // eval renderer.js against the shim
const canvas = makeFakeCanvas(800, 600);
const r = new CinemaRenderer(canvas);

// Task 2 — DPR backing store
assert.equal(canvas.width, 1600);   // 800 * dpr(2)
assert.equal(canvas.height, 1200);
assert.equal(canvas.style.width, '800px');

// Task 4 — idle loop + destroy
assert.equal(typeof r.needsContinuousAnimation, 'function');
r.setSceneGraph({ nodes: [], edges: [] });
assert.equal(r.needsContinuousAnimation(), false, 'empty scene idles');
let removed = 0; globalThis.window.removeEventListener = () => { removed++; };
r.destroy();
assert.ok(removed >= 1, 'destroy removes the window resize listener (F10)');

// Task 6 — shape coverage
const vocab = loadVocabUnderShim();
for (const s of Object.values(vocab.SHAPES)) {
  assert.ok(rendererCanDraw(r, s), `renderer draws shape ${s}`);   // switch has a case for every SHAPES value
}
assert.equal(vocab.shapeForKind('approval_gate'), 'gate');
assert.equal(vocab.shapeForKind('evidence'), 'document');
assert.equal(vocab.shapeForKind('outcome'), 'star');

// Task 8 — reduced motion gates the loop
r._reducedMotion = true;
assert.equal(r.needsContinuousAnimation(), false, 'reduced-motion → no continuous animation');
```

> If evaluating the classic script under Node proves awkward, the minimum viable version of this file tests the **pure** pieces directly: import `visualVocabulary.js` (it already supports `module.exports`, `:252`) and assert `SHAPE_BY_KIND`/`shapeForKind`, and import `cinemaMount.js` (`graphToScene` is exported) to assert emitted node `shape`s per kind — these need no DOM and catch F6/F8 regressions.

### §C — `web/test/cinemaMount_shapes_smoke.mjs` (NEW) — scene shape mapping

`graphToScene` is a pure export (`cinemaMount.js:21`). Feed it a graph with mixed kinds and the vocab, assert each node's `shape`:

```js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
const { graphToScene } = await import(new URL('../lib/cinemaMount.js', import.meta.url));
const vocab = await import(new URL('../cinema-core/visualVocabulary.js', import.meta.url))
  .then((m) => globalThis.InfrixCinema || m);   // classic-script namespace

test('graphToScene emits the vocabulary shape per kind, not all-rectangles', () => {
  const g = {
    nodes: [
      { id: 'a', kind: 'approval_gate', status: 'completed', dependsOn: [] },
      { id: 'b', kind: 'evidence', status: 'completed', dependsOn: ['a'] },
      { id: 'c', status: 'running', dependsOn: ['b'] },   // no kind → plan_step → rectangle
    ],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
    outcome: { id: 'o', overallStatus: 'completed' },
  };
  const scene = graphToScene(g, vocab);
  const byId = Object.fromEntries(scene.nodes.map((n) => [n.id, n]));
  assert.equal(byId['a'].shape, 'gate');
  assert.equal(byId['b'].shape, 'document');
  assert.equal(byId['c'].shape, 'rectangle');
  assert.equal(scene.nodes.find((n) => n.kind === 'outcome').shape, 'star');
});
```

(Reuses the `colorKeyForStepStatus` export already present, `cinemaMount.js:111`.)

### §D — Go fence — `visual_brand_cinema_fence_test.go` (NEW, repo root, package `nexusweb`)

Match the existing fence style (`time_e3c4_time_context_fence_test.go`); read embedded assets via the package's `Asset(...)` (`assets.go:90`) and assert the brand/Cinema invariants survive refactors:

```go
package nexusweb

import (
	"strings"
	"testing"
)

func TestBrand_FontsAreLoaded(t *testing.T) {
	css := assetStr(t, "styles.css")
	if strings.Count(css, "@font-face") < 4 {
		t.Error("styles.css must declare @font-face for Inter + JetBrains Mono (upright+italic)")
	}
	if !strings.Contains(css, "font-display: swap") {
		t.Error("brand fonts must use font-display: swap")
	}
	for _, f := range []string{"fonts/InterVariable.woff2", "fonts/JetBrainsMono[wght].woff2"} {
		if _, err := Asset(f); err != nil {
			t.Errorf("font asset %q must be embedded/served: %v", f, err)
		}
	}
}

func TestCinema_RendererHardeningInvariants(t *testing.T) {
	r := assetStr(t, "cinema-core/renderer.js")
	for _, tok := range []string{
		"devicePixelRatio",                 // Task 2
		"setTransform(",                    // Task 2
		"needsContinuousAnimation",         // Task 4
		"IntersectionObserver",             // Task 4
		"removeEventListener('resize'",     // Task 10 leak fix
		"getComputedStyle(",                // Task 5
		"prefers-reduced-motion",           // Task 8 (matchMedia query string)
		"pointerdown",                      // Task 9
	} {
		if !strings.Contains(r, tok) {
			t.Errorf("renderer.js must contain %q", tok)
		}
	}
	if strings.Contains(r, "${this.fps} FPS") && !strings.Contains(r, "_debugHud") {
		t.Error("FPS HUD must be gated behind the debug flag")
	}
}

func TestCinema_FullShapeVocabulary(t *testing.T) {
	r := assetStr(t, "cinema-core/renderer.js")
	for _, s := range []string{"shield", "gate", "document", "arrow", "octagon", "pentagon", "star", "gauge"} {
		if !strings.Contains(r, "'"+s+"'") {
			t.Errorf("renderer.js drawGraph must handle shape %q", s)
		}
	}
	if !strings.Contains(assetStr(t, "cinema-core/visualVocabulary.js"), "shapeForKind") {
		t.Error("visualVocabulary.js must export shapeForKind")
	}
	if strings.Contains(assetStr(t, "lib/cinemaMount.js"), "shape: 'rectangle'") {
		t.Error("cinemaMount must not hardcode shape: 'rectangle' (use shapeForKind)")
	}
}

func TestMotion_NoLeftAnimationsOrAllTransitions(t *testing.T) {
	css := assetStr(t, "styles.css")
	if strings.Contains(css, "transition: all") {
		t.Error("styles.css must scope transitions, not 'transition: all'")
	}
	// particle keyframes must not animate left
	if strings.Contains(css, "left: 100%") {
		t.Error("particles must animate transform, not left")
	}
}

func assetStr(t *testing.T, p string) string {
	t.Helper()
	b, err := Asset(p)
	if err != nil {
		t.Fatalf("Asset(%s): %v", p, err)
	}
	return string(b)
}
```

### Existing tests to re-run
- `web/test/cinema_dag_smoke.mjs`, `cinema_narrative_smoke.mjs`, `cinema_proof_smoke.mjs`, `cinema_disclosure_smoke.mjs`, `cinema_datasource_smoke.mjs`, `cinema_scenarios_smoke.mjs` — confirm green (this runbook does not change the DAG/narrative/proof data paths, only the canvas renderer + scene shapes + chrome).
- `web/test/design_system_smoke.mjs`, `proof_receipt_smoke.mjs` — re-run after the TrustBoundaryMap + token changes.
- `pkg/cinema/scene` `TestCinemaVocabularyParity` (referenced `visualVocabulary.js:11-13`): confirm still green after adding `SHAPE_BY_KIND`/`shapeForKind` — keep those as flat, parseable literals so the parser test doesn't choke (the parity test parses `NODE_KINDS`/`EDGE_KINDS`/`SHAPES`/`COLORS`; the new map is additive and not parsed, but keep the file's literal style).

---

## Acceptance (whole runbook)

1. **The brand renders.** Inter + JetBrains Mono load from self-hosted variable woff2 under `web/fonts/` via `@font-face`/`font-display: swap`, are embedded+served by the existing `assets.go`, preloaded for first paint, and resolve as the computed `font-family`. *(Phase 0 / exit-gate 0.)*
2. **Cinema is sharp.** `resizeCanvas` sizes the backing store by `devicePixelRatio` and scales the context; no blur at DPR 2/3.
3. **No dishonest chrome.** The "60 FPS" HUD is gone (debug-flag-gated); the render loop idles to zero when static, pauses on hidden tab and off-screen, repaints on demand, and `destroy()` unwinds the rAF + resize + visibility listeners and the observers (no leak).
4. **Cinema is theme-true.** Background, edge/gas/node labels, and accent read CSS custom props via `getComputedStyle`, re-read on `data-theme` change; `--cinema-accent` is reconciled with the app `--accent`. Legible in Aurora/Daylight/Phosphor.
5. **Full vocabulary.** All 12 shapes draw on canvas; `shapeForKind` is the single source mapping kinds→shapes for the renderer, `cinemaMount` (no all-rectangles), and the legend (real SVG glyphs matching the canvas).
6. **Depth + signature moments.** Cards lift on hover (shadow jump + scale, reduced-motion-safe); a stage-tinted spotlight tracks focus; the TrustBoundaryMap reveals as a staged proof moment without altering any claim.
7. **Motion is cheap and accessible.** Particles animate `transform`, every `transition: all` is scoped, no infinite pulse < 1s, and the canvas honors `prefers-reduced-motion` via JS `matchMedia` (static frame + idle).
8. **Touch works.** Pointer/touch pan + pinch-zoom; desktop interactions unchanged.
9. **Green:** `go test ./...` and `node --test web/test/*.mjs` pass, including the new `cinema_renderer_smoke.mjs`, `cinemaMount_shapes_smoke.mjs`, and the Go fence.

---

## Rollback

Each task is an independent, revertible commit:

- **Task 1 (fonts)** — reverting the `@font-face` block + preloads + deleting `web/fonts/` returns to system fonts; nothing else depends on it. (The Go embed simply ships nothing extra.)
- **Task 2 (DPR)** — self-contained to `resizeCanvas`/`render`/the three readers; revert restores the CSS-px backing store. Note Tasks 4/5/6 build on the `cssWidth/cssHeight` fields, so revert those first if backing out DPR.
- **Task 3 (HUD)** — one-line revert restores the always-on counter.
- **Task 4 (idle loop)** — reverting the `requestRender`/`startAnimationLoop`/`destroy` diff restores the unconditional loop (and re-introduces the resize leak — keep the F10 fix even on a partial revert by retaining the bound `_onResize`).
- **Task 5 (theme)** — revert the token + `readThemeColors` diff to return to the hardcoded palette; `cinemaTokens.css` fallbacks mean a half-revert still renders (the `var(--accent, #5cd4e4)` fallback yields the old teal).
- **Task 6 (shapes)** — additive; reverting `drawGraph` dispatch + `shapeForKind` + `cinemaMount`/`legend` restores the 4-shape behavior. The parity test is unaffected (additive map).
- **Task 7 (depth)** — pure CSS + a class toggle + the TrustBoundaryMap reveal classes; revert restores the flat shadows and the static `<dl>` (the rows' truth content never changed, so no data risk).
- **Task 8 (motion)** — per-property; revert any single change (particles / transitions / cadence / canvas matchMedia) independently.
- **Task 9 (touch)** — reverting `setupInteraction` restores the mouse-only handlers; desktop unaffected either way.

Keep each task on its own commit so a single `git revert` backs out one behavior. Re-run both test suites after any revert.
