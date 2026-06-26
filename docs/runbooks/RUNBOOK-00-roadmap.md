# RUNBOOK-00 — Master Roadmap & Sequencing

> **Parent:** [`../nexus-ux-review-2026-06.md`](../nexus-ux-review-2026-06.md) (Part 5)
> **Purpose:** The execution order, dependencies, and acceptance gates for fully implementing every recommendation in Parts 4 & 5. Each work item links to the detailed runbook that specifies it.
> **Audience:** Eng lead sequencing the work; ICs pick a runbook and execute it end-to-end.

---

## How to use this set

There are eight runbooks:

| # | Runbook | Covers | Review § |
|---|---------|--------|----------|
| 00 | **this file** | Sequencing, phases, gates | Part 5 |
| 01 | [IA Consolidation](./RUNBOOK-01-ia-consolidation.md) | Delete dead views, merge duplicates, nav → 6 doors, kill `#/app` landing | 4.1 |
| 02 | [Cockpit & Spine Hero](./RUNBOOK-02-cockpit-spine-hero.md) | Render the spine, single STAGES source, demote JSON, rails act in place | 4.2 |
| 03 | [Liveness Honesty](./RUNBOOK-03-liveness-honesty.md) | Real connection status, staleness, backoff, revive/delete bus, error envelopes | 4.3 |
| 04 | [Governance Surfaces](./RUNBOOK-04-governance-surfaces.md) | Approve, Inbox safety, Console drill-through, Atlas, Studio, Verifier | 4.4 |
| 05 | [Visual / Brand / Cinema](./RUNBOOK-05-visual-brand-cinema.md) | Fonts, Cinema DPR/theme/shapes, depth, motion perf | 4.5 |
| 06 | [Accessibility](./RUNBOOK-06-accessibility.md) | Skip link, canvas a11y, reduced-motion, mobile nav | 4.6 |
| 07 | [Superpowers](./RUNBOOK-07-superpowers.md) | SP1–8: the net-new "wow" features | Part 3 / Part 5 Phase 3 |

Each runbook is self-contained: objective, preconditions, ordered tasks with file:line anchors, code-level direction, acceptance criteria, and a test plan. Runbooks are written so a developer who has never seen the codebase can complete the work without further design decisions.

---

## Phasing

The phases are ordered by **trust-per-effort** first, then by dependency. Do not start Phase _n+1_ until Phase _n_'s exit gate is green.

### Phase 0 — Stop lying & ship the brand (days)
*Highest trust-per-effort. These are small, verified, mostly independent fixes that remove dishonesty and ship the visual identity. Most can land as individual PRs in parallel.*

| Item | Runbook | Why first |
|------|---------|-----------|
| Load Inter + JetBrains Mono (self-host, `font-display:swap`) | [05 §1](./RUNBOOK-05-visual-brand-cinema.md) | Brand never renders today; highest impact/effort |
| Fix narrative-cache-ignores-`at` (P3 correctness bug) | [03 §4](./RUNBOOK-03-liveness-honesty.md) | Audit tool silently lies about time lens |
| Real connection status (`statusDot`/`statusText`) | [03 §1](./RUNBOOK-03-liveness-honesty.md) | Hardcoded "Connected" is dishonest |
| Fix inbox bulk-approve safety hole (P6) | [04 §2](./RUNBOOK-04-governance-surfaces.md) | Governance-safety regression, not cosmetic |
| Fix verifier dropzone version placeholder (`v3`→`v4`) | [04 §6](./RUNBOOK-04-governance-surfaces.md) | Users following the placeholder hit instant failure |
| Delete-or-wire the dead Activity feed + pulse | [03 §5](./RUNBOOK-03-liveness-honesty.md) | A blank panel labeled "live" reads as broken |
| Delete Cinema FPS HUD; fix DPR blur | [05 §2](./RUNBOOK-05-visual-brand-cinema.md) | Cheap, visible quality jump |

**Exit gate 0:** No surface claims liveness it doesn't have; fonts render; verifier placeholder validates; bulk-approve enforces the same gate as single-approve; `go test ./...` and `node --test web/test/*.mjs` green.

### Phase 1 — Demolition & consolidation (1–2 weeks)
*The product gets dramatically clearer with mostly deletion. Do this before building anything new so new work lands in a clean IA.*

- Execute [RUNBOOK-01](./RUNBOOK-01-ia-consolidation.md) in full: delete ~19 dead views + 4 fake builders, merge the duplicate clusters (Build / Verify / Learn / Inbox), restructure nav to 6 doors, kill the orphaned `#/app` landing, move marketing surfaces out of the app router.

**Exit gate 1:** Nav has 6 doors; every reachable route resolves to a live, non-duplicative surface; no orphaned imports; route fence tests updated and green; a new user can reach every capability from the nav or command palette (no URL-only surfaces).

### Phase 2 — Render the namesake (1–2 weeks)
*Now that the IA is clean, make the spine visible and the centerpiece sharp.*

- [RUNBOOK-02](./RUNBOOK-02-cockpit-spine-hero.md): spine strip as hero, single `STAGES` source, demote raw JSON, rails act in place.
- [RUNBOOK-05 §3–6](./RUNBOOK-05-visual-brand-cinema.md): Cinema theme-awareness + 12 shapes + idle loop; depth/elevation; motion perf.
- [RUNBOOK-06](./RUNBOOK-06-accessibility.md): can run in parallel; gate Cinema work on its keyboard-nav additions.

**Exit gate 2:** The 7-stage spine is the visual focal point of the Cockpit and renders from one shared `STAGES`; Cinema is sharp on retina, theme-aware, and draws all specified shapes; WCAG AA verified with axe on the top 6 surfaces; reduced-motion honored including canvas.

### Phase 3 — The superpowers (3–6 weeks)
*Net-new "wow." Each builds on the now-clean substrate. Order matters: SP1 unifies time, which SP2 and SP7 depend on.*

Sequence within [RUNBOOK-07](./RUNBOOK-07-superpowers.md):
1. **SP1** Global time scrubber (depends on Phase 0 `at`-invalidation fix + Phase 2 cockpit)
2. **SP2** Temporal diff (depends on SP1)
3. **SP3** Causal "why" walk (independent; can parallel SP2)
4. **SP4** Authority blast-radius / what-if (depends on Atlas work in RUNBOOK-04)
5. **SP5** Reverse authority query (independent of SP4 but shares Atlas plumbing)
6. **SP6** Pre-action consequence panel (depends on RUNBOOK-04 approve/submit work)
7. **SP7** Anomaly & trend surfacing (independent; needs the runtimePulse ring buffer)
8. **SP8** In-browser L4 cross-check (independent; extends the verifier)

**Exit gate 3:** All eight superpowers shipped and demoable; the one-sentence pitch is literally true end-to-end: *scrub governance through time, ask why anything happened, see blast radius before approving, prove the answer offline.*

---

## Cross-cutting conventions (apply in every runbook)

- **No new RPC methods invented.** Every data dependency must be an existing method on the node (`explorer.*`, `nexus.*`, `intent.*`, `evidence.*`, `governed.*`, `temporal.*`, `ghost.*`, `replay.*`). If a runbook needs data not yet exposed, it is flagged explicitly as a backend dependency, not silently assumed.
- **All reads go through `rpcWithDisclosure`** (`web/lib/spineCommon.js`) so the disclosure context and the `at` coordinate are carried automatically. Never call `rpc()` directly for a governed read.
- **Honor the five-state vocabulary** (`web/lib/states.js`) for every new data surface — never collapse `hidden`/`notProduced`/`unavailable` into a generic error.
- **One `STAGES` source** (established in RUNBOOK-02) — no new copies of the 7-stage array.
- **Reduced-motion**: any new animation must be gated by CSS `@media (prefers-reduced-motion: reduce)` and, if canvas/rAF, by a JS `matchMedia` read.
- **Tests**: structural fences are Go (`*_fence_test.go`); browser logic is `node --test web/test/*.mjs`. Every runbook lists which fences to update and which new tests to add. Both suites must stay green.
- **Deletion discipline**: when a runbook deletes a view, it must also remove its `import` and `routes` entry in `web/app.js`, any nav link in `web/index.html`, any command-palette entry, and any now-orphaned `lib/` modules and CSS blocks. Grep for the symbol before and after.

---

## Definition of done (whole programme)

1. Nav is 6 doors; zero URL-only capabilities; zero dead/duplicate views.
2. No surface claims liveness, identity, or interactivity it does not have.
3. The 7-stage spine is the visual hero and renders from one source.
4. Brand fonts ship; Cinema is sharp, theme-aware, fully-shaped, idle-when-static.
5. WCAG AA verified on the top surfaces; reduced-motion fully honored.
6. Approvals are safe end-to-end (single and bulk); consequence panel on every act.
7. All eight superpowers shipped and demoable.
8. `go test ./...` and `node --test web/test/*.mjs` green; fence tests updated to match the new IA.
