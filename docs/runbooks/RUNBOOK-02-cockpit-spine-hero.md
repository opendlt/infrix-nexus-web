# RUNBOOK-02 — Cockpit & Spine Hero

> **Parent:** [`../nexus-ux-review-2026-06.md`](../nexus-ux-review-2026-06.md) §4.2 ("The Cockpit — make the spine the hero")
> **Roadmap slot:** [`RUNBOOK-00`](./RUNBOOK-00-roadmap.md) Phase 2 ("Render the namesake")
> **Exit gate (RUNBOOK-00 Gate 2):** *"The 7-stage spine is the visual focal point of the Cockpit and renders from one shared `STAGES`; … reduced-motion honored including canvas."* This runbook owns the first clause and the reduced-motion gating of the new hero animation.

---

## Objective

The Cockpit (`web/views/spine.js`, route `#/spine`) is the product's home and namesake surface, yet today:

1. It **never renders the spine.** `mount()` builds a quick-compose dock + timeline + narrative + right rail, but the only "spine strip" implementation that is *designed* to be the always-visible 7-stage hero — `createSpineStrip` in `web/lib/spineStrip.js:31` — is **imported by nothing** and never mounted. The `.spine-strip { grid-area: strip; }` rule (`web/styles.css:4061`) is orphaned because the canvas grid (`web/styles.css:4043`) declares only `grid-template-areas: "flow rail"` — there is no `strip` row.
2. **`STAGES` is re-declared in six files** with drifting labels: `spineStrip.js:20`, `spineHero.js:17`, `narrative.js:46` (named `CHAPTERS`), `spineFlow.js:37` (named `STAGE_ORDER`), `spineCommon.js:12` (named `STAGE_ORDER`), `timeline.js:22` (named `STAGE_KEYS`). There is no single source of truth for the seven stages the product is named after.
3. The **first interactive element of the "no-onboarding" home is a `customParams (JSON)` textarea** (`web/lib/cockpitRails.js:329-336`) sitting under a 9-value goal-type `<select>` (`GOAL_TYPES`, `cockpitRails.js:273-283`). The home screen leads with raw JSON.
4. There are **three competing compose CTAs** on one screen: the inline dock itself (`createQuickComposeDock`, mounted at `spine.js:68`), the dock's "Open the full Studio →" link (`cockpitRails.js:301-305`), and the drafts rail's "Open Studio →" link (`cockpitRails.js:530-534`).
5. **Rails always eject to other routes.** Every rail row navigates away: approvals → `#/approve/<planId>` (`cockpitRails.js:81`), risk → `#/govern/...` (`cockpitRails.js:172`), verify → `#/prove/<bundleId>` (`cockpitRails.js:236`), drafts → `#/compose/...` (`cockpitRails.js:552`). The Cockpit is a launchpad, never a place where work happens.

**This runbook** makes the 7-stage spine the visual hero of the Cockpit, establishes `web/lib/spineCommon.js` as the single `STAGES` source, demotes raw JSON behind the Build/Studio surface, collapses the three compose CTAs to one, and gives the approval + verify rails an in-place quick action so the operator can act without leaving the Cockpit.

---

## Preconditions

- **RUNBOOK-01 (IA Consolidation) is merged.** RUNBOOK-01 deletes the two dead parallel spine implementations — `web/lib/spineHero.js` (`renderSpineHero`, unreachable) and `web/views/spineFlow.js` (`spineFlowView`, the legacy `#/spine` home it replaced) — together with their `STAGES` copies (`spineHero.js:17`, `spineFlow.js:37`) and their CSS (`.spine-hero`, `.spine-pipeline`, `.stage-pipe-*`). **Do not start Task 1 until those two files are gone**, or you will refactor copies that are about to be deleted. If RUNBOOK-01 has *not* yet landed, treat the deletion of those two files + their `STAGES` literals as a prerequisite sub-task of this runbook and coordinate with the RUNBOOK-01 owner so the deletion happens exactly once.
- **`go test ./...` and `node --test web/test/*.mjs` are green** on the branch you start from.
- You can run the SPA locally and reach `#/spine` (the Cockpit).
- You have read the cross-cutting conventions in [`RUNBOOK-00`](./RUNBOOK-00-roadmap.md) §"Cross-cutting conventions": **no new RPC methods**, all reads via `rpcWithDisclosure`, honor the five-state vocabulary, **one `STAGES` source**, reduced-motion gating for every new animation.

### Verified anchor table (read before editing)

| What | File:line | Current state |
|------|-----------|---------------|
| Cockpit mount | `web/views/spine.js:35-116` | builds dock→timeline→narrative→rail; **no strip** |
| Quick-compose dock mounted | `web/views/spine.js:68` | first content in `.spine-flow` |
| `createSpineStrip` | `web/lib/spineStrip.js:31` | **imported by nothing** |
| `showIntentProgression(stages)` | `web/lib/spineStrip.js:130-142` | takes a **stages array**, not an intentId |
| Strip `STAGES` | `web/lib/spineStrip.js:20-28` | `{key,label,blurb}` |
| Strip bus subs | `web/lib/spineStrip.js:98-117` | `intent.advanced` + `recentIntents` slice |
| Canvas grid | `web/styles.css:4039-4046` | `grid-template-areas: "flow rail"` |
| Orphaned strip grid-area | `web/styles.css:4061` | `.spine-strip { grid-area: strip; }` |
| Strip visual styles | `web/styles.css:4065-4188+` | full `.spine-strip*` / `.strip-card*` block exists |
| Spine gradient tokens | `web/styles.css:58-66` | `--spine-1`…`--spine-7`, `--spine-track` |
| Stage-dot color map | `web/styles.css:2369-2397` | `[data-stage="N"]` → `--spine-N` |
| Reduced-motion baseline | `web/styles.css:5568-5574` | global `prefers-reduced-motion` block |
| `STAGE_ORDER` (canonical-ish) | `web/lib/spineCommon.js:12-20` | array of 7 keys, used by `renderStageDots:85` |
| `CHAPTERS` | `web/lib/narrative.js:46-54` | `{key,label,blurb}` |
| `STAGE_KEYS` | `web/lib/timeline.js:22` | array of 7 keys; `setFilter(key)` at `:62` |
| compose dock | `web/lib/cockpitRails.js:285-417` | goal select + `customParams` textarea + preview/submit |
| `customParams` textarea | `web/lib/cockpitRails.js:329-336` | first interactive home element |
| dock "Open the full Studio →" | `web/lib/cockpitRails.js:301-305` | CTA #2 |
| drafts "Open Studio →" | `web/lib/cockpitRails.js:530-534` | CTA #3 |
| approval row → `#/approve` | `web/lib/cockpitRails.js:74-83` | always navigates away |
| verify row → `#/prove` | `web/lib/cockpitRails.js:230-240` | always navigates away |
| cockpit slice projection | `web/lib/store.js:185-187` | `nexus.cockpit { limit:100 }` |
| approval dossier RPC | `web/views/approve.js:118` | `nexus.approvalDossier { planId }` (existing) |
| verify RPC | `web/lib/narrative.js:618`, `web/views/evidence.js:323` | `evidence.verify { id }` (existing) |
| dossier renderer | `web/lib/dossier.js` → `renderDossier(dossier)` | existing, used at `cockpitRails.js:384` |

---

## Task 1 — Single `STAGES` source

**Goal:** Export one canonical `STAGES` from `web/lib/spineCommon.js`; every other module imports it. Zero re-declared 7-stage arrays remain.

### Files & anchors
- Define in: `web/lib/spineCommon.js` (replace `STAGE_ORDER` at `:12-20`).
- Refactor importers: `web/lib/timeline.js:22`, `web/lib/narrative.js:46-54`, `web/lib/spineStrip.js:20-28`.
- Already-deleted by RUNBOOK-01 (verify, do nothing): `web/lib/spineHero.js:17`, `web/views/spineFlow.js:37`.

### Steps (code-level)

**1a.** In `web/lib/spineCommon.js`, replace the bare `STAGE_ORDER` (`:12-20`) with the canonical literal below. Keep `STAGE_ORDER` as a derived alias so `renderStageDots` (`:85`, which does `STAGE_ORDER.map(...)`) and any external importer keep working:

```js
// web/lib/spineCommon.js — THE one canonical spine definition.
// No other module may re-declare the 7 stages. Import from here.
export const STAGES = [
  { key: 'intent',    label: 'Intent',    blurb: 'goal submitted',    token: 'spine-1' },
  { key: 'plan',      label: 'Plan',      blurb: 'compiled + hashed', token: 'spine-2' },
  { key: 'approval',  label: 'Approval',  blurb: 'signers + waivers', token: 'spine-3' },
  { key: 'execution', label: 'Execution', blurb: 'plugins fire',      token: 'spine-4' },
  { key: 'outcome',   label: 'Outcome',   blurb: 'finality bound',    token: 'spine-5' },
  { key: 'evidence',  label: 'Evidence',  blurb: 'hash chain sealed', token: 'spine-6' },
  { key: 'anchor',    label: 'Anchor',    blurb: 'L0 commitment',     token: 'spine-7' },
];

// Derived views — never hand-maintain these.
export const STAGE_KEYS  = STAGES.map((s) => s.key);          // ['intent', … 'anchor']
export const STAGE_ORDER = STAGE_KEYS;                         // back-compat alias (renderStageDots)
export const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.key, i + 1])); // intent→1 … anchor→7
export const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));
```

The `token` field is the bare CSS-variable suffix (`spine-1` … `spine-7`) matching `web/styles.css:59-65`. Consumers compose it as `var(--${stage.token})` or via the `[data-stage="N"]` selectors (`web/styles.css:2369-2375`) using `STAGE_INDEX[key]`.

**1b.** `web/lib/timeline.js`: delete the local `const STAGE_KEYS = [...]` (`:22`) and import the shared one. Add `STAGE_KEYS` to the existing `spineCommon` import at `:18`:

```js
import { rpcWithDisclosure, formatTime, statusPill, shortHash, STAGE_KEYS } from '/lib/spineCommon.js';
```
All existing uses of `STAGE_KEYS` (`:44`, `:156-161`) are unchanged — the array is identical in order.

**1c.** `web/lib/narrative.js`: delete the local `const CHAPTERS = [...]` (`:46-54`) and alias to the shared `STAGES`. Add `STAGES` to the import at `:23-36`, then:

```js
const CHAPTERS = STAGES; // one chapter per spine stage, in canonical order
```
Every use of `CHAPTERS` (`:111`, `:121`, `:152-158` chapter render order) is unchanged — same length, same `{key,label,blurb}` shape (the extra `token` field is ignored by the narrative).

**1d.** `web/lib/spineStrip.js` (kept and wired in Task 2): delete the local `const STAGES = [...]` (`:20-28`) and import the shared one, keeping the derived `KEY_INDEX` line. Change the import at `:16` and the array at `:20`:

```js
import { rpcWithDisclosure, STAGES } from '/lib/spineCommon.js';
// …
// (delete local STAGES literal at :20-28)
const KEY_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.key, i + 1])); // unchanged
```
> Note: `KEY_INDEX` here is identical to `STAGE_INDEX` exported from `spineCommon`. Prefer importing `STAGE_INDEX` and dropping the local `KEY_INDEX` entirely; both are acceptable — pick one and grep that no other `spineStrip` symbol shadows it.

**1e.** Grep to prove zero survivors:
```
grep -rnE "key:\s*'intent'" web/lib web/views        # expect ONE hit: spineCommon.js
grep -rnE "\['intent', *'plan'," web/lib web/views    # expect ZERO hits
```

### Why
Six drifting copies is the root cause of the "drifting labels" defect called out in the review (§4.2). One exported literal with `{key,label,blurb,token}` lets the strip, timeline, narrative, and `renderStageDots` agree on label text *and* gradient color, and makes RUNBOOK-00's "one `STAGES` source" convention enforceable by a single grep.

### Verify
- `node --test web/test/*.mjs` green (no smoke imports the deleted symbols directly; `narrative`/`timeline`/`spineStrip` still export the same surface).
- App boots, `#/spine` renders, narrative still shows 7 chapters with correct labels, timeline filter chips still read `Intent…Anchor`.

### Acceptance
- Exactly one literal array of the 7 stage keys exists in `web/lib` + `web/views` (the one in `spineCommon.js`).
- `timeline.js`, `narrative.js`, `spineStrip.js` import `STAGES`/`STAGE_KEYS` from `spineCommon.js`; no local 7-element stage array remains in any of them.
- `STAGE_ORDER` remains exported (alias) so no external importer breaks.

---

## Task 2 — Render the spine strip as the hero

**Decision: RENDER, not delete.** `createSpineStrip` (`web/lib/spineStrip.js:31`) is already a complete, two-mode component (throughput mode + intent-progression mode), already subscribes to the `recentIntents` slice and the `intent.advanced` bus, and already has a full stylesheet (`web/styles.css:4065-4188+`). The only reason it is invisible is that nothing mounts it and the grid has no `strip` row. Deleting it would throw away the namesake feature; the review's "(or delete all three copies)" escape hatch is satisfied by RUNBOOK-01 deleting the *other two* copies (`spineHero.js`, `spineFlow.js`) — we keep and promote the one that was purpose-built to be always-visible.

### Files & anchors
- CSS grid: `web/styles.css:4039-4063`.
- Hero gradient/animation: append a new block after `web/styles.css:4087` (inside the existing `.spine-strip` region).
- Mount + wiring: `web/views/spine.js` — import (`:25`), state vars (`:28-32`), `mount()` body (`:59-115`), `applySelection()` (`:124-131`).

### Steps (code-level)

**2a. Add a `strip` row to the canvas grid.** Edit `web/styles.css:4039-4046`:

```css
.spine-canvas,
.cockpit-canvas {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  grid-template-areas:
    "strip strip"   /* NEW — full-bleed hero spans both columns */
    "flow  rail";
  gap: 16px;
  align-items: start;
}
```
The orphaned `.spine-strip { grid-area: strip; }` (`:4061`) now resolves. The strip spans both columns as the top band; `flow` + `rail` keep their existing positions below it.

**2b. Mount the strip in `spine.js`.** Import (extend the existing import at `web/views/spine.js:22-26`):

```js
import { createSpineStrip } from '/lib/spineStrip.js';
```
Add a module-level handle next to the others (`web/views/spine.js:28-32`):
```js
let strip = null;
```
In `mount()`, after `canvas` is created (`web/views/spine.js:59-61`) and **before** `flow` is appended, create and append the strip as the first child of the canvas so it occupies the `strip` grid-area:

```js
const canvas = document.createElement('div');
canvas.className = 'cockpit-canvas';
shell.appendChild(canvas);

// Spine strip — THE hero. Always visible, spans both columns.
if (strip) { strip.destroy && strip.destroy(); strip = null; }
strip = createSpineStrip({
  onStageClick: (stageKey /*, stageNum */) => {
    if (currentSubpath.length > 0) {
      // Intent selected → strip cards are chapter jump-anchors.
      if (narrative) narrative.scrollToChapter(stageKey);
    } else {
      // No selection → strip cards filter the timeline in place.
      if (timeline) timeline.setFilter(stageKey);
    }
  },
});
canvas.appendChild(strip.element);

const flow = document.createElement('div');
flow.className = 'spine-flow';
canvas.appendChild(flow);
```

**2c. Wire selection ↔ progression.** Two seams already exist on the components:
- `narrative.createNarrative({ onChapterEnter })` (`web/lib/narrative.js:56`, `:174`) fires the active stage key as the user scrolls. The current `mount()` passes `onChapterEnter: () => {}` (`web/views/spine.js:80`). Replace with `(stageKey) => strip && strip.setActiveChapter(stageKey)`.
- `narrative.openIntent(intentId, onStages)` (`web/lib/narrative.js:99`, `:181-183`) calls back with `cache.spineRow.stages`. **Note the real signature:** `spineStrip.showIntentProgression(stages)` takes a **stages array, not an intentId** (`web/lib/spineStrip.js:130`). The task brief's `showIntentProgression(intentId)` is shorthand — wire it through the narrative's `onStages` callback, which already produces the stage array.

Update the narrative construction (`web/views/spine.js:78-82`):
```js
narrative = createNarrative({
  onClose: () => { window.location.hash = '#/spine'; },
  onChapterEnter: (stageKey) => { if (strip) strip.setActiveChapter(stageKey); },
});
```

Update `applySelection()` (`web/views/spine.js:124-131`) so the strip switches modes with the selection, and the progression flows from the narrative's `onStages`:
```js
function applySelection() {
  if (currentSubpath.length > 0) {
    const intentId = currentSubpath[0];
    if (narrative) {
      narrative.openIntent(intentId, (stages) => {
        if (strip) strip.showIntentProgression(stages);   // cards reflect THIS intent
      });
    }
  } else {
    if (narrative) narrative.close();
    if (strip) strip.showThroughput();                     // cards show live in-flight counts
  }
}
```

Add `strip` to the destroy guard at the top of `mount()` (`web/views/spine.js:38-40`):
```js
if (strip) { strip.destroy && strip.destroy(); strip = null; }
```

**2d. Oversized full-bleed gradient hero treatment.** The strip already has a radial-tint `::before` (`web/styles.css:4079-4086`) and per-card gradient top-borders (`:4137-4143`). Promote it to a hero band: give it more vertical presence, a full-width animated spine gradient sweeping cool→warm across the seven stages, and reuse the **existing connector-particle system** that already fires on `intent.advanced` (`spineStrip.js:98-108`, `animateConnector` at `:157-168`). Append after the `.spine-strip > *` rule (`web/styles.css:4087`):

```css
/* Spine strip promoted to Cockpit hero (RUNBOOK-02 §2d). */
.cockpit-canvas .spine-strip {
  padding: 26px 28px 30px;          /* taller, more presence than the 16/20/18 base */
  border-width: 1.5px;
}
/* Full-bleed animated spine gradient — the 7 stage colors sweeping
   cool→warm across the band. Sits beneath the existing radial ::before. */
.cockpit-canvas .spine-strip::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(100deg,
    color-mix(in srgb, var(--spine-1) 22%, transparent) 0%,
    color-mix(in srgb, var(--spine-2) 16%, transparent) 16%,
    color-mix(in srgb, var(--spine-3) 14%, transparent) 33%,
    color-mix(in srgb, var(--spine-4) 14%, transparent) 50%,
    color-mix(in srgb, var(--spine-5) 14%, transparent) 66%,
    color-mix(in srgb, var(--spine-6) 16%, transparent) 83%,
    color-mix(in srgb, var(--spine-7) 22%, transparent) 100%);
  background-size: 220% 100%;
  opacity: 0.6;
  pointer-events: none;
  z-index: 0;                       /* below .spine-strip > * { z-index: 1 } at :4087 */
  animation: spine-hero-sweep 18s linear infinite;
}
@keyframes spine-hero-sweep {
  0%   { background-position:   0% 50%; }
  100% { background-position: 200% 50%; }
}
```

The **particle system is reused, not rebuilt**: the strip's `subscribe('intent.advanced', …)` handler (`spineStrip.js:98-108`) already calls `animateConnector(from, to)` which injects a `.strip-particle` painted with `linear-gradient(90deg, var(--spine-${from}), var(--spine-${to}))` (`spineStrip.js:160-167`) and removes it after 1300ms. No new JS is needed for the hero's motion — promoting the strip to the hero slot automatically surfaces those particles at hero scale.

**2e. Reduced-motion gating.** The global block at `web/styles.css:5568-5574` already neutralizes `animation-*` and `transition-*` on `*`, which covers `spine-hero-sweep`, `strip-card-pulse` (`:4158`), and the `.strip-particle` keyframe. To make the gating explicit and self-documenting at the hero (and to freeze the gradient at a pleasant static position rather than mid-sweep), add a scoped override near the new block:

```css
@media (prefers-reduced-motion: reduce) {
  .cockpit-canvas .spine-strip::after { animation: none; background-position: 50% 50%; }
}
```
Because the particle animation is CSS-driven (`.strip-particle.go`), the global reduced-motion rule already collapses its duration to `0.01ms`; the particles still inject and self-remove but produce no visible travel. No `matchMedia` JS read is required for this task since the hero motion is 100% CSS (the JS only *triggers* class changes). This satisfies the RUNBOOK-00 reduced-motion convention for non-canvas animation.

### Why
The strip is the only component designed to be the always-on 7-stage hero, and it is one mount call + one grid row away from working. Spanning both columns at the top makes the spine the literal focal point of the Cockpit (Gate 2). Reusing the existing particle + slice subscriptions means no new data path, no new RPC, and no duplicated animation code.

### Verify
- Load `#/spine`: the 7-stage strip is the top band, spanning the full width above `flow`+`rail`.
- With no intent selected, each card's `.strip-meta` shows live "N in flight" throughput (driven by the `recentIntents` slice, `spineStrip.js:113-117`, `applyThroughput:180-207`).
- Click a stage card → the timeline filters to that stage (`timeline.setFilter`, chips reflect it).
- Open an intent (`#/spine/<id>`): strip enters narrative mode (`strip-narrative-mode` class, `spineStrip.js:131`), cards show ✓/✗/○ for that intent; clicking a card smooth-scrolls the narrative to that chapter; scrolling the narrative highlights the matching card (`setActiveChapter`).
- Submit/advance an intent (or fire an `intent.advanced` event): a particle travels the traversed connector(s) at hero scale; destination card pulses.
- Toggle OS "reduce motion": the gradient freezes, no particle travel, no pulse.

### Acceptance
- The spine strip renders on every visit to `#/spine` and occupies the `strip` grid-area spanning both columns.
- Stage-click behaves as: filter timeline (no selection) / scroll narrative (selection).
- The animated hero gradient + connector particles run live and are fully gated by `prefers-reduced-motion`.
- `strip.destroy()` is called on re-mount (no duplicate slice/bus subscriptions across navigations).

---

## Task 3 — Demote raw JSON; collapse compose CTAs to one

**Goal:** The Cockpit's first element is the spine hero + attention rails, **not** a `customParams (JSON)` textarea. The raw-JSON authoring path moves behind the Build/Studio surface. The three compose CTAs collapse to one.

### Files & anchors
- Remove dock mount: `web/views/spine.js:67-69`.
- Retire/relocate the JSON dock: `web/lib/cockpitRails.js:285-417` (`createQuickComposeDock`, incl. `GOAL_TYPES:273-283`, `customParams` textarea `:329-336`).
- CTA #2 (dock studio link): `web/lib/cockpitRails.js:301-305`.
- CTA #3 (drafts studio link): `web/lib/cockpitRails.js:530-534`.
- Single surviving CTA target: the Studio route `#/compose` (the guided form referenced in the dock's own subtitle, `cockpitRails.js:297`).

### Steps (code-level)

**3a. Remove the JSON dock from the Cockpit.** Delete the dock mount at `web/views/spine.js:67-69`:
```js
// DELETE:
// const composeDock = createQuickComposeDock();
// flow.appendChild(composeDock.element);
```
Remove `createQuickComposeDock` from the import at `web/views/spine.js:25`. After Task 2 the strip is already the first element in the `canvas`; the `flow` region now leads with the **timeline**, and the `rail` leads with the **attention rails** (approvals/risk/verify/drafts, `spine.js:90-99`). The home screen's first interactive surface is now the spine hero + "what needs your attention," exactly as §4.2 requires.

**3b. Relocate raw-JSON authoring behind Build/Studio.** The `createQuickComposeDock` factory (`cockpitRails.js:285-417`) is the only place the `customParams` textarea + goal `<select>` live. It calls existing RPCs `nexus.previewDossier` (`:376`) and `governed.submit` (`:395`) and renders via `renderDossier`. Move the *capability*, not the placement:
- The full guided Studio at `#/compose` is the canonical authoring surface (the dock subtitle already says so: *"For a guided form with safety checks, open the full Studio."* `cockpitRails.js:297`). The raw-JSON "expert paste" path should live **inside** that surface as an "Advanced / paste JSON" disclosure, not on the home screen.
- **Recommended:** export `createQuickComposeDock` for reuse by the Studio view and stop mounting it on the Cockpit (3a). The Studio/Build view (owned by RUNBOOK-04 §Studio) mounts it behind an `<details>`-style "Advanced: paste customParams" toggle so experts keep the fast path one route away. Until RUNBOOK-04 lands that toggle, leave `createQuickComposeDock` exported and unmounted (dead but intact) — do **not** delete it, since its preview/submit logic is the reference implementation the Studio reuses.
- Drop a one-line breadcrumb in `cockpitRails.js` above `createQuickComposeDock` (`:285`) noting it is no longer mounted on the Cockpit and is consumed by the Studio surface, so the next reader doesn't re-add it to `spine.js`.

> If RUNBOOK-04 is already merged with a Studio JSON path, instead **delete** `createQuickComposeDock`, `GOAL_TYPES`, and the now-orphaned `renderPreviewResult`/`metaRow`/`loadingPreview` helpers (`cockpitRails.js:419-499`) and their CSS (`.cockpit-compose*`). Grep `createQuickComposeDock` and `cockpit-compose` to confirm zero references before deleting.

**3c. Collapse three CTAs to one.** The Cockpit should present exactly one "start a new action" entry point. After 3a the inline dock (CTA #1) is gone. Remove the now-duplicate studio link inside the dock head (`cockpitRails.js:301-305`) if the dock survives for Studio reuse (the Studio surface provides its own header). Keep **one** discoverable CTA on the Cockpit: the drafts rail's "Open Studio →" link (`cockpitRails.js:530-534`), which doubles as "resume a draft / start a new one" and already targets `#/compose`. Confirm the timeline empty-state "New action →" (`web/lib/timeline.js:98`) and command-palette entry remain as secondary discovery — those are contextual (shown only when empty) and via palette, so they don't count as competing primary CTAs.

Net result: one primary compose CTA on the Cockpit (drafts rail → `#/compose`), with the raw-JSON path reachable inside Studio.

### Why
Leading the no-onboarding home with a JSON textarea is the single most-cited "this is a debug tool, not a product" defect in §4.2. Demoting it behind Studio keeps the expert fast-path alive (one route away) while the Cockpit leads with the spine and the attention rails. Three CTAs for the same action is decision-paralysis; one is a clear call.

### Verify
- `#/spine` shows **no** `customParams` textarea or goal `<select>` anywhere on first paint.
- Exactly one primary "Open Studio / New action" CTA is visible on the Cockpit.
- `#/compose` still authors actions (guided), and the expert JSON path is reachable there (or, if deferred to RUNBOOK-04, `createQuickComposeDock` still exports cleanly and is referenced by no live mount — `grep -rn createQuickComposeDock web/views` returns nothing).
- `node --test web/test/*.mjs` green (esp. `studio_smoke.mjs`, `router_smoke.mjs`).

### Acceptance
- The Cockpit's first interactive element is the spine hero / attention rails, never raw JSON.
- The raw-JSON authoring capability is preserved (behind Studio or exported-for-Studio), not lost.
- The Cockpit presents a single primary compose CTA.

---

## Task 4 — Rails act in place

**Goal:** The approval and verify rails gain an inline expand / quick-action so the operator can act *on the Cockpit*, with the deep-link kept as a clearly-secondary "open the full surface" action.

### Files & anchors
- Approval rail: `web/lib/cockpitRails.js:32-108` (row builder `:70-100`, current navigation `:74-83`).
- Verify rail: `web/lib/cockpitRails.js:188-268` (row builder `:226-260`, current navigation `:230-240`).
- Reusable renderers/RPCs (existing, no new methods): `renderDossier` from `web/lib/dossier.js` (imported `cockpitRails.js:26`); `nexus.approvalDossier { planId }` (`web/views/approve.js:118`); `evidence.verify { id }` (`web/lib/narrative.js:618`, `web/views/evidence.js:323`).
- Inline-panel CSS: append to the cockpit-rail block in `web/styles.css` (search `.cockpit-rail-row`).

### Steps (code-level)

**4a. Approval rail — inline review (read), deep-link to sign (act).** Today the whole row is a `<button>` that navigates to `#/approve/<planId>` (`cockpitRails.js:74-83`). Restructure each item so the row is a **disclosure toggle**, not an ejector:
- Build the row as a container `<div class="cockpit-rail-item">` holding the existing head/id/meta (`cockpitRails.js:84-99`) plus a small **"Review ▸"** toggle button and a hidden `<div class="cockpit-rail-expand">` panel.
- On first expand, call the existing `rpcWithDisclosure('nexus.approvalDossier', { planId: a.planId })` and render it inline with the existing `renderDossier(dossier)` (same call the dedicated `#/approve` screen uses, `approve.js:118`). Show the plan summary + consequence inline; cache it so re-expanding is free.
- Keep signing on the dedicated surface. The existing comment at `cockpitRails.js:76-78` states the design intent: *"The dossier is the canonical signing surface — operators sign here, not from a row inside the timeline."* Honor it: the inline panel ends with a **secondary** `<a class="cockpit-rail-deeplink" href="#/approve/<planId>">Review &amp; sign →</a>`. The operator reviews in place; the irreversible act (`governed.approve`, `approve.js:174`) still happens on the full surface where the full consequence panel + signature flow live (RUNBOOK-04 owns that surface).

```js
// sketch — replaces the row-as-button at cockpitRails.js:70-100
const item = document.createElement('div');
item.className = 'cockpit-rail-item approval-item';
// … existing head/id/meta nodes appended to `item` …
const toggle = document.createElement('button');
toggle.type = 'button';
toggle.className = 'cockpit-rail-expand-toggle';
toggle.setAttribute('aria-expanded', 'false');
toggle.textContent = 'Review ▸';
const panel = document.createElement('div');
panel.className = 'cockpit-rail-expand';
panel.hidden = true;
let loaded = false;
toggle.addEventListener('click', async () => {
  const open = panel.hidden;
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? 'Review ▾' : 'Review ▸';
  if (open && !loaded && a.planId) {
    loaded = true;
    panel.replaceChildren(loadingPreview('Loading review…'));
    try {
      const dossier = await rpcWithDisclosure('nexus.approvalDossier', { planId: a.planId });
      panel.replaceChildren(renderDossier(dossier));
      const sign = document.createElement('a');
      sign.className = 'cockpit-rail-deeplink';
      sign.href = '#/approve/' + encodeURIComponent(a.planId);
      sign.textContent = 'Review & sign →';
      panel.appendChild(sign);
    } catch (err) { panel.replaceChildren(errorStateNode(err)); }
  }
});
item.appendChild(toggle);
item.appendChild(panel);
body.appendChild(item);
```

**4b. Verify rail — inline 8-check (act-in-place, safe), deep-link to full reader (explore).** Verification is **read-only and idempotent**, so the quick action can fully execute on the Cockpit. Restructure each verify row (`cockpitRails.js:226-260`) the same disclosure way:
- Toggle reveals a panel with a **"Run 8-check"** button that calls the existing `rpcWithDisclosure('evidence.verify', { id: t.bundleId })` (the exact call `narrative.js:618` and `evidence.js:323` make) and renders pass/fail inline. Reuse the verification-result renderer pattern from `narrative.js:788-819` (`renderVerificationResult`) — extract it to a shared helper if you want both call sites to share it, or inline a compact pass/fail summary (`✓ 8/8` / `✗ n failed`).
- Keep the deep-link **secondary**: `<a class="cockpit-rail-deeplink" href="#/prove/<bundleId>">Open full verifier →</a>` for chain-walk + portable export (the things the Cockpit shouldn't try to host).
- Preserve the `t.intentId` fallback that exists today (`cockpitRails.js:237-238`) for rows with no `bundleId`: those have no inline check available, so they keep the single deep-link to `#/spine/<intentId>`.

**4c. Risk + drafts rails are out of scope for in-place action** (the brief asks for "at least the approval + verify rails"). Risk rows are diagnostic pointers into `#/govern` (`cockpitRails.js:166-174`) and drafts rows resume an editor (`cockpitRails.js:551-553`) — both are legitimately "go to the full surface" actions and stay deep-links. Do not change them in this task.

**4d. CSS for the inline affordance.** Add to `web/styles.css` near the `.cockpit-rail-row` rules:
```css
.cockpit-rail-item { display: flex; flex-direction: column; gap: 6px; }
.cockpit-rail-expand-toggle {
  align-self: flex-start; font: inherit; font-size: 11px; font-weight: 700;
  color: var(--text-secondary); background: transparent; border: 0;
  padding: 2px 0; cursor: pointer;
}
.cockpit-rail-expand-toggle:hover { color: var(--text); }
.cockpit-rail-expand {
  border-top: 1px solid var(--border);
  padding-top: 8px; margin-top: 2px;
}
.cockpit-rail-deeplink {
  display: inline-block; margin-top: 8px; font-size: 11px; font-weight: 700;
  color: var(--accent); text-decoration: none;
}
.cockpit-rail-deeplink:hover { text-decoration: underline; }
.cockpit-rail-expand-toggle:focus-visible,
.cockpit-rail-deeplink:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```

### Why
The Cockpit is "what needs your attention right now" (`web/views/spine.js:55`). If every attention item ejects to another route, attention is never resolved here — the operator context-switches for every signal. Reviewing an approval inline and running an evidence check inline turns the Cockpit from a launchpad into a place where the safe/diagnostic steps actually happen, while the irreversible step (sign) and the deep exploration (chain walk, export) keep their dedicated surfaces. This uses only existing RPCs (`nexus.approvalDossier`, `evidence.verify`) per the no-new-RPC convention.

### Verify
- Approval rail: clicking "Review ▸" expands an inline dossier (no navigation); "Review & sign →" still deep-links to `#/approve/<planId>`; signing still happens only on that surface.
- Verify rail: "Run 8-check" runs `evidence.verify` inline and shows pass/fail without leaving `#/spine`; "Open full verifier →" still deep-links to `#/prove/<bundleId>`.
- Keyboard: toggles are reachable and operable; `aria-expanded` flips; focus-visible outline shows.
- Empty/error states (`emptyRail`, `errorStateNode`) still render when the slice has no items or errors.

### Acceptance
- Approval and verify rails each have an in-place expand affordance; deep-links are present but visually/positionally secondary.
- No new RPC methods introduced (only `nexus.approvalDossier` + `evidence.verify`, both pre-existing).
- Risk and drafts rails unchanged.

---

## Task 5 — Cross-runbook dependencies (note, do not implement here)

- **RUNBOOK-01 (IA Consolidation) — upstream, blocking.** RUNBOOK-01 deletes the dead parallel spine copies `web/lib/spineHero.js` and `web/views/spineFlow.js` (and their `STAGES` literals + CSS). Task 1's "single source" is only true after those are gone. **Confirm both files are deleted before merging this runbook.** If you must land Task 1 first, you own deleting those two `STAGES` copies as part of 1a–1e.
- **RUNBOOK-07 SP1 (Global time scrubber) — downstream, reserves a slot.** SP1 mounts a global time scrubber that, per the review (§4.2: *"add the global time scrubber"*) and RUNBOOK-00 Phase 3 sequencing, **slots under the Cockpit**. Leave the layout room: the new grid is `"strip strip" / "flow rail"`. When SP1 lands it will add a `scrubber` band (e.g. `"strip strip" / "scrub scrub" / "flow rail"` or a sticky footer slot under `.cockpit-canvas`). **Do not** consume the bottom edge of the Cockpit with anything sticky/full-bleed in this runbook, and keep `.cockpit-canvas` a named-areas grid (not auto-flow) so SP1 can insert a row without re-authoring the grid. The scrubber already has a time substrate (`web/lib/timeContext.js`, `onAtChange`/`isAtLive`, used at `cockpitRails.js:578-588`) — SP1 wires the UI; this runbook just keeps the slot clear.

No code changes in Task 5.

---

## Test plan

All browser logic runs under `node --test web/test/*.mjs`; structural fences are Go `*_fence_test.go` at repo root. Both suites must stay green (RUNBOOK-00 §"Tests").

### Existing suites to keep green
- `web/test/router_smoke.mjs` — `#/spine` still resolves to the Cockpit view; subpath `#/spine/<id>` still parses (selection path unchanged).
- `web/test/app_smoke.mjs`, `web/test/studio_smoke.mjs` — compose/Studio path intact after Task 3.
- `web/test/design_system_smoke.mjs` — stage-dot / spine-token classes still present.
- `web/test/inbox_e2c6_cockpit_badge_fence_test.go` (repo root) — the cockpit badge fence still passes (Task 3 removes the dock, not the badge; `startHeaderInboxBadge` at `cockpitRails.js:610` is untouched).
- `go test ./...` — assets fence (`assets.go`) still embeds `web/lib/spineStrip.js` (now reachable) and no longer needs the deleted `spineHero.js`/`spineFlow.js` (RUNBOOK-01 updates that fence).

### New smoke: `web/test/spine_strip_smoke.mjs` (the strip is currently dead — add a render smoke)
Because `spineStrip.js` has zero importers today, nothing exercises it. Add a no-browser smoke modeled on `web/test/app_smoke.mjs` (dynamic `import()` of the module via `pathToFileURL`, a minimal `document` shim like `router_smoke.mjs` builds, plus stub modules for `/lib/spineBus.js` + `/lib/store.js` so `subscribe`/`subscribe2` are no-ops). Assert:
1. **Single source:** `import { STAGES } from '/lib/spineCommon.js'` has length 7, keys in canonical order `intent…anchor`, and each has `{key,label,blurb,token}` with `token === 'spine-' + (i+1)`.
2. **No drift:** importing `timeline.js`, `narrative.js`, `spineStrip.js` and reflecting their stage arrays (or asserting via grep in a lint step) shows they reference the shared `STAGES`/`STAGE_KEYS` — e.g. `STAGE_KEYS` from `spineCommon` deep-equals the timeline's filter keys.
3. **Strip renders:** `createSpineStrip({ onStageClick })` returns `{ element, showThroughput, showIntentProgression, setActiveChapter, destroy }`; `element.querySelectorAll('.strip-card').length === 7`; card `data-key` order matches `STAGE_KEYS`; 6 `.strip-conn` connectors exist.
4. **Stage-click contract:** clicking a `.strip-card` invokes `onStageClick(stageKey, stageNum)` with the right key/number.
5. **Mode switch:** `showIntentProgression([{stage:'plan',completed:true}, …])` adds `strip-narrative-mode` and sets the matching card `.completed`; `showThroughput()` removes it.
6. **Cleanup:** `destroy()` runs without throwing (unsubscribes the stubbed subs).

### New/updated smoke: Cockpit composition (`app`/spine mount)
If a spine-view smoke is feasible with the DOM shim, assert after `spineView.mount(root, [])`:
- `root.querySelector('.spine-strip')` exists and is the **first** child of `.cockpit-canvas` (hero position).
- `root.querySelector('.cockpit-compose')` is **absent** (Task 3 — no JSON dock).
- exactly one primary compose CTA (`a[href="#/compose"]`) in the cockpit body that is not the timeline empty-state.

If a full mount is impractical under the shim, cover the same three assertions as DOM-string/structure checks against the built nodes.

### Manual / visual QA (record in the PR)
- Hero renders, spans both columns, animated gradient sweeps, particles fire on advance, reduced-motion freezes them.
- Stage-click filters timeline (no selection) and scrolls narrative (selection); chapter scroll highlights the card.
- Approval "Review ▸" expands inline dossier; "Review & sign →" deep-links. Verify "Run 8-check" returns pass/fail inline; "Open full verifier →" deep-links.
- No `customParams` textarea on `#/spine`.

---

## Acceptance criteria (whole runbook → RUNBOOK-00 Gate 2, first clause)

1. **Spine is the hero:** the 7-stage strip renders on every `#/spine` visit, spans both columns as the top band, and is the visual focal point (oversized, animated gradient, live particles).
2. **One `STAGES`:** exactly one 7-stage literal exists in `web/lib`+`web/views` (`spineCommon.js`); `timeline.js`, `narrative.js`, `spineStrip.js` import it; `grep -rnE "key:\s*'intent'" web/lib web/views` returns one hit.
3. **JSON demoted:** no `customParams (JSON)` textarea or goal `<select>` on the Cockpit's first paint; the raw-JSON path is preserved behind Studio.
4. **One CTA:** the Cockpit presents a single primary compose CTA.
5. **Rails act in place:** approval + verify rails expand inline (dossier review / 8-check) using only existing RPCs; deep-links remain as secondary actions.
6. **Reduced-motion honored:** all new animation (`spine-hero-sweep`, reused particles, card pulse) is gated by `prefers-reduced-motion`.
7. **Green suites:** `go test ./...` and `node --test web/test/*.mjs` pass, including the new `spine_strip_smoke.mjs`.

---

## Rollback

The work is additive + relocation; each task reverts independently.

- **Task 2 (hero):** revert the `grid-template-areas` edit (`styles.css:4039-4046`) back to `"flow rail"`, and remove the `createSpineStrip` import + mount + `applySelection` wiring in `spine.js`. The strip returns to its current dead state; no other surface depends on it. Remove the `::after` hero gradient block + its reduced-motion override.
- **Task 1 (STAGES):** the canonical `STAGES`/`STAGE_KEYS`/`STAGE_ORDER` export is a superset of every old local array, so reverting just one importer (re-inlining its old literal) is safe and isolated; full revert restores the six copies. Low risk because the array contents are byte-identical to the originals.
- **Task 3 (demote JSON):** re-add the two lines at `spine.js:67-69` to remount `createQuickComposeDock` (kept exported, never deleted in the recommended path), restoring the inline dock instantly.
- **Task 4 (rails in place):** the row builders are localized to `createApprovalQueue` (`cockpitRails.js:32-108`) and `createVerificationRail` (`cockpitRails.js:188-268`); revert each to the row-as-button-that-navigates form. No data-layer or RPC change to undo.
- **Feature-flag option:** if a single toggle is preferred over per-task reverts, gate the strip mount + dock removal behind a `localStorage`/build flag read in `spine.js mount()` (e.g. `cockpitHeroEnabled`) so the old layout (`composeDock` first, no strip) can be restored at runtime without a redeploy.

No database, no migration, no new RPC — rollback is pure front-end revert.
