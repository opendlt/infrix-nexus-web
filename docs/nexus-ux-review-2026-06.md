# Nexus (infrix-nexus-web) — Brutally Honest UX/UI Review & Redesign Specification

> **Date:** 2026-06-26
> **Scope:** Exhaustive critical review of the infrix-nexus-web SPA (~33K LOC JS, ~9.6K LOC CSS, ~50 views) against the bar: a "WoW" UX that gives users *superpowers* and unique governance insight unavailable on any other blockchain project — immediately intuitive, near-frictionless, no onboarding required.
> **Method:** Architectural read of the entry points, design tokens, data layer, and router, plus five deep subsystem audits (cockpit/spine core, data/liveness/time-travel substrate, feature-sprawl/onboarding, governance utility, visual/CSS/accessibility). All load-bearing claims independently verified against source.
> **Companion docs:** Implementation runbooks for Parts 4 & 5 live in [`docs/runbooks/`](./runbooks/).

---

## Executive verdict

You have built **a Ferrari engine bolted into a parts warehouse, with a sign on the warehouse that says "Ferrari."**

The substrate is genuinely world-class and unique in the blockchain space: a live RPC layer where **a single time-travel `at`-coordinate is threaded through every read** (`web/lib/spineCommon.js:58-59`), a **causal 7-stage spine** linking intent→plan→approval→execution→outcome→evidence→anchor, **ghost simulation before submit**, **policy-decision traces**, **anchor chains**, and a **byte-exact offline verifier that re-runs the Go proof checks in the browser** (`web/lib/portableVerifier.js:1-281`). No other explorer — not Etherscan, not Solscan, not any L2 dashboard — has this raw material. This is a real superpower substrate.

And then you bury it. Specifically:

1. **The product's namesake — the spine — is not on screen.** It's orphaned dead code (`web/lib/spineStrip.js:31`, imported nowhere). It survives only as 11px dots.
2. **"Live" is theater.** The WebSocket/event-bus engine never runs in any reachable route. The cockpit is naked 4-second polling wearing a costume: a hardcoded "Connected" light that can't go red, a CSS heartbeat that beats whether or not data flows, and an "Activity" feed that is *permanently empty*.
3. **The flagship front door is vaporware.** `#/app` — the default landing for every newcomer — is a static fixture viewer with **no input box and no way back**. The single most-marketed surface is inert and orphaned from the nav.
4. **Feature accretion has metastasized.** ~50 routes, 9 nav doors, **6 different "describe an intent" surfaces, 5 "verify a proof" surfaces, 6 "learn" surfaces, 2 separate inboxes, ~19 dead legacy view files.** Four of those duplicates are fake builders (non-draggable palettes that build nothing).
5. **The brand never renders.** Inter and JetBrains Mono are declared but never loaded. The "distinctive" identity ships as system fonts.

The brutal one-line summary: **the unique, demoable superpowers are 90% built and one correlation step away from existing — but they're drowned under duplicate onboarding surfaces, dead code, and dishonest liveness theater, and the one thing you named the product after isn't visible.**

The good news: because the data layer is excellent, the path to "wow" is mostly **deletion, consolidation, and wiring up things you already built** — not green-field invention.

---

## Part 1 — What is genuinely excellent (do not throw this out)

Be clear about the gold before the demolition:

- **The narrative** (`web/lib/narrative.js`) — a coherent 7-chapter story per intent with plan-hash commitment, per-step gas drift, clickable policy/trust/plugin chips opening lateral drawers, a finality state machine, inline 8-check verification, and one-click portable export. **This is the actual product.** It's excellent.
- **The offline verifier** (`web/lib/portableVerifier.js` + `web/lib/proofReceipt.js`) — byte-exact port of the Go verifier, fail-closed, honest-by-construction (offline verify *cannot* claim L4). The full loop closes: read bundle → export portable → drop back into the dropzone → verify with zero server trust. **This is the single most trustworthy thing in any blockchain explorer reviewed.**
- **The time-travel substrate** (`web/lib/timeContext.js` + `withAt`) — one coordinate, every read, survives reload and link-share via `?at=`. A real differentiator, 90% wired.
- **The five-state honesty vocabulary** (`web/lib/states.js`) — visible / hidden-by-disclosure / not-produced / unavailable / error. Exactly right for governance. Most apps have one "error" state; you have the correct five.
- **The compose→preview→submit→watch loop** (`web/views/compose.js` + `web/lib/dossier.js`) — the one fully in-browser end-to-end governance loop, with ghost per-step predictions.
- **The Authority Atlas + Execution Cinema** as *read* surfaces — deep, well-structured drilldowns.
- **The design-token rigor** — three full themes, per-theme spine ramps, WCAG remediations documented inline in the CSS.

Keep every one of these. The rest of this document is about making them *findable, honest, and connected*.

---

## Part 2 — The foundational problems, with verified evidence

### P1. The namesake is invisible; three dead copies of it exist
`web/views/spine.js` renders a two-column "Cockpit" dashboard but **never mounts the spine strip**. `createSpineStrip` (`web/lib/spineStrip.js:31`), `web/lib/spineHero.js`, and `web/views/spineFlow.js` are three parallel, unreachable implementations of the core metaphor. The `STAGES` array is independently re-declared in **six files** with drifting labels (`spineStrip.js:20`, `spineHero.js:17`, `narrative.js:46`, `spineFlow.js:37`, `spineCommon.js:12`, `timeline.js:22`). There is no single source of truth for the seven stages the product is named after.

### P2. "Live" is dishonest theater
- `connectLive()` is unreachable (verified): imported only in `web/views/spineFlow.js:25`, called only at `:156`; `spineFlow` is mounted only by `web/views/live.js:54`; and `live` redirects to `#/spine` (`web/app.js:154`). The live bus never publishes → `web/lib/store.js`'s entire event-invalidation block (`store.js:272-293`) is dead → the cockpit is 100% interval polling.
- `statusText` is hardcoded `"Connected"` (`web/index.html:67`) and **no JS can ever set it to disconnected** (verified — `statusDot`/`statusText` appear only in static HTML). The app says "Connected" while every RPC is failing.
- The heartbeat is a fixed `2.4s` CSS loop (`web/styles.css:3764`), unconnected to data arrival.
- `fetchedAt` is captured on every slice (`store.js:139`) and **read by no one** — there's no "updated 3s ago," no staleness dimming. A single transient poll failure *wipes last-known-good data* and shows a raw error string (`web/lib/cockpitRails.js:60`).
- Pollers don't pause on hidden tabs or when time-frozen: ~7 RPCs every ~4s forever per idle tab, and re-fetching immutable historical snapshots on a loop.

### P3. The narrative cache ignores the time cursor (correctness bug)
The `narrative:<id>` slice has no poll interval and **nothing invalidates it on `at` change** (`store.js:46-50`, `272-293`). Open an intent, time-travel to a past block → the banner says "viewing as of block X" while the narrative panel keeps showing live data. **The UI asserts a historical lens it isn't applying.** For a governance/audit tool, silently lying about which point in time you're viewing is the most dangerous class of bug.

### P4. Massive feature sprawl and duplication

| Job | # of surfaces | Reality |
|---|---|---|
| "Describe intent → plan/build" | **6** (`app`, `launch`, `workbench`, `scenarios`, `studio`, `compose`) | 1 live (`scenarios`) + 1 real nav (`compose`); 4 fixture-only, 2 fake builders (`studio.js:42` palette is `draggable:'false'`) |
| "Verify a proof" | **5** (`prove`, `guided/verify`, `scenarios`, `verifyBatch`, `verify`-redirect) | plus 6+ separate proof-receipt renderers |
| "Learn the concepts" | **6** (`start`, `learn`, `guided`, `quests`, `tutor`, `companion`) | 3 nearly pure overlap |
| "Inbox" | **2 entirely separate** (`#/inbox`, `#/proof-inbox`) | the code comment literally apologizes for the distinction (`app.js:172`) |
| Dead legacy views | **~17 views + 6 libs** | `anchors, approvals, capabilities, comingSoon, evidence, inspect, intents, live, operate, outcomes, plans, plugins, policies, readiness, roles, trust` (+ dead spine copies) — unreachable, never imported into the live graph |

> **Correction (verified during runbook authoring):** `network.js`, `verify.js`, and `subsystems.js` are **NOT** orphans — they are live tabs of the Operate console via `web/lib/operateConsole.js:9-19`. The authoritative, import-graph-verified orphan set (17 views + 6 libs) lives in [`RUNBOOK-01`](./runbooks/RUNBOOK-01-ia-consolidation.md); treat that runbook's inventory table as canonical over this summary.

**~40% of view files are dead or duplicative.** Many surfaces are reachable only by typing a URL — invisible to every real user (global search queries chain objects, not views: `web/lib/header.js:317`).

### P5. The brand never renders + the centerpiece is rough
- Inter/JetBrains Mono declared (`styles.css:75-76`), **never loaded** (verified: no `@font-face`/CDN/woff anywhere). Ships as system fonts.
- The Cinema DAG renderer — which *should* be the visual centerpiece — has **no devicePixelRatio handling** (`web/cinema-core/renderer.js:45`), so it's blurry on every retina screen; ships a **"60 FPS" debug HUD** (`renderer.js:523`); runs an **unconditional 60fps rAF loop** that never idles or pauses on hidden tabs; is **hardcoded dark navy** so it ignores Daylight/Phosphor themes; and **draws only 4 of its 12 specified shapes** (`renderer.js:415` vs `web/cinema-core/visualVocabulary.js:108`) — shields/gates/octagons all collapse to circles. The legend swatches fake the shapes with `border-radius:3px` and don't match either.

### P6. Governance-safety regressions and assertion-based identity
- **Identity is self-asserted plaintext.** "Acting as" is a localStorage string (`spineCommon.js:33`); there's no key, no signature. The dossier's "Sign" (`web/views/approve.js:174`) is an RPC attributed by assertion, not a cryptographic act. The dossier *shows* a plan hash to bind to but nothing the user holds is bound.
- **Inbox bulk-approve bypasses the safety gate.** It calls `governed.approve` with only `{intentId, rationale}` (`web/views/inbox.js:413`) — no `planHash`/`stageId`/`role`, **no invalidator check** — so you can bulk-approve a plan the single-approval dossier would *refuse* to let you sign. It uses `window.prompt`/`alert`, binds one rationale to all items, and undercuts the polished `rationaleModal` the safe path uses.
- **The Identity "Control Center" controls nothing** — it's a `/testdata/identity.fixture.json` viewer (`web/lib/identity.js:23`). Its genuinely excellent `explainSignature` engine (funds move? irreversible? agent-initiated? expected proof?) is stranded on canned data instead of powering the real approval flow.
- **The Operate Console diagnoses but won't navigate to the fix** — "3 approvals awaiting" is a dead count, not a link (`web/lib/operatePanel.js:166`); drift rows aren't clickable into the trust node.

---

## Part 3 — The "WoW": the superpowers you already have the data for

This is the heart of the ask. Every superpower below is **enabled by data the RPC layer already returns** and is **absent from the current UI**. These are what no other blockchain project can do, because no other project has a causal governance spine + a universal time coordinate + ghost simulation + offline proofs. Build these and you have the "unique super insight" you're after. (Detailed implementation: [`runbooks/RUNBOOK-07-superpowers.md`](./runbooks/RUNBOOK-07-superpowers.md).)

### SUPERPOWER 1 — Scrub the entire system through time ("the time machine")
You have a polished block-scrubber (`web/lib/timelineScrubber.js`) and a universal `at` coordinate threaded through every read. Today the scrubber is wired to *one* intent's DAG. **Unify them.** Put a single global playhead at the bottom of the cockpit. Dragging it re-paints the *entire* board — timeline, approvals, risks, trust drift, anchor backlog — as it stood at that block. Play it forward and watch governance happen: intents born, policies firing, approvals landing, anchors finalizing, in spine-gradient color. *No explorer lets you scrub the whole system's governance state through history.* This is your demo opener.

### SUPERPOWER 2 — Diff two moments ("what changed, and who caused it")
`fetchNarrativeRaw` (`store.js:196`) already assembles a complete cross-artifact snapshot at any `at`. Run it at block A and block B, diff the trees, and render the deltas, each linked to its causal chain. *The single most natural governance question — "what changed and why" — currently has no surface.*

### SUPERPOWER 3 — Causal "why did this happen" walk
The narrative fetch already pulls `policyDecisionTrace` and `anchorChain` (`store.js:218-219`) — the raw causal material — and renders it as a flat chapter list. **Assemble it into a clickable cause chain.**

### SUPERPOWER 4 — Authority blast-radius / what-if simulator
The trust panel *already computes* `driftImpactCount` and `dependentApprovals[].invalidated` (`web/lib/governAtlas.js:362`). **Generalize it into an interactive simulator:** "If I revoke capability C / let role R expire / degrade trust profile T — which pending approvals and in-flight intents break?"

### SUPERPOWER 5 — Reverse authority query ("who can touch this?")
Given any account/object, list **every actor, role, capability, and policy that can act on it**, ranked by risk. Data is in `governNode`.

### SUPERPOWER 6 — Pre-action blast-radius on every Sign/Submit
Move `explainSignature` (`identity.js:79-113`) into the live approve and submit flows as the pre-action consequence panel.

### SUPERPOWER 7 — Live anomaly & trend surfacing
`runtimePulse` polls drift/failures every 4s and throws each sample away. Keep a ring buffer → sparklines + threshold alerts.

### SUPERPOWER 8 — In-browser L4 proof, the whole way
The verifier punts the final L0 cross-check to a copy-paste CLI command (`web/lib/evidenceProof.js:191`) even though it knows the anchor tx and block. Add an in-app "cross-check against L0 now" button.

---

## Part 4 — Detailed recommendations

> Full step-by-step implementation lives in the runbooks. Cross-references below.

### 4.1 Information architecture — collapse 9 doors + ~50 routes to ~6 doors → [`RUNBOOK-01`](./runbooks/RUNBOOK-01-ia-consolidation.md)

**Delete outright:** the import-graph-verified orphan set (17 views + 6 libs — authoritative list in [`RUNBOOK-01`](./runbooks/RUNBOOK-01-ia-consolidation.md); excludes `network`/`verify`/`subsystems`, which are live Operate-console tabs); dead spine copies (`spineHero.js`, `spineFlow.js`, `views/live.js`); fixture-only fake tools (`studio.js`, `workbench.js`, `autopilot.js`, `rooms.js`, `companion.js`).

**Merge:** 6 "describe intent" → one **Build**; 5 "verify" → one **Verify**; 6 "learn" → one **Learn**; 2 inboxes → one **Inbox with lanes**.

**Move to docs/marketing (not app routes):** `trust-center`, `compare`, `wallet-lab`, `launch`, `design`.

**Final nav (6 doors):** `Start · Build · Verify · Cockpit · Govern · Inbox`. Fold `Agent`, `Scenarios`, `Operate` into the command palette and the surfaces above. Surface `approve`/`execute` as discoverable entry points. **Kill the orphaned `#/app` default landing** (`app.js:256-260`); make `#/start` → guided the newcomer default; experts keep `#/spine`.

### 4.2 The Cockpit — make the spine the hero → [`RUNBOOK-02`](./runbooks/RUNBOOK-02-cockpit-spine-hero.md)
Render the spine strip (or delete all three copies); single source of truth for stages; demote raw JSON from the home screen; add the global time scrubber; make rails act in place.

### 4.3 Liveness — make it honest, then make it real → [`RUNBOOK-03`](./runbooks/RUNBOOK-03-liveness-honesty.md)
Real connection status; surface `fetchedAt`/staleness; keep last-known-good on transient error; heartbeat driven by real arrivals; pause pollers on hidden/frozen + backoff; revive or delete the dead bus; route RPC errors through `parseUserError`.

### 4.4 Governance surfaces → [`RUNBOOK-04`](./runbooks/RUNBOOK-04-governance-surfaces.md)
Approve: render step graph + ghost predictions, role picker, plan diff, consequence panel, real signature (or stop calling it "Sign"). Inbox: `rationaleModal`, send `planHash`/`stageId`/`role`, honor invalidator gate, per-item rationale. Console: drill-through + expiring-authority panel. Atlas: reverse query + blast-radius + readable policy tables + drawer actions. Studio: submit confirmation re-showing the plan hash (close TOCTOU). Verifier: fix version placeholder, download offline result, in-browser L0 cross-check.

### 4.5 Visual — ship the brand, finish the centerpiece → [`RUNBOOK-05`](./runbooks/RUNBOOK-05-visual-brand-cinema.md)
Self-host Inter + JetBrains Mono; Cinema DPR/HUD/idle-loop/theme-awareness/12-shape fixes; real elevation/hover-lift; animate the Trust Boundary Map; perf (transform-based particles, scoped transitions).

### 4.6 Accessibility → [`RUNBOOK-06`](./runbooks/RUNBOOK-06-accessibility.md)
Skip link; Cinema canvas ARIA + keyboard nav + touch; JS-gated canvas reduced-motion; mobile nav collapse; status `aria-live`.

---

## Part 5 — Prioritized roadmap → [`RUNBOOK-00`](./runbooks/RUNBOOK-00-roadmap.md)

**Phase 0 — Stop lying & ship the brand (days).** Load fonts; fix narrative-cache-ignores-time bug (P3); real connection status; fix inbox bulk-approve safety hole; fix verifier version placeholder; delete or wire the dead Activity/pulse theater.

**Phase 1 — Demolition & consolidation (1–2 weeks).** Execute the IA collapse.

**Phase 2 — Render the namesake (1–2 weeks).** Spine strip as hero + single STAGES source; Cinema fixes; cockpit rails act in place.

**Phase 3 — The superpowers (3–6 weeks).** Global time scrubber → temporal diff → causal walk → blast-radius/what-if → reverse authority → pre-action consequences → anomaly trends → in-browser L4.

**The reframe:** you don't need to *build* a wow product — you've already built the hard parts. You need to **stop hiding them**, stop the liveness theater, delete the half-finished duplicates, and spend net-new effort on the 8 correlation features that turn unique data into unique insight. When you're done, Nexus is *"the only explorer that lets you scrub a blockchain's governance through time, ask why anything happened, see the blast radius before you approve it, and prove the answer offline."* Every clause of that sentence is one wiring task away from true.
