# RUNBOOK-01 — Information-Architecture Consolidation

> **Parent:** [`../nexus-ux-review-2026-06.md`](../nexus-ux-review-2026-06.md) §4.1 — "Nine doors, fifty routes, one missing front door."
> **Sequencing:** [`./RUNBOOK-00-roadmap.md`](./RUNBOOK-00-roadmap.md) Phase 1 (Demolition & consolidation).
> **Audience:** One IC, no prior context. Every edit below is grounded in a real `file:line`. Execute top-to-bottom.

---

## Objective

Collapse the Nexus SPA from **~50 routes / 9 nav doors** down to **6 doors** by:
1. deleting confirmed-orphan legacy views + their now-orphaned `lib/` modules + CSS,
2. deleting the fixture-only "fake builder" views that pretend to compose but only render a Go-generated worked example,
3. merging four duplicate clusters (Build / Verify / Learn / Inbox) into one surface each,
4. moving the marketing/docs surfaces out of the app router,
5. restructuring the header nav to exactly six doors and folding Agent / Scenarios / Console into the command palette,
6. killing the `#/app` default landing (which has **no input box and no nav entry**) and making `#/start` the newcomer default,
7. surfacing the URL-only `approve` / `execute` flows as discoverable entry points.

**Final nav (6 doors, in order):** `Start · Build · Verify · Cockpit · Govern · Inbox`.

## Exit gate (copy of RUNBOOK-00 Gate 1)

> Nav has 6 doors; every reachable route resolves to a live, non-duplicative surface; no orphaned imports; route fence tests updated and green; a new user can reach every capability from the nav or command palette (no URL-only surfaces). `go test ./...` and `node --test web/test/*.mjs` green.

---

## How the route table actually works (read this first)

`web/app.js` builds a `routes` object (`app.js:76-243`). Each key is either:

- a **live view module** imported at the top (`app.js:10-40`), e.g. `spine: spineView` (`app.js:123`), or
- a **`makeRedirect(...)` stub** (`app.js:44-55`) — an inline object that calls `window.location.replace(...)`. **Redirect stubs do not import any view file.**

This distinction is the whole game:

- `inspect: makeRedirect(...)` (`app.js:155`) **does not** import `web/views/inspect.js`. So you can delete the orphan file `web/views/inspect.js` **without touching the `inspect` redirect route**. Deep-links to `#/inspect/<id>` keep resolving into the spine. The same is true for `live`, `intents`, `plans`, `outcomes`, `evidence`, `anchors`, `network`, `verify`, `approvals`, `policies`, `trust`, `plugins`, `capabilities`, `roles`, `subsystems` (`app.js:154-160`, `232-242`).
- `operate: operatePanelView` (`app.js:165`) imports `web/views/operatePanel.js`, **not** the orphan `web/views/operate.js`. Deleting `web/views/operate.js` does not touch the `operate` route.

The router (`web/lib/router.js:42-49`) lazily builds one `view-frame` per route key and mounts on first activation. `parseHash` (`router.js:94-100`) takes `segments[0]` as the route id. `defaultRoute: 'spine'` (`app.js:266`) is the fallback for an unknown/empty hash.

**Reachability was computed by following every static `from '/...'` import out of `app.js`.** The orphan/keep verdicts in the inventory below are the diff between that reachable set and the files on disk — not guesses. Re-run the verification greps in each task before deleting.

---

## 1. Preconditions & inventory

Run the baseline before any edit:

```bash
cd C:/Accumulate_Stuff/Infrix/infrix-nexus-web
go test ./...                      # all 7 *_fence_test.go green
node --test web/test/*.mjs         # all smokes green
git switch -c tier1-ia-consolidation
```

### 1a. Verified orphan views — DELETE (Task A)

Reachable-from-`app.js` import graph proves none of these files are imported by anything in the SPA. The matching **route keys stay** as `makeRedirect` stubs (they don't reference the files).

| File | Action | Verified reason | Companion removals |
|------|--------|-----------------|--------------------|
| `web/views/anchors.js` | DELETE | 0 static importers. Route `anchors` is a redirect stub (`app.js:160`). | none (route stub stays) |
| `web/views/approvals.js` | DELETE | 0 importers. Route redirect (`app.js:232`). | none |
| `web/views/capabilities.js` | DELETE | 0 importers. Route redirect (`app.js:236`). | none |
| `web/views/comingSoon.js` | DELETE | 0 importers; no route key at all. | none |
| `web/views/evidence.js` | DELETE | 0 importers. Route redirect (`app.js:159`). | none |
| `web/views/inspect.js` | DELETE | 0 importers. Route redirect (`app.js:155`). | none |
| `web/views/intents.js` | DELETE | 0 importers. Route redirect (`app.js:156`). | none |
| `web/views/live.js` | DELETE | 0 importers. Route `live` is a redirect (`app.js:154`). Imports the dead `spineFlow` + `spineHero`. | drags `spineFlow.js`, `lib/spineHero.js`, `lib/liveEvents.js` (below) |
| `web/views/operate.js` | DELETE | 0 importers. Route `operate` → `operatePanelView` (`app.js:165`), a different file. | none |
| `web/views/outcomes.js` | DELETE | 0 importers. Route redirect (`app.js:158`). | none |
| `web/views/plans.js` | DELETE | 0 importers. Route redirect (`app.js:157`). | none |
| `web/views/plugins.js` | DELETE | 0 importers. Route redirect (`app.js:235`). | none |
| `web/views/policies.js` | DELETE | 0 importers. Route redirect (`app.js:233`). | none |
| `web/views/readiness.js` | DELETE | 1 importer = `web/views/operate.js` (also being deleted). Route redirect handled by `guided/readiness`. | none |
| `web/views/roles.js` | DELETE | 0 importers. Route redirect (`app.js:237`). | none |
| `web/views/spineFlow.js` | DELETE | 1 importer = `web/views/live.js` (deleted). Dead spine copy. | none |
| `web/views/trust.js` | DELETE | 0 importers. Route redirect (`app.js:234`). | none |

**DO NOT DELETE — these three were on the candidate list but verification shows they are LIVE:**

| File | Verdict | Proof |
|------|---------|-------|
| `web/views/network.js` | **KEEP** | imported by `web/lib/operateConsole.js:9` (Operate-console "Network" tab) |
| `web/views/verify.js` | **KEEP** | imported by `web/lib/operateConsole.js:10` ("Verify" tab) |
| `web/views/subsystems.js` | **KEEP** | imported by `web/lib/operateConsole.js:11` ("Subsystems" tab) |

`operateConsole.js` is reached via `web/lib/telemetry.js:15` → mounted by `web/views/spine.js:24,103` (the Cockpit telemetry rail, `consoleBtn` at `operateConsole.js:86`). These three are the live Operate-console slide-in tabs, distinct from the `operate` route. **Deleting them breaks the Cockpit.**

### 1b. Orphaned `lib/` modules + components — DELETE (Task A)

| File | Action | Verified reason |
|------|--------|-----------------|
| `web/lib/spineHero.js` | DELETE | only importer is `web/views/live.js` (deleted). |
| `web/lib/spineStrip.js` | DELETE | 0 static importers anywhere. Dead spine copy. |
| `web/lib/liveEvents.js` | DELETE | only importer is `web/views/spineFlow.js` (deleted). |
| `web/lib/cinemaMount.js` | DELETE | 0 static importers (`web/views/execute.js` mentions it in a comment only — confirm: `grep -n "from .*cinemaMount" web/views/execute.js` returns nothing). |
| `web/lib/rest.js` | DELETE | 0 static importers (`grep -rn "from ['\"]/lib/rest" web` is empty; earlier hits were substring noise like "restore"). |
| `web/lib/userError.js` | DELETE-with-coupling | importers: `web/components/userErrorCard.js:10`, `web/lib/rest.js:14`. Neither is reachable from `app.js`. Delete all three (`userError.js`, `rest.js`, `components/userErrorCard.js`) together, plus `web/test/user_error_smoke.mjs`. |
| `web/components/userErrorCard.js` | DELETE | only reached by `user_error_smoke.mjs`; not in SPA graph. |

> `lib/rest.js` / `lib/userError.js` / `components/userErrorCard.js` are an isolated dead triangle kept alive only by `user_error_smoke.mjs`. If you want to be conservative, leave this triangle for a separate PR — it is not on the app's critical path and skipping it does **not** affect the 6-door goal. Everything else in 1a/1b is unambiguous.

### 1c. Fixture-only "fake builder" views — DELETE (Task B)

Each renders a Go-generated worked example and **cannot compose anything** (the browser "never runs", per their own headers). Confirmed input counts via `grep -c "input\|textarea\|contentEditable"`.

| View | Route key (line) | Import (line) | Inputs | Verified reason | Orphaned `lib/` it drags |
|------|------------------|---------------|--------|-----------------|--------------------------|
| `web/views/app.js` | `app:` (`app.js:212`) | `app.js:27` | **0** | The "golden front door" with zero `<input>`/`<textarea>` (whole file read: only a static `blockquote prompt()`). Default landing today. | `web/lib/app.js` (only importer is this view) |
| `web/views/workbench.js` | `workbench:` (`app.js:120`) | `app.js:18` | 1 (display only) | Header: "the browser NEVER runs"; renders Go sample plan. | `web/lib/workbench.js` |
| `web/views/autopilot.js` | `autopilot:` (`app.js:115`) | `app.js:17` | 0 | Header: "the browser never applies"; Go sample receipt. | `web/lib/remediation.js` |
| `web/views/studio.js` | `studio:` (`app.js:193`) | `app.js:23` | 1 | Header: "a simulation is a preview, never a live proof". | `web/lib/studioGraph.js`, `web/lib/studioPalette.js` |
| `web/views/room.js` | `rooms:` (`app.js:202`) | `app.js:25` | 0 | Fixture multiplayer demo. | `web/lib/roomClient.js` |
| `web/views/companion.js` | `companion:` (`app.js:185`) | `app.js:21` | 0 | "Everything is read-only — runs no command." | `web/lib/companion.js` |

All six `lib/` drags verified as single-importer (only their view) via `grep -rln "from ['\"][^'\"]*/lib/<name>\.js" web`.

### 1d. Merge clusters — target + sources (Tasks C–F)

| Cluster | Target surface (KEEP) | Sources | Disposition |
|---------|----------------------|---------|-------------|
| **Build** | `web/views/compose.js` (`compose`, 48 inputs — the real Intent Studio) | `app` (del B), `workbench` (del B), `studio` (del B), `scenarios` (`scenario_builder.js`, 6 inputs), `launch` (→ marketing, Task G) | `scenarios` becomes a palette jump + a "Templates" entry into Build; `app`/`workbench`/`studio` deleted; old routes redirect to `#/compose`. |
| **Verify** | `web/views/prove.js` (`prove`) | `verify` (redirect already → `#/prove`, `app.js:241`), `guided/verify` (sub-flow of `guided.js`), `scenarios` (verify half), `verifyBatch` (`verifyBatch.js`) | `verifyBatch` route **KEPT** (fence-protected) but demoted to a tab/deep-link inside Verify, no longer a nav door. `guided/verify` stays a guided sub-flow. |
| **Learn** | `web/views/start.js` (`start` — the newcomer hub) | `learn` (`learn.js`), `guided` (`guided.js`), `quests` (`quests.js`), `tutor` (`tutor.js`), `companion` (del B) | `learn`/`guided`/`quests`/`tutor` view files **KEPT** as sub-surfaces reachable from the Start hub + their routes; they leave the nav. `companion` deleted. |
| **Inbox** | `web/views/inbox.js` (`inbox`, lanes) | `proof-inbox` (`inbox_collab.js`) | `inbox_collab.js` becomes the **"Proofs" lane** inside `inbox`. `proof-inbox` route → redirect to `#/inbox/proofs`. |

### 1e. Marketing/docs surfaces — MOVE out of app router (Task G)

None of these is in the nav today (they are already URL-only). Move them out of the SPA module graph.

| View | Route key (line) | Import (line) | `lib/` it owns | Smoke |
|------|------------------|---------------|----------------|-------|
| `web/views/trust_center.js` | `'trust-center'` (`app.js:223`) | `app.js:29` | `lib/trustCenter.js` | `trust_center_smoke.mjs` |
| `web/views/compare.js` | `compare` (`app.js:206`) | `app.js:26` | `lib/compare.js` | `compare_smoke.mjs` |
| `web/views/wallet_lab.js` | `'wallet-lab'` (`app.js:224`) | `app.js:30` | `lib/walletLab.js` | `wallet_lab_smoke.mjs` |
| `web/views/launch.js` | `launch` (`app.js:222`) | `app.js:28` | `lib/launch.js` | `launch_smoke.mjs` |
| `web/views/design.js` | `design` (`app.js:105`) | `app.js:15` | uses shared `components/*` (no private lib) | `design_system_smoke.mjs` |

### 1f. KEEP (live, non-duplicative) — for completeness

`spine` (Cockpit), `compose` (Build), `prove` (Verify), `govern` (Govern), `inbox` (Inbox), `start` (Start/Learn hub), `guided`, `learn`, `quests`, `tutor`, `agent`, `scenarios`, `operate`→`operatePanel`, `approve`, `execute`, `identity`, `tasks`, `receipt`, `verifyBatch`, and all `makeRedirect` stubs. Plus every `lib/` not listed in 1b/1c and `web/cinema-core/*`.

---

## 2. Ordered tasks

> Convention for every task: do the edits, then run the **Verify** greps — each must return **no output** (or the asserted output) before you move on. A non-empty orphan-import grep means you missed a removal.

---

### Group A — Delete orphaned legacy

#### Task A1 — Delete the 17 orphan view files

*Files & anchors:* the 17 files in §1a (column 1). Route stubs they correspond to live at `app.js:154-160`, `232-238`, `241-242` and **stay**.

*Steps:*
1. Delete the files:
   ```bash
   cd C:/Accumulate_Stuff/Infrix/infrix-nexus-web/web/views
   git rm anchors.js approvals.js capabilities.js comingSoon.js evidence.js \
          inspect.js intents.js live.js operate.js outcomes.js plans.js \
          plugins.js policies.js readiness.js roles.js spineFlow.js trust.js
   ```
2. **Do not** edit the `routes` object for these — none of them is imported in `app.js:10-40` (verify: `grep -nE "views/(anchors|approvals|capabilities|comingSoon|evidence|inspect|intents|live|operate|outcomes|plans|plugins|policies|readiness|roles|spineFlow|trust)\.js" web/app.js` → empty). The redirect stubs preserve deep-links.

*Why:* dead code with zero importers; the redirect routes already translate their old URLs back into the canvas (`app.js:152-160`).

*Verify:*
```bash
# no remaining static import of any deleted view, anywhere
grep -rnE "from ['\"][^'\"]*/views/(anchors|approvals|capabilities|comingSoon|evidence|inspect|intents|live|operate|outcomes|plans|plugins|policies|readiness|roles|spineFlow|trust)\.js" web   # → empty
node --test web/test/router_smoke.mjs   # section 3 still finds live:/inspect:/intents:/plans:/evidence:/anchors:/operate:/verify:/network: route stubs
```

#### Task A2 — Delete the orphaned `lib/` modules + dead triangle

*Files & anchors:* §1b.

*Steps:*
1. ```bash
   cd C:/Accumulate_Stuff/Infrix/infrix-nexus-web/web/lib
   git rm spineHero.js spineStrip.js liveEvents.js cinemaMount.js
   ```
2. Dead triangle (optional but recommended — see §1b note):
   ```bash
   cd C:/Accumulate_Stuff/Infrix/infrix-nexus-web/web
   git rm lib/rest.js lib/userError.js components/userErrorCard.js test/user_error_smoke.mjs
   ```

*Why:* each module's only importer is a file deleted in A1/B, or nothing.

*Verify:*
```bash
grep -rnE "from ['\"][^'\"]*/lib/(spineHero|spineStrip|liveEvents|cinemaMount|rest|userError)\.js" web   # → empty
grep -rn "userErrorCard" web   # → empty after triangle removal
```

#### Task A3 — Remove orphan CSS blocks

*Files & anchors:* `web/styles.css`. Counts confirmed via grep: `spine-hero` (7), `spine-flow` (2), `coming-soon` (6).

*Steps:* delete the CSS rule blocks whose selectors start with `.spine-hero`, `.spine-flow`, `.coming-soon`. Locate exact line ranges:
```bash
grep -n "spine-hero\|spine-flow\|coming-soon" web/styles.css
```
Remove each contiguous rule block (from the selector line through its closing `}`). Leave `.spine-strip`/`.spine-` general classes that `spine.js` still uses — only remove the hero/flow/coming-soon-specific ones.

*Why:* deletion discipline (RUNBOOK-00 §"Deletion discipline").

*Verify:* `grep -n "spine-hero\|spine-flow\|coming-soon" web/styles.css` → empty.

---

### Group B — Delete fake builders

#### Task B1 — Delete the six fixture views + their private libs

*Files & anchors:* §1c. Imports at `app.js:15-30`; route keys at `app.js:105-212`.

*Steps:*
1. Delete the view + lib files:
   ```bash
   cd C:/Accumulate_Stuff/Infrix/infrix-nexus-web/web
   git rm views/app.js       lib/app.js
   git rm views/workbench.js lib/workbench.js
   git rm views/autopilot.js lib/remediation.js
   git rm views/studio.js    lib/studioGraph.js lib/studioPalette.js
   git rm views/room.js      lib/roomClient.js
   git rm views/companion.js lib/companion.js
   ```
2. Edit `web/app.js` — **remove these import lines** (top block):
   - `app.js:17` `import { autopilotView } from '/views/autopilot.js';`
   - `app.js:18` `import { workbenchView } from '/views/workbench.js';`
   - `app.js:21` `import { companionView } from '/views/companion.js';`
   - `app.js:23` `import { studioView } from '/views/studio.js';`
   - `app.js:25` `import { roomsView } from '/views/room.js';`
   - `app.js:27` `import { appView } from '/views/app.js';`
3. Edit `web/app.js` — **route keys.** `app` and `studio`/`workbench`/`autopilot`/`companion`/`rooms` should preserve old deep-links, so replace each live entry with a `makeRedirect` to its merge target instead of deleting outright:
   - `app.js:115` `autopilot: autopilotView,` → `autopilot: makeRedirect(() => '#/compose'),`
   - `app.js:120` `workbench: workbenchView,` → `workbench: makeRedirect(() => '#/compose'),`
   - `app.js:185` `companion: companionView,` → `companion: makeRedirect(() => '#/start'),`
   - `app.js:193` `studio: studioView,` → `studio: makeRedirect(() => '#/compose'),`
   - `app.js:202` `rooms: roomsView,` → `rooms: makeRedirect(() => '#/start'),`
   - `app.js:212` `app: appView,` → **delete the key entirely** (the default-landing fix in Task I removes its only entry point; a stale `#/app` should fall through to `defaultRoute: 'spine'`). Optionally keep `app: makeRedirect(() => '#/start')` if you want old bookmarks to land on the newcomer hub — **recommended**, since `#/app` was the advertised front door.
4. Delete the smokes:
   ```bash
   git rm web/test/app_smoke.mjs web/test/workbench_smoke.mjs web/test/autopilot_smoke.mjs \
          web/test/studio_smoke.mjs web/test/room_smoke.mjs web/test/companion_smoke.mjs
   ```

*Why:* these surfaces advertise composition but the browser never runs (their own headers). Build collapses to the one real composer, `compose.js`.

*Verify:*
```bash
grep -rnE "from ['\"][^'\"]*/views/(app|workbench|autopilot|studio|room|companion)\.js" web   # → empty
grep -rnE "from ['\"][^'\"]*/lib/(app|workbench|remediation|studioGraph|studioPalette|roomClient|companion)\.js" web   # → empty
grep -nE "appView|workbenchView|autopilotView|studioView|roomsView|companionView" web/app.js   # → empty
```

#### Task B2 — Remove fake-builder CSS

*Files & anchors:* `web/styles.css`. Confirmed prefixes/counts: `app-` (35), `studio-` (52), `room-` (53), `companion-` (40), `workbench-` (5), `autopilot-` (5).

*Steps:* delete rule blocks for `.app-` (the `#/app` view; be careful **not** to remove generic app-shell classes — these are specifically `.app-banner`, `.app-prompt`, `.app-workflow`, `.app-assurance`, `.app-artifacts`, `.app-next`, `.app-why`, `.app-grid-layout`, `.app-col`, `.app-step*`, `.app-badge*`, `.app-source`, `.app-share*`, `.app-deferred*` — verify each against `views/app.js` class usage before removing), `.studio-`, `.room-`, `.companion-`, `.workbench-`, `.autopilot-`. Locate:
```bash
grep -n "\.app-\|\.studio-\|\.room-\|\.companion-\|\.workbench-\|\.autopilot-" web/styles.css
```

*Why:* deletion discipline.

*Verify:* re-run the grep; only intentionally-kept generic classes (if any) remain. Confirm no view still references a removed class: `grep -rn "studio-\|room-\|companion-\|workbench-\|autopilot-" web/views web/lib` → empty.

---

### Group C — Merge the Build cluster

**Target:** `compose` (`web/views/compose.js`, the real Intent Studio, 48 inputs). The fake Build sources (`app`, `workbench`, `studio`) are already deleted + redirected in Task B. This task wires the surviving sources.

#### Task C1 — Redirect the deleted Build routes (done in B) + fold Scenarios

*Files & anchors:* `app.js:99` `scenarios: scenarioBuilderView`; nav `index.html:27`.

*Steps:*
1. Keep the `scenarios` route + `scenario_builder.js` view (it produces a real proof via a connected agent). It is **removed from the nav** (Task H) and surfaced via the command palette (Task H2).
2. In `web/views/compose.js`, add a discoverable "Start from a template / scenario" entry that links to `#/scenarios` (find the Intent-Studio header/toolbar region and add an anchor `href="#/scenarios"`). This makes Scenarios reachable from Build without a nav door.

*Why:* one Build door (`compose`); Scenarios becomes a template on-ramp, not a competing door.

*Verify:*
```bash
grep -n "scenarios" web/views/compose.js     # → at least one #/scenarios link
grep -n "scenarios: scenarioBuilderView" web/app.js   # route still registered
```

---

### Group D — Merge the Verify cluster

**Target:** `prove` (`web/views/prove.js`). Sources: `verify` (already redirects to `#/prove`, `app.js:241` — keep), `verifyBatch` (demote, keep route for fence), `guided/verify` (keep as guided sub-flow), `scenarios` verify-half (folded in C).

#### Task D1 — Demote verifyBatch to a Verify tab (keep the route)

*Files & anchors:* `app.js:230` `verifyBatch: verifyBatchView`; import `app.js:40`; fence `time_e3c8_verify_batch_view_fence_test.go` (asserts both the route line and the import — **must stay**).

*Steps:*
1. **Keep** `import { verifyBatchView } from '/views/verifyBatch.js'` (`app.js:40`) and `verifyBatch: verifyBatchView` (`app.js:230`). Do **not** delete — `time_e3c8` asserts both (`TestTimeE3C8_RouteRegistered`).
2. In `web/views/prove.js`, add a "Batch verify" entry-point anchor `href="#/verifyBatch"` in the verifier's toolbar/empty-state so the batch surface is reachable from Verify (it currently is URL-only).
3. `verifyBatch` is **not** a nav door (it never was; confirm `grep -n verifyBatch web/index.html` → empty).

*Why:* one Verify door (`prove`) with batch verification reachable from inside it; preserve the protected route + fence.

*Verify:*
```bash
grep -n "verifyBatch: verifyBatchView" web/app.js     # present
grep -n "verifyBatch" web/views/prove.js              # entry-point link present
go test ./... -run TimeE3C8                            # green
```

---

### Group E — Merge the Learn cluster

**Target:** `start` (`web/views/start.js` — the "What do you want to do?" hub). Sub-surfaces kept as routes but removed from nav: `learn`, `guided`, `quests`, `tutor`. `companion` deleted (Task B).

#### Task E1 — Make Start the single Learn hub

*Files & anchors:* `app.js:80` `start`, `:84` `guided`, `:89` `learn`, `:189` `quests`, `:197` `tutor`. `start.js` renders 5 guided cards (`start_route_smoke.mjs` asserts exactly 5 cards → `#/guided/<task>`).

*Steps:*
1. Keep routes `start`, `guided`, `learn`, `quests`, `tutor` and their view files (all real + tested). Keep imports `app.js:10` (start), `:11` (guided), `:12` (learn), `:22` (quests), `:24` (tutor).
2. In `web/views/start.js`, add a secondary "Learn the concepts / Quests / Tutor" link row pointing to `#/learn`, `#/quests`, `#/tutor` so they are reachable from the hub now that they leave the nav. (Do not disturb the 5 `start-card` elements — `start_route_smoke.mjs` asserts exactly five with `#/guided/` links.)
3. These four are surfaced in the command palette too (Task H2).

*Why:* one newcomer door (`Start`) that fans out to the learning surfaces; collapses 6 "learn" doors to 1.

*Verify:*
```bash
node --test web/test/start_route_smoke.mjs   # 5 cards + #/start link + mode toggle still pass
grep -nE "#/(learn|quests|tutor)" web/views/start.js   # fan-out links present
```

---

### Group F — Merge the two inboxes

**Target:** `inbox` (`web/views/inbox.js`). Source: `proof-inbox` (`web/views/inbox_collab.js`) becomes a **"proofs" lane**.

The current inbox has lanes `approvals | assigned | mentions | handoffs | drafts` (`inbox.js`, asserted by `inbox_e2c4_view_fence_test.go` `requiredTabs`). `inbox_collab.js` (`#/proof-inbox`) is the proof-review queue.

#### Task F1 — Add a "proofs" lane to the inbox; redirect proof-inbox

*Files & anchors:* `app.js:170` `inbox: inboxView`; `app.js:176` `'proof-inbox': proofInboxView`; import `app.js:19` `import { proofInboxView } from '/views/inbox_collab.js'`. Fence: `inbox_e2c4_view_fence_test.go` `requiredTabs`.

*Steps:*
1. In `web/views/inbox.js`, add a `proofs` lane to the tab list (alongside `approvals|assigned|mentions|handoffs|drafts`). Mount the proof-review queue by reusing `inbox_collab.js`'s render path — import the proof-queue renderer from `web/views/inbox_collab.js` (refactor its mount into an exported `renderProofQueue(host)` if it is not already callable as a fragment), and render it when the active tab is `proofs`. Decisions still flow through `governed.approve`/`governed.reject` (already referenced; fence-checked).
2. Edit `web/app.js`:
   - `app.js:176` `'proof-inbox': proofInboxView,` → `'proof-inbox': makeRedirect((s) => s.length > 0 ? '#/inbox/proofs/' + encodeURIComponent(s[0]) : '#/inbox/proofs'),`
   - Keep `import { proofInboxView } from '/views/inbox_collab.js'` **only if** `inbox.js` does not import the renderer directly; preferred is to have `inbox.js` import from `inbox_collab.js` and then **remove** the `proofInboxView` import at `app.js:19` and the now-unused symbol. Decide based on the refactor: if `inbox_collab.js` exports a fragment renderer used by `inbox.js`, drop `app.js:19`.
3. Update the fence (Task in §5): add `"proofs"` to `requiredTabs` in `inbox_e2c4_view_fence_test.go`.

*Why:* one Inbox with lanes; `#/proof-inbox` deep-links preserved via redirect into the `proofs` lane.

*Verify:*
```bash
grep -n "proofs" web/views/inbox.js                  # new lane key present
grep -n "'proof-inbox': makeRedirect" web/app.js     # redirect present
node --test web/test/inbox_collab_smoke.mjs           # proof-queue logic still exercised
```

---

### Group G — Move marketing surfaces out of the app router

**Surfaces:** `trust-center`, `compare`, `wallet-lab`, `launch`, `design` (§1e). None is in the nav today.

#### Task G1 — Relocate the five marketing views out of the SPA graph

*Files & anchors:* imports `app.js:15` (design), `:26` (compare), `:28` (launch), `:29` (trust-center), `:30` (wallet-lab); routes `app.js:105` (design), `:206` (compare), `:222` (launch), `:223` (trust-center), `:224` (wallet-lab).

*Steps:*
1. Create `web/marketing/` and move the view + private-lib files there:
   ```bash
   cd C:/Accumulate_Stuff/Infrix/infrix-nexus-web/web
   mkdir -p marketing/views marketing/lib
   git mv views/trust_center.js marketing/views/   ; git mv lib/trustCenter.js marketing/lib/
   git mv views/compare.js      marketing/views/   ; git mv lib/compare.js     marketing/lib/
   git mv views/wallet_lab.js   marketing/views/   ; git mv lib/walletLab.js   marketing/lib/
   git mv views/launch.js       marketing/views/   ; git mv lib/launch.js      marketing/lib/
   git mv views/design.js       marketing/views/
   ```
   (`design.js` imports shared `components/*` — keep those in place; the marketing bundle imports them by absolute path.)
2. Edit `web/app.js`:
   - Remove imports `app.js:15`, `:26`, `:28`, `:29`, `:30`.
   - Replace the route entries with external redirects (the marketing pages are served from the public site, not the SPA). The marketing host base URL is an **infra dependency** — flag it. Until it exists, repoint deep-links to the closest in-app surface so nothing 404s:
     - `app.js:105` `design: designView,` → `design: makeRedirect(() => '#/spine'),` *(or external `/marketing/design` once hosted)*
     - `app.js:206` `compare: compareView,` → `compare: makeRedirect(() => '#/spine'),`
     - `app.js:222` `launch: launchView,` → `launch: makeRedirect(() => '#/start'),`
     - `app.js:223` `'trust-center': trustCenterView,` → `'trust-center': makeRedirect(() => '#/govern'),`
     - `app.js:224` `'wallet-lab': walletLabView,` → `'wallet-lab': makeRedirect(() => '#/identity'),`
   > `makeRedirect` only rewrites the hash (it cannot leave the SPA). If/when a marketing host exists, replace these stubs with a tiny `{ mount(){ window.location.replace('https://<marketing-host>/<page>'); } }`. This external-host URL is the only **backend/infra dependency** in this runbook — call it out in the PR.
3. Move the smokes alongside (so they still run against the relocated files):
   ```bash
   mkdir -p web/test/marketing
   git mv web/test/trust_center_smoke.mjs web/test/compare_smoke.mjs \
          web/test/wallet_lab_smoke.mjs   web/test/launch_smoke.mjs \
          web/test/design_system_smoke.mjs web/test/marketing/
   ```
   Update the relative import paths inside each moved smoke (`../views/...` → `../../marketing/views/...`). Add `node --test web/test/marketing/*.mjs` to CI.

*Why:* these are public marketing/docs surfaces, not operator workspaces; they bloat the route table and the SPA module graph.

*Verify:*
```bash
grep -nE "designView|compareView|launchView|trustCenterView|walletLabView" web/app.js   # → empty
grep -rnE "from ['\"][^'\"]*/views/(trust_center|compare|wallet_lab|launch|design)\.js" web/lib web/views web/app.js   # → empty
```

---

### Group H — Restructure nav to 6 doors + fold extras into the palette

#### Task H1 — Rewrite the header nav markup

*Files & anchors:* `web/index.html:18-28` (the `<nav class="header-workspaces">` block). Current 9 links: start(19), spine/Cockpit(20), inbox(21), compose/Studio(22), govern/Atlas(23), operate/Console(24), prove/Verifier(25), agent(26), scenarios(27).

*Steps:* replace the nine `<a class="workspace-link" …>` lines (`index.html:19-27`) with exactly six, in this order — **Start · Build · Verify · Cockpit · Govern · Inbox**:
```html
<a class="workspace-link" data-workspace="start"   href="#/start"   title="Start — new here? Pick a task or learn the concepts"><span class="workspace-link-label">Start</span></a>
<a class="workspace-link" data-workspace="compose" href="#/compose" title="Build — describe an intent, preview it, submit (g·b)"><span class="workspace-link-label">Build</span></a>
<a class="workspace-link" data-workspace="prove"   href="#/prove"   title="Verify — drop a proof or open a bundle to verify it offline (g·p)"><span class="workspace-link-label">Verify</span></a>
<a class="workspace-link" data-workspace="spine"   href="#/spine"   title="Cockpit — what needs attention now (g·l)"><span class="workspace-link-label">Cockpit</span></a>
<a class="workspace-link" data-workspace="govern"  href="#/govern"  title="Govern — actors / roles / capabilities / policies / trust (g·a)"><span class="workspace-link-label">Govern</span></a>
<a class="workspace-link" data-workspace="inbox"   href="#/inbox"   title="Inbox — approvals · assigned · mentions · handoffs · drafts · proofs (g·i)"><span class="workspace-link-label">Inbox</span><span class="workspace-link-badge" id="headerInboxBadge" hidden></span></a>
```
**Preserve** `data-workspace="inbox"` and `id="headerInboxBadge"` (asserted by `inbox_e2c4_view_fence_test.go` `TestInboxE2C4_HeaderNavLink`) and the `href="#/start"` link (asserted by `start_route_smoke.mjs`). Removed doors: Console(operate), Agent, Scenarios.
Update the nav comment at `index.html:84-90` to read `Start / Build / Verify / Cockpit / Govern / Inbox`.

*Why:* six doors, each a distinct lens; Console/Agent/Scenarios move to the palette.

*Verify:*
```bash
grep -c "workspace-link\"" web/index.html   # → 6
grep -nE "data-workspace=\"(operate|agent|scenarios)\"" web/index.html   # → empty
grep -n 'data-workspace="inbox"\|id="headerInboxBadge"\|href="#/start"' web/index.html   # all present
```

#### Task H2 — Fold Agent / Scenarios / Console into the command palette

*Files & anchors:* `web/lib/commandPalette.js:25-31` (`QUICK_JUMPS`, currently 5). Note: global search (`header.js:317`, `commandPalette.js:139`) calls `explorer.search`, which returns **chain objects** (intents/plans/evidence/anchors/policies/roles…), **not workspaces** — so the palette `QUICK_JUMPS` and the nav are the **only** discovery paths for a workspace. Folding doors into the palette therefore *requires* adding them as jumps.

*Steps:* extend `QUICK_JUMPS` (`commandPalette.js:25`) to cover every non-nav workspace so nothing becomes URL-only:
```js
const QUICK_JUMPS = [
  { id: 'qj.start',     label: 'Start',     hint: 'New here? Pick a task or learn the concepts', hash: '#/start' },
  { id: 'qj.compose',   label: 'Build',     hint: 'Compose a new intent — guided form or raw JSON', hash: '#/compose' },
  { id: 'qj.prove',     label: 'Verify',    hint: 'Drop a proof file or open a bundle to verify it', hash: '#/prove' },
  { id: 'qj.cockpit',   label: 'Cockpit',   hint: 'What needs your attention right now', hash: '#/spine' },
  { id: 'qj.govern',    label: 'Govern',    hint: 'Actors, roles, capabilities, policies, trust', hash: '#/govern' },
  { id: 'qj.inbox',     label: 'Inbox',     hint: 'Approvals, assigned, mentions, handoffs, drafts, proofs', hash: '#/inbox' },
  // folded-out doors — palette is now their only discovery path:
  { id: 'qj.operate',   label: 'Console',   hint: 'System health + governed action templates', hash: '#/operate' },
  { id: 'qj.agent',     label: 'Agent',     hint: 'What an AI agent can do, and approve what it will do', hash: '#/agent' },
  { id: 'qj.scenarios', label: 'Scenarios', hint: 'Build, run, and share a verifiable proof story', hash: '#/scenarios' },
  // learning surfaces reachable from Start, also jumpable:
  { id: 'qj.learn',     label: 'Learn',     hint: 'The six concepts, as you-go panels', hash: '#/learn' },
  { id: 'qj.quests',    label: 'Quests',    hint: 'Guided proof missions', hash: '#/quests' },
  { id: 'qj.tutor',     label: 'Tutor',     hint: 'Explain a proof — what it can and cannot claim', hash: '#/tutor' },
];
```
Update the palette doc-comment at `commandPalette.js:5-7` ("7 quick-jump destinations") to match the new count.

*Why:* the six doors stay scannable; the long tail (Agent/Scenarios/Console/Learn/Quests/Tutor) is one `Cmd/Ctrl+K` away. No capability becomes URL-only — satisfies the exit gate's "no URL-only surfaces."

*Verify:*
```bash
grep -nE "qj\.(agent|scenarios|operate)" web/lib/commandPalette.js   # all present
```

#### Task H3 — Fix the header workspace-paint map + shortcuts

*Files & anchors:* `web/lib/header.js:47-72` (`ROUTE_TO_WORKSPACE`), `:208-227` (`initShortcuts`), `:447` (`initMode` home).

*Steps:*
1. `ROUTE_TO_WORKSPACE` (`header.js:47`): the six `data-workspace` ids are now `start, compose, prove, spine, govern, inbox`. Update mappings so folded routes paint a sensible door (or none):
   - `operate: 'operate'` (`header.js:66`) and `subsystems: 'operate'` (`:67`), `network: 'operate'` (`:70`) → there is no `operate` door anymore; point them at `'spine'` (Console is a Cockpit-adjacent lens) so the paint loop (`header.js:78-79`) doesn't try to activate a non-existent link.
   - Add `start: 'start'`, `prove: 'prove'`, `verify: 'prove'` (already), and ensure `compose:'compose'`, `approve:'compose'` (`:57`), `govern:'govern'`, `inbox:'inbox'` remain.
   - **Keep** `inbox: 'inbox'` exactly (`header.js:71`) — `inbox_e2c6_cockpit_badge_fence_test.go` asserts the literal `inbox:    'inbox'`.
2. `initShortcuts` (`header.js:208-227`): repoint the `g·` chords at canonical, surviving routes:
   - `g·l` → `#/spine` (was `#/live`, `header.js:218`)
   - `g·i` → `#/inbox` (was `#/inspect`, `header.js:219`) — `i` for Inbox is more useful than the dead inspect redirect
   - `g·o` → `#/operate` (keep, `:220` — Console via palette/shortcut)
   - `g·c` → `#/compose` (keep, `:221`); add alias `g·b` → `#/compose` for "Build"
   - `g·p` → `#/prove` (keep, `:222`)
   - `g·a` → `#/govern` (keep, `:223`)
   - add `g·s` → `#/start`
   Update the shortcut-help list in `commandPalette.js:267-277` to match (the rows there are display-only strings).
3. `initMode` (`header.js:431-451`): the toggle already routes guided→`#/start`, expert→`#/spine` (`header.js:447`). **No change needed** — it is already correct; the bug is only in the DOMContentLoaded default (Task I).

*Why:* the active-door highlight and keyboard nav must reference routes that still exist post-consolidation.

*Verify:*
```bash
grep -n "inbox:    'inbox'" web/lib/header.js     # fence literal intact
grep -nE "#/(spine|inbox|operate|compose|prove|govern|start)" web/lib/header.js   # shortcuts repointed
go test ./... -run InboxE2C6                       # green
```

---

### Group I — Kill the `#/app` default landing + fix default-route logic

#### Task I1 — Replace the broken default-landing branch

*Files & anchors:* `web/app.js:251-260` (the `noHash` block), specifically `:256-259`. Today: non-expert + empty hash → `window.location.hash = '#/app'` (`app.js:259`). `#/app` has **no input and no nav entry** (verified: `views/app.js` has zero `<input>`/`<textarea>`; nav at `index.html:18-28` never linked it).

*Steps:*
1. Replace `app.js:251-260` with:
   ```js
   // IA consolidation (RUNBOOK-01) — the front door for a newcomer is the
   // guided Start hub (#/start); experts (who toggled Expert) land on the
   // spine. The old #/app prompt-to-proof landing was a fixture with no input
   // box and no nav entry — it is gone. Any direct URL still works.
   const noHash = !window.location.hash || window.location.hash === '#' || window.location.hash === '#/';
   if (noHash) {
     const mode = (() => { try { return localStorage.getItem('nexus.mode'); } catch (_) { return null; } })();
     window.location.hash = mode === 'expert' ? '#/spine' : '#/start';
   }
   ```
2. Leave `defaultRoute: 'spine'` (`app.js:266`) as the fallback for unknown routes (and for a stale `#/app` if you did not add the optional `app: makeRedirect` in Task B1 step 3).

*Why:* the advertised "golden front door" was a dead-end fixture; the real newcomer surface is `#/start` (5 guided cards), and experts keep `#/spine`.

*Verify:*
```bash
grep -n "#/app" web/app.js                 # → empty (or only the optional app:makeRedirect stub)
grep -n "mode === 'expert' ? '#/spine' : '#/start'" web/app.js   # present
node --test web/test/start_route_smoke.mjs # newcomer path intact
```

---

### Group J — Surface approve / execute entry points

`approve` (`approveView`, `app.js:133`, route `#/approve/<planId>`) and `execute` (`executeView`, `app.js:138`, route `#/execute/<intentId>`) are real, live, but **URL-only** — no nav, no palette, no in-surface link. The exit gate forbids URL-only capabilities.

#### Task J1 — Make approve reachable from the Inbox approvals lane

*Files & anchors:* `web/views/inbox.js` (approvals lane rows; fence already requires `governed.approve` + an `Approve` button). `web/views/approve.js` mounts a dossier for a plan id (subpath).

*Steps:*
1. In `web/views/inbox.js`, in the approvals-lane row renderer, add a "Open dossier" link per row: `href="#/approve/<planId>"` (the plan id is already in the row's data). This routes the reviewer from the lightweight list into the full Approval Dossier (`approve.js`), which already wires `openRationaleModal` + `governed.approve`/`governed.reject` (asserted by `inbox_e2c5_studio_thread_fence_test.go`).
2. Confirm `approve.js` mounts from a subpath plan id (`mount(root, subpath)` → `subpath[0]`). If it only reads the hash, no change.

*Why:* approval is the highest-stakes flow and must be discoverable, not a hidden URL.

*Verify:* `grep -n "#/approve/" web/views/inbox.js` → present.

#### Task J2 — Make execute reachable from the Cockpit/spine

*Files & anchors:* `web/views/spine.js` (intent rows / narrative actions). `execute.js` (route `#/execute/<intentId>`, replay at `/replay`).

*Steps:*
1. In `web/views/spine.js`, on each in-flight intent's row/narrative, add a "Watch execution" link `href="#/execute/<intentId>"` (the intent id is the spine's primary key). This surfaces the Execution Cinema from the Cockpit instead of only via a typed URL.

*Why:* same rationale — no URL-only surfaces.

*Verify:* `grep -n "#/execute/" web/views/spine.js` → present.

#### Task J3 — Palette fallbacks for approve/execute

*Files & anchors:* `web/lib/commandPalette.js` `QUICK_JUMPS`.

*Steps:* add a contextless jump that lands on the Inbox approvals lane (the natural approve entry) — `{ id:'qj.approvals', label:'Approvals', hint:'Review and sign pending approvals', hash:'#/inbox/approvals' }`. (A bare `#/approve`/`#/execute` has no id, so jump to the lists that contain them rather than the per-item screens.)

*Verify:* `grep -n "qj.approvals" web/lib/commandPalette.js` → present.

---

## 3. Merge specifications (target / contribution / tab-vs-absorbed / deep-link preservation)

### Build → `compose` (`#/compose`)
- **Target:** `web/views/compose.js` (Intent Studio, 48 inputs, the only surface that actually composes + submits via `nexus.draftCreate`/governed submit; fence `inbox_e2c5` `TestInboxE2C5_ComposeAutosavesDrafts`).
- **Contributions:** `scenarios` contributes the template on-ramp (a "Start from a template" link → `#/scenarios`); `app`/`workbench`/`studio` contributed nothing real (fixtures) and are deleted.
- **Tab vs absorbed:** Scenarios stays its own route (real proof via agent) but enters Build as a link, not a tab. Workbench/Studio/App: **absorbed (deleted)**.
- **Deep-link preservation:** `#/workbench`, `#/studio`, `#/autopilot`, `#/app` → `makeRedirect(() => '#/compose')` / `#/start` (Task B1 step 3), using the existing `makeRedirect` pattern (`app.js:44-55`).

### Verify → `prove` (`#/prove`)
- **Target:** `web/views/prove.js` (drop-zone offline verifier + bundle reader).
- **Contributions:** `verifyBatch` → "Batch verify" tab/link inside Verify (route kept for fence); `guided/verify` stays a guided sub-flow that ends with a link into `#/prove`; `scenarios` verify-half folded via the Build/scenarios link.
- **Tab vs absorbed:** `verifyBatch` = **deep-link/tab, route retained**. `verify` (legacy) = **redirect** (`app.js:241`, unchanged). `guided/verify` = **separate guided flow, kept**.
- **Deep-link preservation:** `#/verify` → `#/prove` (existing redirect, `app.js:241`); `#/verifyBatch[/<jobId>]` unchanged (route retained, fence-protected).

### Learn → `start` (`#/start`)
- **Target:** `web/views/start.js` (the "What do you want to do?" hub, 5 guided cards).
- **Contributions:** `learn` (concept ladder), `quests` (missions), `tutor` (proof explainer), `guided` (the 5 task flows) all reachable from the hub + palette.
- **Tab vs absorbed:** `learn`/`quests`/`tutor`/`guided` = **separate routes kept**, surfaced as fan-out links from Start (not nav doors). `companion` = **absorbed (deleted)**, its read-only dashboard value is superseded by Cockpit.
- **Deep-link preservation:** `#/companion` → `makeRedirect(() => '#/start')` (Task B1). `#/learn`, `#/quests`, `#/tutor`, `#/guided/<task>` unchanged.

### Inbox → `inbox` (`#/inbox`)
- **Target:** `web/views/inbox.js` (lanes: approvals/assigned/mentions/handoffs/drafts).
- **Contributions:** `proof-inbox` (`inbox_collab.js`) → new **`proofs` lane**.
- **Tab vs absorbed:** proof-review queue = **new lane (tab)**, rendered from `inbox_collab.js`'s queue renderer.
- **Deep-link preservation:** `#/proof-inbox[/<id>]` → `makeRedirect(... '#/inbox/proofs[/<id>]')` (Task F1). Lane key `proofs` added to the `inbox_e2c4` fence.

---

## 4. Test plan

### 4a. Go structural fences (`*_fence_test.go`, repo root) — `go test ./...`

| Fence file | Change |
|------------|--------|
| `inbox_e2c4_view_fence_test.go` | **Update** `requiredTabs` (`approvals, assigned, mentions, handoffs, drafts`) → add `"proofs"`. Keep `TestInboxE2C4_RouteRegistered` (inbox route/import unchanged) and `TestInboxE2C4_HeaderNavLink` (`data-workspace="inbox"` + `headerInboxBadge` preserved in the new 6-door nav). |
| `inbox_e2c6_cockpit_badge_fence_test.go` | **No change** — `startHeaderInboxBadge` + literal `inbox:    'inbox'` map entry preserved (Task H3 keeps the literal). |
| `inbox_e2c5_studio_thread_fence_test.go` | **No change** — `approve.js`, `compose.js`, `rationaleModal.js`, `commentThread.js` all kept. |
| `time_e3c4_time_context_fence_test.go` | **No change** — `timeContext.js`, `spineCommon.js`, `app.js` `initTimeContext()` untouched. |
| `time_e3c5_time_selector_fence_test.go` | **No change** — header selector + `index.html` `#/headerTimeSelector` slot preserved. |
| `time_e3c6_workspace_adaptations_fence_test.go` | **No change** — `inbox.js`/`approve.js`/`cockpitRails.js` at-awareness preserved (adding a lane to inbox keeps the `timeContext`/`isAtLive`/`onAtChange` tokens). |
| `time_e3c8_verify_batch_view_fence_test.go` | **No change** — `verifyBatch` route + import + view deliberately retained (Task D1). |
| **NEW** `ia_consolidation_nav_fence_test.go` | Assert: `web/index.html` contains exactly 6 `workspace-link` anchors with `data-workspace` ∈ {`start`,`compose`,`prove`,`spine`,`govern`,`inbox`} and **does not** contain `data-workspace="operate"`/`"agent"`/`"scenarios"`. Assert `web/app.js` no longer imports `views/{app,workbench,autopilot,studio,room,companion,launch,compare,design,trust_center,wallet_lab}.js`. Assert default-landing line `mode === 'expert' ? '#/spine' : '#/start'` is present and `#/app` is absent from the landing block. Assert `web/lib/commandPalette.js` `QUICK_JUMPS` includes `qj.agent`, `qj.scenarios`, `qj.operate`. |

### 4b. Node smokes (`web/test/*.mjs`) — `node --test web/test/*.mjs`

| Smoke | Change |
|-------|--------|
| `app_smoke.mjs`, `workbench_smoke.mjs`, `autopilot_smoke.mjs`, `studio_smoke.mjs`, `room_smoke.mjs`, `companion_smoke.mjs` | **DELETE** (subjects deleted, Task B1). |
| `user_error_smoke.mjs` | **DELETE** (dead triangle, Task A2 — only if you delete the triangle). |
| `trust_center_smoke.mjs`, `compare_smoke.mjs`, `wallet_lab_smoke.mjs`, `launch_smoke.mjs`, `design_system_smoke.mjs` | **MOVE** to `web/test/marketing/` + fix relative import paths (Task G1). |
| `router_smoke.mjs` | **No change required** — section 3 asserts route stubs (`live/inspect/intents/plans/evidence/anchors/operate/verify/network/inbox/verifyBatch`), all retained. Optionally extend with redirect-target assertions for `app/studio/workbench/proof-inbox`. |
| `start_route_smoke.mjs` | **No change** — 5 cards, `#/start` link, mode toggle preserved. (Confirms Task I/H did not regress the newcomer path.) |
| `inbox_collab_smoke.mjs` | **Keep** — proof-queue logic now feeds the `proofs` lane; ensure the exported renderer it tests still exists after the F1 refactor. |
| **NEW** `ia_consolidation_smoke.mjs` | Assert (filesystem + source): the 17 orphan + 6 fixture view files are gone; `web/app.js` has redirect stubs for `proof-inbox`→`#/inbox/proofs`, `studio/workbench/autopilot`→`#/compose`, `companion/rooms`→`#/start`; `QUICK_JUMPS` has ≥ the 6 door jumps + agent/scenarios/operate; `index.html` has exactly 6 workspace links. |

### 4c. Commands

```bash
go test ./...
node --test web/test/*.mjs
node --test web/test/marketing/*.mjs   # after Task G1 relocation
```

All three must be green to satisfy the exit gate.

---

## 5. Rollback notes

- **Branch isolation:** all work is on `tier1-ia-consolidation`; `git switch main` reverts instantly. Nothing here touches the backend or any RPC method (RUNBOOK-00 "No new RPC methods invented" holds — every surface reuses existing methods).
- **Deletions are recoverable:** every removed file was `git rm`'d, so `git checkout main -- web/views/<file>.js` restores any single view if a hidden importer surfaces. Re-add its import + route line in `app.js` and its nav `<a>` to fully revive it.
- **Redirect stubs are reversible:** to restore a merged surface as a first-class route, swap the `makeRedirect(...)` back to the imported view symbol (re-add the `import` at the top of `app.js`) and re-add its `workspace-link` in `index.html:18-28`.
- **Fence-test guardrails:** if a revert is partial, `go test ./...` will fail loudly — `inbox_e2c4` (inbox route/nav/lanes), `inbox_e2c6` (badge map literal), `time_e3c8` (verifyBatch route), and the new `ia_consolidation_nav_fence_test.go` (6-door shape) pin the post-consolidation contract. A green suite *is* the proof the IA is consistent.
- **Highest-risk edit:** the inbox `proofs`-lane refactor (Task F1) is the only one that changes a live, fence-protected view's internals. If it regresses, revert just `web/views/inbox.js` + the `proof-inbox` route line and keep the rest of the consolidation — `#/proof-inbox` returns to its own surface with no other loss.
- **Infra dependency flagged:** the only non-self-contained item is the marketing-host URL for the Task G external redirects. Until that host exists the stubs redirect into the SPA (`#/start`, `#/govern`, etc.), so nothing 404s; revisiting them is a follow-up, not a blocker for the exit gate.
