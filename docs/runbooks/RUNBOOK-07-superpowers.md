# RUNBOOK-07 — The Eight Superpowers (net-new "wow")

> **Parent:** [`../nexus-ux-review-2026-06.md`](../nexus-ux-review-2026-06.md) — **Part 3** ("The WoW: the superpowers you already have the data for") and **Part 5 Phase 3** ("The superpowers").
> **Sequencing:** [`RUNBOOK-00`](./RUNBOOK-00-roadmap.md) Phase 3, exit gate 3.
> **Audience:** Product engineer building the correlation features that turn the existing RPC data into unique governance insight. Every task is implementable without further design decisions.

---

## Objective

Ship the eight "superpowers" (SP1–SP8). Each one is a **correlation / diff / walk / index layer over data the RPC layer already returns** — none of them require green-field invention, and (with the dependency exceptions flagged explicitly below) none require a new node RPC. When this runbook is complete, the product's one-sentence pitch is literally true end-to-end:

> *Nexus is the only explorer that lets you scrub a blockchain's governance through time, ask why anything happened, see the blast radius before you approve, and prove the answer offline.*

**Exit gate 3 (from RUNBOOK-00):** All eight superpowers shipped and demoable; the pitch sentence above is true; `go test ./...` and `node --test web/test/*.mjs` green.

### Per-superpower exit checklist (gate 3 detail)

| SP | Demoable claim | Ships fully client-side? |
|----|----------------|--------------------------|
| SP1 | Drag one playhead → whole cockpit re-paints at that block | Yes (needs RUNBOOK-03 Task 4 `at`-invalidation + RUNBOOK-02 cockpit) |
| SP2 | Pick block A & B → "what changed and who" delta list | Yes |
| SP3 | Click a failed outcome → expand the cause chain to the root block | Yes |
| SP4 | Hover/select a node → blast radius lights the graph; POLICY_* allow/deny delta before submit | Partial — policy delta uses `policy.simulate`; full authority what-if flagged |
| SP5 | Type an account/object → ranked table of everything that can act on it | Yes (scale caveat flagged) |
| SP6 | Every Sign/Submit shows "what this does / irreversible / funds move / expected proof" | Yes |
| SP7 | Telemetry rail shows sparklines + "drift +3σ in 5 min" alerts | Yes |
| SP8 | "Cross-check against L0 now" → receipt upgrades to L4 in the browser | Needs CORS-reachable L0 endpoint (flagged) |

---

## Preconditions (must be green before starting)

| Precondition | Source | Why |
|---|---|---|
| **`at`-coordinate invalidation wired into the store** | RUNBOOK-03 Task 4 — store subscribes to `onAtChange` and invalidates `cockpit` / `recentIntents` / `runtimePulse` / `narrative:*` | SP1/SP2 are correctness-broken without it (P3 bug: narrative cache ignores the time cursor — `store.js:46-50`, `272-293` have no `at` subscription today) |
| **Cockpit hero exists with a stable mount host** | RUNBOOK-02 | SP1 mounts the board scrubber at the cockpit's foot; SP7 hangs sparklines on the telemetry rail |
| **Atlas readability + drawer actions** | RUNBOOK-04 Task 4 | SP4/SP5 share the Atlas plumbing; RUNBOOK-04 Task 4 explicitly defers blast-radius/reverse-query here |
| **Approve/Submit parity** | RUNBOOK-04 Task 2 & Task 7 | SP6 relocates the consequence engine into the live flows those tasks restructure |
| **Verifier completion (v4 placeholder fix, offline result download)** | RUNBOOK-04 Task 6 | SP8 extends the same verifier/receipt surface |

### Cross-cutting conventions (from RUNBOOK-00)

- **No new RPC methods invented.** Every method named below was verified present by `rg` against `web/` (see the method inventory in the Backend-Dependency Summary). Genuinely-missing capabilities are flagged as backend dependencies, never silently assumed.
- **All governed reads go through `rpcWithDisclosure`** (`web/lib/spineCommon.js:58-60`) so disclosure + `at` are carried automatically. The one exception is the explicit-`at` snapshot helper in SP2, which is itself built on `rpc` + `DISCLOSURE` + an explicit `at` and documented as such.
- **Honor the five-state vocabulary** (`web/lib/states.js`) on every new data surface.
- **Reduced-motion:** every new animation is gated by CSS `@media (prefers-reduced-motion: reduce)` and (for rAF/canvas) a JS `matchMedia` read.
- **Tests:** browser logic → `node --test web/test/*.mjs`; structural fences → Go `*_fence_test.go`.

---

## Dependency & sequencing diagram

Matches RUNBOOK-00 Phase 3 order. Arrows = "must land before."

```
                    RUNBOOK-03 Task 4 (store subscribes onAtChange)
                    RUNBOOK-02 (cockpit hero)
                              │
                              ▼
            ┌──────────────  SP1  ──────────────┐         the "at-pipeline"
            │   Global time scrubber (board)    │         (one playhead → setAt)
            └───────────────┬───────────────────┘
                            │ shares the at-pipeline
              ┌─────────────┼──────────────┐
              ▼                            ▼
            SP2                           SP7
   Temporal diff (A vs B)        Anomaly & trend surfacing
   (explicit-at snapshots)       (runtimePulse ring buffer)
              │
              ▼  (independent of SP2; can run in parallel)
            SP3  Causal "why" walk  ──────── independent

   RUNBOOK-04 Task 4 (Atlas) ──────── shared Atlas plumbing ───────┐
              │                                                     │
              ▼                                                     ▼
            SP4                                                   SP5
   Authority blast-radius / what-if                     Reverse authority query
   (governNode + policy.simulate)                       (governAtlas/governNode index)

   RUNBOOK-04 Task 2 & 7 (approve/submit) ──────► SP6  Pre-action consequence panel

   RUNBOOK-04 Task 6 (verifier) ──────► SP8  In-browser L4 cross-check
```

Recommended build order (RUNBOOK-00 Phase 3): **SP1 → SP2 → SP3 → SP4 → SP5 → SP6 → SP7 → SP8.** SP3, SP5, SP7, SP8 are independent and can be parallelized by additional ICs once their preconditions are met.

---

## Consolidated "new files" manifest

All paths relative to `web/`. Edits to existing files are listed per-section.

| New file | Superpower | Purpose |
|---|---|---|
| `lib/timeSnapshot.js` | SP1, SP2 | `rpcAt(method, params, atCoord)` explicit-`at` bypass helper + `fetchBoardSnapshot(atCoord)` board-level cross-artifact fetcher |
| `lib/boardScrubber.js` | SP1 | Cockpit-level playhead bound to `timeContext.setAt`; mirrors `timelineScrubber` UX at board scope; pauses pollers when `!isAtLive()` |
| `lib/temporalDiff.js` | SP2 | Pure diff engine over two board snapshots → typed delta list, each delta carrying a causal-chain ref |
| `views/diff.js` | SP2 | `#/diff` route (A/B block pickers + delta render); also exported as an embeddable cockpit mode |
| `lib/causalWalk.js` | SP3 | Pure assembler: outcome failure → compensation → policy denial → trust drift → block, from a narrative snapshot |
| `lib/causalWalkView.js` | SP3 | Collapsible cause-chain renderer mounted inside the narrative |
| `lib/blastRadius.js` | SP4 | Pure projection from a `governNode` (any kind) → affected approvals + in-flight intents; graph-highlight set |
| `lib/whatIfSimulator.js` | SP4 | Interactive simulator UI + `policy.simulate` allow/deny delta for POLICY_* changes |
| `lib/authorityIndex.js` | SP5 | Client-side reverse index builder over the atlas graph (target → actors/roles/caps/policies, risk-ranked) |
| `views/reverseQuery.js` | SP5 | `#/govern/who-can-touch` search input + results table (also embedded as an Atlas panel) |
| `lib/consequencePanel.js` | SP6 | Wraps `explainSignature` (`identity.js`) over a **real** plan/dossier; emits a single risk badge |
| `lib/pulseBuffer.js` | SP7 | Capped client-side ring buffer of `runtimePulse` samples + trend/σ computation |
| `lib/trendAlerts.js` | SP7 | Threshold/σ alert renderer for the telemetry rail (sparklines + alert rows) |
| `lib/l0CrossCheck.js` | SP8 | Direct (non-Infrix) L0 query of the anchor tx/block → honest receipt upgrade |
| `test/timeSnapshot.test.mjs` … (one per lib) | all | `node --test` coverage (see each section's test plan) |

**Existing files edited:** `lib/store.js` (SP1/SP2/SP7 board-snapshot fetcher + buffer hook), `views/spine.js` or the cockpit host from RUNBOOK-02 (SP1 mount), `lib/narrative.js` (SP3 mount point), `lib/governAtlas.js` + `views/govern.js` (SP4/SP5 panels), `views/approve.js` + `lib/cockpitRails.js` + `views/compose.js` (SP6 wiring), `lib/telemetry.js` (SP7 rail), `lib/evidenceProof.js` + `views/prove.js` + `lib/proofReceipt.js` (SP8), `web/app.js` (routes `#/diff`, `#/govern/who-can-touch`).

---

# SP1 — Global time scrubber ("the time machine")

### Objective
Replace the single-DAG block scrubber with a **cockpit-level playhead** that re-paints the *entire* board — spine timeline, pending approvals, risk rail, trust drift, anchor backlog — as it stood at any block. Dragging sets the global `at` coordinate; every store slice re-fetches at that block; play-forward animates governance happening in spine-gradient color.

### Data sources (existing RPC, cited)
The board is already powered by store slices that flow through `rpcWithDisclosure` → `withAt` (`spineCommon.js:58-60`, `timeContext.js:67-71`), so **every read already honors the `at` cursor once the store re-fetches on `at` change**:
- `nexus.cockpit` — the single cockpit projection (`store.js:185-188`).
- `explorer.recentIntents` — spine timeline rows (`store.js:171-173`).
- `runtimePulse` bundle: `explorer.anchorMode` / `explorer.pluginStatus` / `explorer.trustDrift` / `explorer.workflowHealth` (`store.js:175-183`) — anchor backlog + trust drift + workflow failures.

The `at` plumbing already exists end-to-end: `timeContext.setAt()` (`timeContext.js:44-52`) notifies `onAtChange` subscribers and serializes `?at=block:N` into the URL (`syncUrl`, `timeContext.js:110-127`). `isAtLive()` (`timeContext.js:35-38`) tells pollers whether to keep ticking.

> **Precondition (RUNBOOK-03 Task 4):** the store must subscribe to `onAtChange` and invalidate `cockpit`/`recentIntents`/`runtimePulse`/`narrative:*`. Today it does not (`store.js:46-50`, `272-293`) — that is the P3 correctness bug. SP1 is theater without it: the scrubber would move the URL but the panels would keep showing live data.

### UX spec
- A persistent **board scrubber bar** docked at the bottom of the cockpit (mounted by RUNBOOK-02's cockpit host). Visually mirrors `timelineScrubber` (`timelineScrubber.js:60-173`): a rail, tick marks, a draggable playhead with a `block N of MAX` readout, Play/Pause + speed cycle (1×/2×/5×) + step buttons, and keyboard nav (←/→ step, Space play/pause, Shift+←/→ ±10).
- **Block range:** min = earliest block visible in `recentIntents`/cockpit; max = current head (the live header block height, read from `#headerBlockHeight` as telemetry already does — `telemetry.js:125-128`).
- **Live vs frozen:** when the playhead is at MAX (head) the cursor is **live** (`setAt(null)`); dragging back **freezes** (`setAt({ block })`). A "● LIVE / ❚❚ FROZEN @ block N" pill reflects `isAtLive()`. A "Return to live" affordance snaps to MAX and clears `at`.
- **Play forward:** advances the playhead one block per tick (reuse the `startPlay`/`stopPlay` interval model, `timelineScrubber.js:272-288`), calling `setAt({ block })` on each advance. The spine gradient (`--spine-1..7`) animates as stages light up: intents born, approvals landing, anchors finalizing. Gated by reduced-motion.
- **URL is shareable:** because `setAt` writes `?at=block:N`, a frozen board is a shareable link (existing behavior).

### Component & file plan
- **New `lib/boardScrubber.js`** — `mountBoardScrubber(host, { getRange, onLiveChange })`. Internally a thin reshape of `timelineScrubber.js`'s control/keyboard/play machinery, but its `onSeek` calls `setAt`/`setAt(null)` instead of a local callback, and it has no DAG-node markers (board scope). **Do not** import `rewindGraphToBlock` here — that is a DAG-node operation; at board scope the "rewind" is the store re-fetching at the new `at` (the panels re-render themselves via their existing slice subscriptions). The `rewindGraphToBlock` *pattern* (deterministic re-derivation at a playhead) is reused conceptually, but board re-painting is data-driven, not client-recomputed.
- **Edit the cockpit host** (RUNBOOK-02's `views/spine.js` or its successor): mount the scrubber, give it a `getRange()` that reads min/max from the `recentIntents` + header block.
- **Reuse `timeContext`** verbatim — no edits.

### Algorithm
```js
// lib/boardScrubber.js  (pseudocode)
import { setAt, getAt, isAtLive, onAtChange } from '/lib/timeContext.js';

export function mountBoardScrubber(host, { getRange }) {
  const { min, max } = getRange();          // from recentIntents + head block
  let block = max;                          // start live (at head)

  function seek(b) {
    block = clamp(min, max, Math.round(b));
    if (block >= max) setAt(null);          // snap to head == live
    else setAt({ block });                  // freeze; store re-fetches via onAtChange
    paint();
  }

  // Play forward: one block per tick; the board re-paints because the
  // store's onAtChange subscriber (RUNBOOK-03 T4) invalidates every slice.
  function tick() { if (block >= max) return stop(); seek(block + 1); }

  // Reflect external at changes (deep-link, popstate) back into the UI.
  onAtChange((at) => { block = at && at.block ? at.block : max; paint(); });
}
```
**Poller pause when frozen.** Pollers must not keep hammering immutable history. Two enforcement points (both already partially present): (a) the store's `ensurePoller` interval callback should early-return when `!isAtLive()` (add the guard alongside RUNBOOK-03's hidden-tab/backoff work — `store.js:150-162`); (b) the approve view already demonstrates the pattern — `if (!isAtLive()) return;` inside its poll tick (`approve.js:102-105`). Mirror that guard in every interval the cockpit owns.

### Acceptance
- Dragging the playhead to block N freezes the board; **all** panels (spine timeline, approvals, risk rail, trust-drift tile, anchor backlog) re-render as of block N; the URL shows `?at=block:N`.
- Releasing at the head / clicking "Return to live" clears `?at=` and resumes live polling.
- While frozen, the cockpit issues **zero** repeat polls of historical slices (verify via a network spy / poll-count counter).
- Play forward animates stages lighting in spine-gradient order; reduced-motion disables the animation but still steps the data.

### Test plan
- `test/boardScrubber.test.mjs`: with a stub `timeContext`, assert `seek(mid)` calls `setAt({block:mid})`, `seek(max)` calls `setAt(null)`, and play advances exactly one block/tick and stops at max.
- Store test: assert the `onAtChange` subscriber invalidates each slice key exactly once per `at` change (extends RUNBOOK-03 Task 4's test).
- Poller-pause test: with `isAtLive()` stubbed false, assert the interval callback performs no fetch.

### Backend dependencies
**None new** — *provided the node already honors the `at` coordinate for `nexus.cockpit`, `explorer.recentIntents`, and the four `runtimePulse` reads.* The review asserts `at` is "threaded through every read" (Part 0/Executive). **Verify server-side** that `nexus.cockpit` and `explorer.trustDrift`/`workflowHealth`/`pluginStatus`/`anchorMode` actually resolve historical snapshots (not just accept-and-ignore `at`). If any of those ignore `at`, that specific method is a backend dependency: "honor `at` in <method>." Flag it; do not fake it.

---

# SP2 — Temporal diff ("what changed, and who")

### Objective
Run a board-level snapshot at block **A** and block **B**, diff the artifact trees, and render typed deltas — *new intents, a policy that began denying X, a trust profile that degraded and invalidated N approvals, an anchor that finalized* — each linked to its causal chain (SP3).

### Data sources (existing RPC, cited)
`fetchNarrativeRaw` (`store.js:196-237`) already assembles a complete cross-artifact snapshot for one intent at the current `at`. SP2 needs the **same artifacts at two explicit blocks**, plus a board-wide list. Reuse:
- `explorer.recentIntents` (board list — `store.js:171`), `nexus.cockpit` (board projection — `store.js:185`).
- Per-changed-intent depth: the exact set `fetchNarrativeRaw` fetches — `intent.get`, `explorer.planGet`, `explorer.approvalByPlan`, `explorer.outcomeGet`, `evidence.get`, `explorer.anchorGet`, `explorer.policyDecisionTrace`, `explorer.anchorChain` (`store.js:198-220`).
- Trust degradation deltas: `explorer.trustDrift` + (for the invalidation count) `nexus.governNode` `{kind:'trust'}` which carries `driftImpactCount` and `dependentApprovals[].invalidated` (`governAtlas.js:362-371`).

### The explicit-`at` problem (must solve first)
`rpcWithDisclosure` → `withAt({...DISCLOSURE, ...params})` (`spineCommon.js:59`). `withAt` (`timeContext.js:67-71`) **overrides** any caller-supplied `at` with the *global* cursor whenever the global cursor is set. So you cannot reliably fetch "block A" while the board is frozen at block B by passing `{at:{block:A}}` — the global wins. SP2 therefore needs a bypass.

**New `lib/timeSnapshot.js`:**
```js
import { rpc } from '/lib/rpc.js';
import { DISCLOSURE } from '/lib/spineCommon.js';

// Explicit-at read: disclosure context + an EXPLICIT at, ignoring the
// global cursor. Used only for snapshot/diff fetchers.
export function rpcAt(method, params = {}, atCoord = null) {
  const p = { ...DISCLOSURE, ...params };
  if (atCoord) p.at = atCoord;          // {block:N} | {version:N} | {time:ISO}
  return rpc(method, p);
}
```
> Note `DISCLOSURE` is exported from `spineCommon.js:33`. This helper is the *one* sanctioned place to call `rpc` directly with an explicit `at`; document it inline so reviewers don't flag a convention break.

### Snapshot shape
```js
// fetchBoardSnapshot(atCoord) → BoardSnapshot
{
  at: { block: N },
  intents: Map<intentId, {
    id, state, stage,                 // from recentIntents row
    planId, planHash,                 // explorer.planGet
    approvals: { required, signed, remaining, invalidated },  // approvalByPlan + governNode(trust)
    outcome: { id, overallStatus } | null,
    anchor:  { recordId, status, txHash, blockHeight } | null,
    policyDecision: { allowed, denials:[...] } | null,  // policyDecisionTrace
  }>,
  trust:  Map<profileId, { state, version, driftImpactCount }>,
  anchorBacklog: number,              // from runtimePulse.anchor
}
```
`fetchBoardSnapshot` fans out with `rpcAt` at the fixed `atCoord` (board list first, then per-intent depth in parallel, mirroring `fetchNarrativeRaw`'s two-phase fan-out — `store.js:198-220`). Cache by `block` so re-diffing is cheap.

### Diff algorithm
```js
// lib/temporalDiff.js  (pure; no DOM, no RPC)
export function diffSnapshots(a, b) {            // a = earlier, b = later
  const deltas = [];

  // 1. Intents born / advanced / failed
  for (const [id, bi] of b.intents) {
    const ai = a.intents.get(id);
    if (!ai) { deltas.push(D('intent_created', { id, stage: bi.stage })); continue; }
    if (ai.stage !== bi.stage)  deltas.push(D('intent_advanced', { id, from: ai.stage, to: bi.stage }));
    if (ai.state !== bi.state)  deltas.push(D('intent_state',    { id, from: ai.state, to: bi.state }));

    // 2. Policy began denying X
    const aAllow = ai.policyDecision?.allowed, bAllow = bi.policyDecision?.allowed;
    if (aAllow !== false && bAllow === false)
      deltas.push(D('policy_now_denies', { id, denials: bi.policyDecision.denials, causal: bi /* SP3 ref */ }));

    // 3. Approvals invalidated (trust degradation downstream)
    if ((bi.approvals.invalidated||0) > (ai.approvals.invalidated||0))
      deltas.push(D('approvals_invalidated', { id, count: bi.approvals.invalidated - (ai.approvals.invalidated||0) }));

    // 4. Anchor finalized
    if (ai.anchor?.status !== 'anchored' && bi.anchor?.status === 'anchored')
      deltas.push(D('anchor_finalized', { id, txHash: bi.anchor.txHash, block: bi.anchor.blockHeight }));
  }

  // 5. Trust profiles degraded between A and B
  for (const [pid, bt] of b.trust) {
    const at = a.trust.get(pid);
    if ((at?.state||'active') === 'active' && bt.state !== 'active')
      deltas.push(D('trust_degraded', { pid, to: bt.state, invalidated: bt.driftImpactCount }));
  }
  return sortByStage(deltas);   // order by spine stage so the story reads intent→anchor
}
const D = (kind, payload) => ({ kind, ...payload });
```
Each delta carries enough to deep-link: intent deltas link to `#/spine/<id>` (and to the SP3 causal walk via the `causal` ref); trust deltas link to `#/govern/trustProfiles/<pid>`; anchor deltas to the anchor record.

### Diff UI
New route **`#/diff`** (`views/diff.js`), also exported as an embeddable cockpit mode (a "Compare" toggle on the SP1 scrubber that captures the current frozen block as A, then B):
- Two block pickers (A / B) defaulting to `[head-100, head]`; "use current playhead" buttons fed by SP1.
- A grouped delta list, ordered by spine stage, each row: a stage-colored dot, a plain-language line ("Policy on `acc://…` began **denying** intent `…`"), a severity pill (reuse `severityBadge` from `lib/severity.js`), and a deep-link.
- Empty/loading/error honor the five-state vocabulary. If a snapshot returns `hidden`/`notProduced` for a sub-artifact, the delta row says "changed (details redacted by disclosure)" rather than inventing a value.

### Acceptance
- Selecting A<B renders a deterministic, stage-ordered delta list; A==B renders "no changes."
- A trust-degradation between A and B shows both the `trust_degraded` delta and the downstream `approvals_invalidated` delta(s), each deep-linking correctly.
- Diffing while the board is frozen at some third block does **not** corrupt A/B (proves the `rpcAt` bypass works).

### Test plan
- `test/temporalDiff.test.mjs`: feed two hand-built `BoardSnapshot` fixtures; assert each of the 5 delta kinds fires exactly when expected and never on no-change; assert stage ordering.
- `test/timeSnapshot.test.mjs`: stub `rpc`; assert `rpcAt(m,p,{block:5})` sends `at:{block:5}` even when the global cursor is `{block:9}`.

### Backend dependencies
**None new** beyond the same SP1 caveat (the depended-on methods must honor `at`). The diff and snapshot assembly are 100% client-side.

---

# SP3 — Causal "why" walk

### Objective
On a **failed** outcome, assemble a clickable cause chain: *outcome failed → compensation stage → policy denied → trust drift on profile → block*. Today the raw causal material is fetched but rendered as a flat chapter list.

### Data sources (existing RPC, cited) — already in the narrative fetch
`fetchNarrativeRaw` already pulls every link of the chain (`store.js:218-219` and surrounding):
- `explorer.policyDecisionTrace` → `policies` (the denial reasons + which rule/policy denied) — `store.js:218`.
- `explorer.anchorChain` → `anchorChain` (the anchor lineage + block) — `store.js:219`.
- `explorer.outcomeGet` → `outcome` (`overallStatus`, `StepOutcomes`, compensation stages) — `store.js:215`.
- Trust linkage: the policy decision references a trust profile; resolve detail via `nexus.governNode {kind:'trust', id}` (`governAtlas.js:351-371`) for the `degradedReason`/`degradedAt`/`version` and `driftImpactCount`.

No new fetch is required for the common case — the narrative snapshot already has `outcome`, `policies`, `anchorChain`. The optional trust-profile hop is a single `governNode` call, lazy-loaded when the user expands that link.

### Chain data structure
```js
// lib/causalWalk.js  (pure; input = a narrative snapshot from store.js)
// Returns null when the outcome did not fail (nothing to explain).
buildCausalChain(snapshot) → {
  root: 'outcome',
  links: [
    { kind: 'outcome',      id, status: 'failed', detail, ref: '#/spine/'+id },
    { kind: 'compensation', stageId, status, detail },          // from outcome.StepOutcomes
    { kind: 'policy',       policyId, decision: 'denied', rule, reason, ref: '#/govern/policies/'+policyId },
    { kind: 'trust',        profileId, state: 'degraded', reason, atBlock, ref: '#/govern/trustProfiles/'+profileId },
    { kind: 'block',        block, txHash, ref: anchorRef },     // terminal anchor/block
  ],
  confidence: 'derived' | 'partial'   // 'partial' when a hop is hidden/notProduced
}
```

### Walk algorithm
```js
export function buildCausalChain(s) {
  const oc = s.outcome;
  if (!oc || oc.overallStatus !== 'failed') return null;     // only explain failures
  const links = [{ kind:'outcome', id:s.intent.id, status:'failed', detail: oc.failureReason, ref:'#/spine/'+s.intent.id }];

  // 1. compensation stage that fired (or failed to)
  const comp = (oc.StepOutcomes||oc.stepOutcomes||[]).find(st => /compensat/i.test(st.kind||st.stage||''));
  if (comp) links.push({ kind:'compensation', stageId: comp.id, status: comp.status, detail: comp.detail });

  // 2. policy denial that caused the failure
  const denial = pickDenial(s.policies);     // policyDecisionTrace: first allowed===false decision
  if (denial) links.push({ kind:'policy', policyId: denial.policyId, decision:'denied',
                           rule: denial.rule, reason: denial.reason, ref:'#/govern/policies/'+denial.policyId });

  // 3. trust drift behind the policy denial (if the denial cites a profile)
  if (denial && denial.trustProfileId)
    links.push({ kind:'trust', profileId: denial.trustProfileId, state:'degraded', _lazy:true,
                 ref:'#/govern/trustProfiles/'+denial.trustProfileId });

  // 4. terminal block from the anchor chain (deepest known block)
  const tail = (s.anchorChain && s.anchorChain.links || []).slice(-1)[0];
  if (tail) links.push({ kind:'block', block: tail.blockHeight, txHash: tail.txHash, ref: '#/anchors/'+(tail.recordId||'') });

  return { root:'outcome', links, confidence: links.some(l=>l._hidden) ? 'partial' : 'derived' };
}
```
`pickDenial(policies)` walks the `policyDecisionTrace` array and returns the first decision with `allowed === false`, surfacing its `policyId`, the matched `rule`, the human `reason`, and (if present) the cited `trustProfileId`.

### Walk UI
- New `lib/causalWalkView.js`: a collapsible "Why did this fail?" panel mounted **inside** the narrative (`lib/narrative.js`) directly under the outcome chapter, only when `buildCausalChain` returns non-null.
- Rendered as an ordered list of cause links (reuse the visual idiom of `evidenceProof.js`'s chain walker — `evidenceProof.js:387-431` — stage-colored `<li>` with kind + id + meta). Each link is clickable to its `ref`. The trust hop (`_lazy:true`) fetches `governNode` on expand and fills in `reason`/`atBlock`/`driftImpactCount`.
- Honesty: if a hop is `hidden`/`notProduced`, render that link as "cause redacted by disclosure" / "not yet produced" (never fabricate), and mark the panel `confidence: partial`.

### Acceptance
- A failed outcome shows the full chain down to a block; a successful/in-flight outcome shows **no** panel.
- Each link deep-links to the correct surface (policy node, trust node, anchor).
- A redacted hop degrades gracefully to a five-state node and flips confidence to "partial."

### Test plan
- `test/causalWalk.test.mjs`: feed a failed-outcome snapshot fixture (with a policy denial citing a degraded trust profile) → assert the 5-link chain; feed a success snapshot → assert `null`; feed a snapshot with a hidden policy hop → assert `confidence:'partial'`.

### Backend dependencies
**None.** Entirely client-side from data the narrative fetch already returns (`store.js:215-219`), plus one optional lazy `nexus.governNode` hop that already exists.

---

# SP4 — Authority blast-radius / what-if simulator

### Objective
Generalize the trust panel's *already-computed* blast-radius (`governAtlas.js:362-371`: `driftImpactCount` + `dependentApprovals[].invalidated`) into an **interactive simulator across all node kinds**: "if I revoke capability C / let role R expire / degrade trust profile T — which pending approvals and in-flight intents break?" Hovering a node lights its blast radius on the graph. Before submitting a **POLICY_\*** change in Studio/compose, show the allow/deny delta.

### Data sources (existing RPC, cited)
- `nexus.governNode` (`govern.js:111`, rendered by `governAtlas.js:222-443`) already returns per-kind authority data:
  - **trust:** `driftImpactCount`, `dependentApprovalCount`, `dependentApprovals[].{role,planId,invalidated}` (`governAtlas.js:362-371`).
  - **capability:** `object`, `grantee`, `expiresAtBlock`, `delegationChain` (`governAtlas.js:304-326`).
  - **policy:** `affected[]` (intents the policy touches — `governAtlas.js:348`), `rules`, `targetId`.
  - **role:** `holders[]`, bound `policies[]` (`governAtlas.js:295-298`).
  - **approval:** `trustProfId`, `planId`, `role`, `state` (`governAtlas.js:420-431`).
- `nexus.governAtlas` (`govern.js:89`) — the full graph for resolving cross-references (which approvals depend on which capability/role).
- **Policy allow/deny delta:** `policy.simulate` — **verified present** (`views/policies.js:502`). This is the sanctioned RPC for "if this policy changed, what would the decision be."

### Client-side vs backend (explicit determination)
- **Trust degradation blast-radius:** *already computed server-side* and returned in `governNode` (`driftImpactCount`, `dependentApprovals[].invalidated`). **Client-side** — just project it.
- **Capability revoke / role expiry blast-radius:** derivable **client-side** by graph walk from the atlas: a capability's blast radius = approvals/intents whose authority path traverses that capability (`object`/`grantee`/`delegationChain`) + the policies that reference it. This is an *approximation* that mirrors what the InvalidationChecker does, built from the same node data the drawer already renders. Good enough for "lights up the graph."
- **POLICY_\* allow/deny delta:** use `policy.simulate` — **no approximation needed**, the node computes it.
- **A precise, transactional "revoke C → exact invalidation set":** there is **no dedicated what-if RPC** for arbitrary authority mutations (only `policy.simulate` for policies and `ghost.simulate`/`temporal.simulate` for execution/temporal — verified at `subsystems.js:384,603`). The client-side graph walk is the shipped behavior; a precise backend `governed.whatIf(mutation)` is a **flagged backend dependency** for exactness at scale. Label the client result "estimated blast radius (derived from the authority graph)" so the UI is honest about precision.

### Component & file plan
- **New `lib/blastRadius.js`** (pure): `computeBlastRadius(atlas, node, mutation)` → `{ approvals:[...], intents:[...], highlightIds:Set }`. `mutation` ∈ `{revoke_capability, expire_role, degrade_trust}`.
- **New `lib/whatIfSimulator.js`**: the interactive panel. For governance nodes it renders the blast list + a "highlight on graph" toggle that emits `highlightIds` to the Atlas renderer. For POLICY_* it calls `policy.simulate` and renders the allow/deny diff.
- **Edit `lib/governAtlas.js`** `renderGovernNode` (`governAtlas.js:222`): add a "What-if" section to the capability/role/trust drawers that mounts `whatIfSimulator`. **Reuse** the existing trust banner/`dependentApprovals` projection — do not rebuild it (RUNBOOK-04 Task 4 step 3 explicitly says "do not rebuild blast-radius here; reuse this projection for the what-if surface").
- **Edit the submit preview** (`views/compose.js:371` and `lib/cockpitRails.js:376`): when `goalType` starts with `POLICY_`, call `policy.simulate` with the proposed rule change and show the allow/deny delta **before** enabling Submit. (The preview already disables Submit on `policyDecision.allowed === false` — `compose.js:381-383` — extend that to show the *diff vs current*.)

### Algorithm
```js
// lib/blastRadius.js
export function computeBlastRadius(atlas, node, mutation) {
  const approvals = [], intents = [], highlightIds = new Set([node.id]);

  if (mutation === 'degrade_trust') {
    // Server already told us — just read it.
    for (const a of (node.dependentApprovals || [])) {
      approvals.push({ planId: a.planId, role: a.role, breaks: true /* invalidated under degrade */ });
      highlightIds.add(a.planId);
    }
    return { approvals, intents, highlightIds, source: 'server' /* exact */ };
  }

  if (mutation === 'revoke_capability') {
    // Walk the atlas: approvals/intents whose authority path used this capability.
    for (const ap of (atlas.approvals || [])) {
      if (usesCapability(ap, node)) { approvals.push({ planId: ap.planId, role: ap.role, breaks: true }); highlightIds.add(ap.id); }
    }
    for (const it of (atlas.actors?.flatMap(a => a.intents) || [])) {
      if (intentDependsOnCap(it, node)) { intents.push({ id: it.id }); highlightIds.add(it.id); }
    }
    return { approvals, intents, highlightIds, source: 'derived' /* estimated */ };
  }

  if (mutation === 'expire_role') {
    for (const h of (node.holders || [])) highlightIds.add(h.id);
    for (const p of (node.policies || [])) highlightIds.add(p.targetId);
    // approvals signed under this role become unsatisfiable
    for (const ap of (atlas.approvals || [])) if (ap.role === node.role) { approvals.push({ planId: ap.planId, role: ap.role, breaks: true }); highlightIds.add(ap.id); }
    return { approvals, intents, highlightIds, source: 'derived' };
  }
}
```
For POLICY_* in the submit flow:
```js
const sim = await rpcWithDisclosure('policy.simulate', { /* proposed rule params */ });
// render: decisions that flip allowed:true -> false (newly denied) and vice-versa
```

### UX spec
- In a capability/role/trust drawer: a **"What if I revoke/expire/degrade this?"** button → expands a list of breaking approvals + in-flight intents, with a count headline ("**7** pending approvals and **3** in-flight intents would break"). A "Show on graph" toggle highlights `highlightIds` in the atlas grid.
- Hovering a node row pre-lights its (cheap, count-only) blast radius without expanding.
- Submit flow (POLICY_*): an allow/deny **delta table** ("This policy change would newly **deny**: 2 intents; newly **allow**: 0") rendered above the Submit button; Submit stays disabled while the user hasn't acknowledged a net-deny.
- "Estimated" badge whenever `source === 'derived'`.

### Acceptance
- Trust-degrade blast radius matches the server's `driftImpactCount`/`dependentApprovals` exactly (source: server).
- Capability-revoke / role-expire produce a non-empty, deep-linkable breaking set on a fixture with known dependencies, badged "estimated."
- A POLICY_* submit shows a real allow/deny delta from `policy.simulate` and blocks submit on net-new denials until acknowledged.

### Test plan
- `test/blastRadius.test.mjs`: feed an atlas + trust node fixture → assert exact match to `dependentApprovals`; feed a capability node with two dependent approvals → assert both in the breaking set + `source:'derived'`.
- `test/whatIf.policy.test.mjs`: stub `policy.simulate` → assert the delta table classifies flips correctly and gates Submit.

### Backend dependencies
- **`policy.simulate`** — **exists** (`policies.js:502`). No new dependency for the policy-delta path.
- **Precise arbitrary-mutation what-if** (`governed.whatIf`) — **does not exist; flagged as an optional backend dependency** for exactness. The shipped feature uses the client-side derived estimate + the exact server-provided trust projection, clearly badged.

---

# SP5 — Reverse authority query ("who can touch this?")

### Objective
Given any account/object, list **every actor, role, capability, and policy that can act on it**, risk-ranked. The forward direction (node → what it can do) exists in the Atlas; SP5 builds the **reverse index** (target → who can act on it).

### Data sources (existing RPC, cited)
- `nexus.governAtlas {limit:500}` (`govern.js:89`) — the full node set per kind (`actors/roles/capabilities/policies/approvals/trustProfiles/plugins`, `governAtlas.js:24-32`).
- `nexus.governNode` (`govern.js:111`) for the fields that name a target:
  - **capability.object** (`governAtlas.js:308`) — the object a capability is scoped to.
  - **policy.targetId** / **policy.affected** (`governAtlas.js:333,348`).
  - **role.scopeTarget** (`governAtlas.js:287`), **role.holders** (`governAtlas.js:295`).
  - **actor.capabilities / actor.roles** (`governAtlas.js:166-167`, `274-275`).
- Optional corroboration already in the codebase: `explorer.capabilityByIdentity` (`capabilities.js:218`), `explorer.roleHolders` (`drawer.js:208`), `explorer.capabilityGrants` (`drawer.js:236`) — handy for a deep "who holds this role" hop.

### Index-building (client-side aggregation)
```js
// lib/authorityIndex.js  (pure aggregation over the atlas graph)
// Build once per atlas load; query many times.
export function buildAuthorityIndex(atlas, nodesByKind) {
  const index = new Map();   // targetKey -> { capabilities:[], policies:[], roles:[], actors:[] }
  const add = (target, bucket, entry) => {
    if (!target) return;
    const k = normalize(target);                       // canonical acc:// or object id
    const e = index.get(k) || { capabilities:[], policies:[], roles:[], actors:[] };
    e[bucket].push(entry); index.set(k, e);
  };

  for (const c of nodesByKind.capabilities || [])
    add(c.object, 'capabilities', { id:c.id, capability:c.capability, grantee:c.grantee, expiryState:c.expiryState });
  for (const p of nodesByKind.policies || []) {
    add(p.targetId, 'policies', { id:p.id, type:p.policyType, state:p.state });
    for (const aff of (p.affected||[])) add(aff.id, 'policies', { id:p.id, via:'affected', type:p.policyType });
  }
  for (const r of nodesByKind.roles || [])
    add(r.scopeTarget, 'roles', { id:r.id, role:r.role, holders:(r.holders||[]).length });
  // actors reachable transitively via the capabilities/roles already bucketed
  for (const [k, e] of index)
    e.actors = resolveActors(e, atlas.actors || []);    // grantees + role holders
  return index;
}

export function queryWhoCanTouch(index, target) {
  const e = index.get(normalize(target)) || EMPTY;
  return rankByRisk(flatten(e));                          // see ranking below
}
```
**Risk ranking** (descending): policies that can *deny/halt* (highest) > active, non-expiring capabilities with broad `object` scope > roles with many holders > expiring/expired capabilities (lowest, since they self-neutralize). Use `expiryState` (`active`/`expires_soon`/`expired`) and policy `state`/`policyType` as the sort keys; reuse `severityBadge` for the pill. Each result row is a tuple `{ actor?, role?, capability?, policy?, why, riskScore }`.

### Component & file plan
- **New `lib/authorityIndex.js`** (pure, above).
- **New `views/reverseQuery.js`**: route `#/govern/who-can-touch` — a target input (account/object URL, with the existing `explorer.search` autocomplete idiom from `commandPalette.js:139`/`header.js:317` for convenience) + a results table grouped by kind, risk-sorted, each row deep-linking into its Atlas drawer (`#/govern/<kind>/<id>`).
- **Embed** the same panel inside the Atlas (`views/govern.js`): when a node drawer is open for an actor/object, show a "Who else can touch this?" collapsible powered by the same index (build the index once from the `nexus.governAtlas` response already fetched at `govern.js:89`).
- **Edit `web/app.js`**: register `#/govern/who-can-touch` → `reverseQueryView`.

### UX spec
- Input + "Find" → a table: columns `Risk · Actor/Role · Capability/Policy · Why · Expiry/State · Open`. Sorted highest-risk first.
- Empty state (target has no authority paths): "Nothing in this atlas can act on `<target>`." (five-state honest, not an error).
- Disclosure-redacted entries render as `hidden` rows ("an authority path exists but is redacted by disclosure"), never dropped silently (dropping would *understate* who can act — a governance-safety lie).

### Algorithm note (scale)
Building the index requires the per-node fields (`capability.object`, `policy.targetId/affected`, `role.scopeTarget`). The atlas list rows carry most of these already (`governAtlas.js` `renderNodeRow` reads `node.capability/object?`…), but `object`/`affected`/`scopeTarget` may only be fully populated by `nexus.governNode` per node. **Two-tier strategy:** build a coarse index from the `governAtlas` list immediately (fast, covers `targetId`/`object` when present in the list projection); lazily enrich a target's bucket with `governNode` calls when the user queries it. Cache enriched nodes.

### Acceptance
- Querying a known object returns every capability whose `object` matches + every policy whose `targetId`/`affected` matches + roles scoped to it, risk-sorted, each deep-linking correctly.
- A redacted path shows as a `hidden` row, not omitted.
- The Atlas-embedded "who else can touch this" agrees with the standalone view for the same target.

### Test plan
- `test/authorityIndex.test.mjs`: feed an atlas fixture with 2 capabilities + 1 policy + 1 role pointing at object X → assert `queryWhoCanTouch(idx, X)` returns all four, risk-ordered (deny-policy first, expired-capability last).
- Edge: target with no paths → empty (not error); target reachable only via `policy.affected` → still found.

### Backend dependencies
- **None required to ship** — aggregation is client-side over `nexus.governAtlas`/`nexus.governNode`.
- **Optional (scale):** a dedicated reverse-index RPC (e.g. `nexus.authorityFor {target}`) would beat client aggregation for very large atlases (>500 nodes, where `governAtlas {limit:500}` truncates). **Flag** it as a future backend optimization; not on the critical path.

---

# SP6 — Pre-action consequence panel

### Objective
Move `explainSignature` (`identity.js:79-113`) out of the fixture-only Identity viewer and into the **live** approve + submit flows as a "what this does / irreversible / funds move / data disclosed / expected proof" panel computed from the **real plan/dossier** (not `/testdata/identity.fixture.json`, which `loadIdentity` reads today — `identity.js:23`). Emit a single risk badge.

### Data sources (existing RPC, cited)
`explainSignature` is a **pure function** (`identity.js:79-113`) — it needs no RPC, only a request object. SP6 builds that request from data the live flows already fetch:
- **Approve flow:** `nexus.approvalDossier` (`approve.js:118`) returns `intentId`, `planHash`, `remaining`/`requiredRoles`, and the plan/goal info. The dossier already drives the sign call (`approve.js:174-180`).
- **Submit flow:** `nexus.previewDossier` (`compose.js:371`, `cockpitRails.js:376`) returns the `plan`, `policyDecision`, and goal/params — captured as `previewedParams`/`lastDossier` before submit (`compose.js:375`, `cockpitRails.js:380`).

### Request mapping (real plan → `explainSignature` request)
`explainSignature` expects `{ goalType, signer, network, sourceAssets, targetAssets, disclosesData, agentInitiated, action, customType, signerVersion }` (`identity.js:79-99`). Map from the dossier/plan:
```js
// lib/consequencePanel.js
import { explainSignature } from '/lib/identity.js';

export function consequenceFromDossier(dossier, { agentInitiated = false } = {}) {
  const plan = dossier.plan || {};
  const req = {
    goalType:    dossier.goalType || plan.goalType,
    signer:      dossier.signerKeyPage || dossier.requiredKeyPage || plan.signer,  // the key page the actor would sign with
    signerVersion: dossier.signerVersion,
    network:     dossier.network || plan.network || inferNetwork(),                // 'local'|'mainnet'|...
    sourceAssets: plan.sourceAssets || [],
    targetAssets: plan.targetAssets || [],
    disclosesData: !!plan.disclosesData,
    agentInitiated,
    action:      plan.summary || undefined,
    customType:  plan.customType,
  };
  const ex = explainSignature(req);          // fails closed → {error} if it can't explain
  return { explanation: ex, badge: riskBadge(ex) };
}

function riskBadge(ex) {
  if (ex.error) return { level:'unknown', text:'cannot preview consequences' };
  if (ex.warnings.some(w => /MAINNET|moves funds/i.test(w))) return { level:'high', text:'irreversible · funds move' };
  if (ex.fundsOrCreditsMove || ex.dataDisclosed)            return { level:'medium', text:'state change' };
  return { level:'low', text:'offline proof · no network state' };
}
```
`explainSignature` already computes `irreversibleEffects`, `fundsOrCreditsMove`, `dataDisclosed`, `agentInitiated`, `expectedProof`, and `warnings` (`identity.js:101-112`) — the panel just renders them. It **fails closed** (returns `{error}` — `identity.js:81-84`) rather than a blank prompt; honor that by showing "cannot preview — review the raw plan" instead of an empty panel.

### Component & file plan
- **New `lib/consequencePanel.js`**: `renderConsequencePanel(dossier, opts)` → a DOM card (single risk badge + the four bullets: action / irreversible / funds-or-data / expected proof) plus the raw `irreversibleEffects` and `warnings` lists.
- **Edit `views/approve.js`**: in `refreshDossier` (`approve.js:115-146`), after rendering the dossier, mount `renderConsequencePanel(dossier)` above the sign/reject CTA. In `signApproval` (`approve.js:148`), the rationale modal already gates the act; add the panel's badge to the modal header so the user sees "irreversible · funds move" at the moment of signing. Cross-ref RUNBOOK-04 Task 2.5 / Task 7 (which relocate this engine and call it from the live Approve flow — do not duplicate).
- **Edit submit flows** `views/compose.js` (`submitDossier`, mounted from `compose.js:376-378`) and `lib/cockpitRails.js` (`submitBtn` handler, `cockpitRails.js:390-414`): render the panel from the captured preview dossier before the final submit; surface the badge inline on the Submit button.
- **Stop reading the fixture in the live path.** `loadIdentity` (`identity.js:23`) stays only for the Identity viewer/smoke test; the consequence panel uses the live dossier exclusively.

### UX spec
- A compact card: **risk badge** (low/medium/high/unknown, colored) + "What this does: `<action>`" + "Irreversible: `<list>`" + "Moves funds/credits: yes/no · Discloses data: yes/no" + "Expected proof: `<L3/L4 …>`" + any warnings (e.g. "an AI agent initiated this — confirm you intended it", `identity.js:98`).
- On Approve: the panel sits directly above the sign button and its badge repeats in the rationale modal.
- On Submit: the panel sits above the Submit button; a `high` badge requires the existing confirm step (RUNBOOK-04 Task 5 TOCTOU confirmation re-shows the plan hash — compose the badge into that confirmation).

### Acceptance
- Approving a fund-moving plan on a non-local network shows a `high` badge + "moves value — once anchored it cannot be reversed" (`identity.js:93`).
- A local read-only operation shows `low` + "none — this produces an offline proof and writes no network state" (`identity.js:94`).
- An agent-initiated request shows the agent warning.
- A dossier missing signer/network yields the fail-closed "cannot preview" state, never a blank panel.

### Test plan
- `test/consequencePanel.test.mjs`: drive `consequenceFromDossier` with (a) SEND_TOKENS on mainnet → high + irreversible; (b) WRITE_DATA local → medium + dataDisclosed; (c) read-only local → low; (d) missing signer → unknown/error. (Mirrors the existing `explainSignature` expectations in `identity.js`.)

### Backend dependencies
**None.** `explainSignature` is pure; the dossiers are already fetched by the live flows. *(One honest caveat carried from RUNBOOK-04 Task 2/7: the act of "Sign" remains an asserted-actor `governed.approve`, not a key-page signature — the consequence panel describes what the act *would* do; it does not itself make signing cryptographic. The real client-signing path is RUNBOOK-04's flagged backend/wallet dependency, out of scope here.)*

---

# SP7 — Anomaly & trend surfacing

### Objective
`runtimePulse` is polled every 4s and each sample is rendered then **discarded** (`store.js:175-183`, `telemetry.js:100-118`). Keep a capped client-side ring buffer of samples; render sparklines + threshold/σ alerts ("drift +3σ in 5 min", "profile X newly drifted at HH:MM") on the telemetry rail.

### Data sources (existing RPC, cited)
- `runtimePulse` slice = `{ anchor, plugin, trust, workflow }` from `explorer.anchorMode` / `explorer.pluginStatus` / `explorer.trustDrift` / `explorer.workflowHealth` (`store.js:175-183`). The telemetry rail already subscribes to it (`telemetry.js:100`). Trended series:
  - `trust.driftingProfiles` (count) — `telemetry.js:107`.
  - `workflow.outcomeCaptureFailures`, `workflow.compensationStageFailures` — `telemetry.js:111-116`.
  - `plugin.totalAdmitted` / `totalRegistered` — `telemetry.js:105`.
  - anchor backlog (from `anchor`) for the SP1 backlog tile.
- **Optional** per-contract anomaly: `awareness.profile {contract}` (`subsystems.js:320`) returns an `anomalyScore` (referenced at `cinema-core/detailsPanel.js:47`, `renderer.js:356`). This is **per-contract, on-demand** — not part of the 4s pulse — so it is a secondary/optional enrichment, not the core buffer.

### Buffer (client-side, capped)
```js
// lib/pulseBuffer.js
const CAP = 150;                         // 150 samples * 4s ≈ 10 min of history
const buf = [];                          // [{ t, driftingProfiles, outcomeFail, compFail, admitted, backlog }]

export function pushSample(slice) {
  if (!slice || slice.status !== 'visible' || !slice.data) return;
  const d = slice.data;
  buf.push({
    t: Date.now(),
    driftingProfiles: num(d.trust?.driftingProfiles),
    outcomeFail: num(d.workflow?.outcomeCaptureFailures),
    compFail: num(d.workflow?.compensationStageFailures),
    admitted: num(d.plugin?.totalAdmitted),
    backlog: num(d.anchor?.backlog ?? d.anchor?.pending),
  });
  while (buf.length > CAP) buf.shift();   // ring behavior
  return buf[buf.length - 1];
}
export function series(key) { return buf.map(s => ({ t: s.t, v: s[key] })); }
```
Hook `pushSample` into the **existing** `runtimePulse` subscription. Cleanest: add it inside `store.js` where the slice is normalized (so every consumer shares one buffer), or in `telemetry.js:100-118` right where the slice arrives. Prefer the store so the buffer survives telemetry unmount.

### Trend computation
```js
// lib/trendAlerts.js
export function detectAnomalies(buf, windowMs = 5*60*1000) {
  const now = Date.now(), recent = buf.filter(s => now - s.t <= windowMs);
  const alerts = [];
  for (const key of ['driftingProfiles','outcomeFail','compFail','backlog']) {
    const xs = recent.map(s => s[key]);
    const { mean, sd } = stats(xs);
    const last = xs[xs.length-1];
    if (sd > 0 && (last - mean) / sd >= 3)
      alerts.push({ key, level:'high', text:`${label(key)} +${((last-mean)/sd).toFixed(1)}σ in ${Math.round(windowMs/60000)} min` });
    // step alert: any metric that went 0 -> >0 in this window ("newly drifted")
    if (xs.length >= 2 && xs[0] === 0 && last > 0)
      alerts.push({ key, level:'medium', text:`${label(key)} newly nonzero at ${hhmm(now)}` });
  }
  return alerts;
}
```
σ uses a simple windowed mean/stddev over the buffer (no external dep). "Newly drifted at HH:MM" is the 0→nonzero transition. Keep thresholds in constants so they're tunable.

### Sparkline + alert UI
- **New `lib/trendAlerts.js`** also exports `renderSparkline(series, opts)` → a tiny inline SVG polyline (same `SVG_NS` idiom as `timelineScrubber.js:19,101`). One sparkline per pulse tile (drift, outcome-fail, comp-fail, backlog).
- **Edit `lib/telemetry.js`**: under each existing pulse tile (`telemetry.js:37-58`), append a sparkline fed by `series(key)`; add an **alerts strip** between Pulse and Activity that renders `detectAnomalies(buf)` rows (severity-pilled, click → deep-link: drift alert → `#/govern/trustProfiles`, comp/outcome → the failing intent if resolvable).
- Reuse the existing `.anomaly-bar`/`.anomaly-fill` CSS already in `styles.css:807-811` for the bar styling; add sparkline CSS.
- Reduced-motion: sparklines are static SVG (no animation needed); any "pulse on new alert" effect is gated by `prefers-reduced-motion`.

### Acceptance
- The drift/outcome/comp/backlog tiles each show a sparkline that grows as samples accumulate (capped at ~10 min).
- When `driftingProfiles` jumps ≥3σ above its 5-min mean, a "drift +Nσ in 5 min" alert appears; when a profile first drifts (0→>0), a "newly drifted at HH:MM" alert appears.
- The buffer never exceeds `CAP`; unmounting/remounting telemetry preserves history (buffer lives in the store).

### Test plan
- `test/pulseBuffer.test.mjs`: push CAP+10 samples → assert length === CAP and FIFO eviction; assert `series('driftingProfiles')` returns the right ordered values.
- `test/trendAlerts.test.mjs`: feed a flat series then a spike → assert a `≥3σ` alert fires; feed 0,0,0,2 → assert a "newly nonzero" alert; feed flat-zero → assert no alerts (no false positives, sd===0 guard).

### Backend dependencies
**None.** Pure client-side accumulation of the already-polled `runtimePulse`. *(Optional: wiring `awareness.profile.anomalyScore` per-contract trends is a future enhancement, gated on a contract being selected — not part of the core rail.)*

---

# SP8 — In-browser L4 proof (the whole way)

### Objective
The verifier punts the final L0 cross-check to a copy-paste CLI command (`evidenceProof.js:191` renders `verifyCommand`; the offline verifier "never confirms an L0 anchor" — `proofReceipt.js:9-11`) **even though it already knows the anchor tx and block** (`evidenceProof.js:369-370`: `a.txHash`, `a.blockHeight`). Add an in-app **"Cross-check against L0 now"** button so a user reaches a fully-verified **L4** receipt in the browser — honestly.

### Data sources (existing RPC, cited)
- Anchor metadata is already in hand: `proof.anchor.{status, recordId, txHash, blockHeight}` rendered at `evidenceProof.js:363-382`; the bundle reader also has `proof.anchor.l0CrossCheck.{available, action}` (`evidenceProof.js:373-380`).
- The L0 endpoint URL is obtainable client-side: **`explorer.l0Endpoint`** — **verified present** (`anchors.js:438`, `network.js:112`, `spineFlow.js:224`). This returns the Accumulate L0 JSON-RPC endpoint.
- The portable verifier already cross-binds the *embedded* anchor fields offline (check 7, `portableVerifier.js:170-212`) but **cannot confirm the anchor exists on L0** — that is exactly the gap SP8 closes.

### The L0-query dependency (explicit)
**There is no Infrix-node RPC that performs the L0 cross-check for the browser** (the verifier deliberately punts it — `evidenceProof.js:191`, `proofReceipt.js:9`). The cross-check must therefore query **L0 directly** (Accumulate), *not* through the Infrix node — that's the whole point: confirming the anchor without trusting the Infrix node.

- **Path A (preferred, zero new Infrix RPC):** `explorer.l0Endpoint` gives the Accumulate JSON-RPC URL; the browser issues a **direct** Accumulate `query-tx` (or `query` by tx hash) `fetch` to that endpoint and checks that the anchor tx exists and lands in the expected block. **Backend dependency:** the L0 endpoint must be **CORS-reachable from the browser**. If it is not (common for locked-down nodes), this path fails closed and the receipt stays L3. **Flag this as the SP8 deployment dependency.**
- **Path B (fallback):** if a same-origin L0 proxy/CORS is unavailable, keep the copy-paste CLI command (current behavior) and **do not** upgrade the receipt. Honest by construction.

> Do **not** use `evidence.verify` (`evidence.js:323`, `intents.js:670`) to claim L4 — that is a *node-trusting* server verify and would violate the "no node trust required" property the receipt asserts (`proofReceipt.js:120`). L4 must come from a direct L0 confirmation or not at all.

### Verification flow
```js
// lib/l0CrossCheck.js
export async function crossCheckL0(anchor) {                 // anchor = proof.anchor
  if (!anchor || !anchor.txHash || !anchor.blockHeight)
    return { ok:false, reason:'no anchor tx/block to check', l0Verified:false };

  let endpoint;
  try { endpoint = (await rpcWithDisclosure('explorer.l0Endpoint', {})).endpoint; }
  catch (e) { return { ok:false, reason:'no L0 endpoint', l0Verified:false }; }

  // DIRECT call to Accumulate L0 — NOT the Infrix node.
  let res;
  try {
    res = await fetch(endpoint, { method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'query-tx', params:{ txid: anchor.txHash } }) });
  } catch (e) { return { ok:false, reason:'L0 unreachable (CORS or offline)', l0Verified:false }; }
  if (!res.ok) return { ok:false, reason:'L0 query failed '+res.status, l0Verified:false };

  const j = await res.json();
  const tx = j && j.result;
  const confirmed = !!tx && txMatchesBlock(tx, anchor.blockHeight);   // tx exists AND at expected block
  return confirmed
    ? { ok:true,  l0Verified:true,  network: networkOf(endpoint), command: cliEquivalent(anchor), at: tx }
    : { ok:false, l0Verified:false, reason:'anchor tx not found at expected block' };
}
```

### Honest receipt upgrade
The receipt builder already supports an out-of-band L0 confirmation via `opts.l0Verified` (`proofReceipt.js:39`): when true and `result.passed`, proofLevel becomes **L4** (`proofReceipt.js:41`). SP8 must:
1. Run the offline 10-check verifier first (`portableVerifier.js:verifyPortablePackage`) — must pass.
2. Run `crossCheckL0(anchor)` — only on `ok:true` set `l0Verified:true`.
3. Build the receipt with `buildReceiptFromVerifier(result, { l0Verified:true, network, command, proofLevel:'L4', anchorTx })`.
4. **Re-run `validateReceipt`** (`proofReceipt.js:86-110`) and **fail-close**: it enforces `proofLevel L4 ⇒ l0Verified` (`:98`), `label claims L4 ⇒ l0Verified` (`:99`), and `l0Verified ⇒ verification.network AND verification.command present` (`:100-103`). If validation returns any violation, **revert to the L3 receipt** and surface the violation — never display an unvalidated L4. This guarantees the in-browser upgrade is honest by construction (you cannot get an L4 badge without a real, recorded L0 confirmation).

### Component & file plan
- **New `lib/l0CrossCheck.js`** (above).
- **Edit `lib/evidenceProof.js`** `renderAnchorPanel` (`evidenceProof.js:363-382`): when `anchor.txHash` + `anchor.blockHeight` exist, render a **"Cross-check against L0 now"** button next to the existing `l0CrossCheck` note. On click → `crossCheckL0` → show ✓/✗ inline.
- **Edit `views/prove.js`** (and/or the narrative verify path, `narrative.js:618`): on a successful cross-check, rebuild + re-validate the receipt to L4 and re-render the receipt component; on failure keep L3 and show the reason.
- **No change to `proofReceipt.js` logic** — its fail-closed validation is exactly what we lean on; only call it correctly.

### UX spec
- Anchor panel gains a button "Cross-check against L0 now" (enabled only when `anchor.txHash` + `blockHeight` present). States: idle → "Checking L0…" → ✓ "Confirmed on `<network>` at block N — receipt upgraded to L4" or ✗ "L0 unreachable (CORS) — receipt stays L3; use the CLI command below."
- The assurance chips (`evidenceProof.js:166-173`: `L0 anchor`, `Fully verified`) flip to ✓ only after a real confirmation.
- The copy-paste CLI command (`verifyCommand`, `evidenceProof.js:191`) stays as the always-available fallback for locked-down deployments.

### Acceptance
- With a CORS-reachable L0 and a real anchored bundle: clicking the button confirms the tx at the expected block and the receipt validates to **L4** (passes `validateReceipt`).
- With L0 unreachable: the button fails closed, the receipt stays **L3**, and the reason is shown; `validateReceipt` is never bypassed.
- A tampered/absent anchor tx → ✗, no upgrade.
- It is **impossible** to render an L4 badge without `l0Verified === true` + `network` + `command` (enforced by re-validation).

### Test plan
- `test/l0CrossCheck.test.mjs`: stub `fetch` to (a) return a matching tx at the block → `ok:true,l0Verified:true`; (b) return a tx at the wrong block → `ok:false`; (c) throw (CORS) → `ok:false,reason includes CORS`.
- `test/proofReceipt.l4.test.mjs`: build a receipt with `l0Verified:true` but **omit** `verification.command` → assert `validateReceipt` returns the `l0Verified without a verification.command` violation and the UI falls back to L3. (Locks the fail-close contract.)

### Backend dependencies
- **No new Infrix RPC** (`explorer.l0Endpoint` exists — `anchors.js:438`).
- **Deployment dependency (flagged):** the Accumulate **L0 endpoint must be CORS-reachable from the browser** for Path A. If not, ship Path B (CLI fallback, no upgrade). This is a deployment/infra requirement, not a node-code change — document it for whoever stands up the demo.

---

# Combined test plan

| Layer | What | Where |
|---|---|---|
| **Pure-logic unit tests** (`node --test web/test/*.mjs`) | `temporalDiff`, `causalWalk`, `blastRadius`, `authorityIndex`, `consequencePanel`, `pulseBuffer`, `trendAlerts`, `l0CrossCheck`, `timeSnapshot.rpcAt` | one `*.test.mjs` per new `lib/` (manifest above) |
| **Store/at-pipeline** | `onAtChange` invalidates all board slices once per change; poller pauses when `!isAtLive()` | extends RUNBOOK-03 Task 4 store test |
| **Receipt fail-close** | L4 receipt without `l0Verified`/`network`/`command` is rejected and downgraded | `proofReceipt.l4.test.mjs` |
| **Route fences** (Go `*_fence_test.go`) | `#/diff` and `#/govern/who-can-touch` resolve to live views; no orphaned imports | update the IA fence from RUNBOOK-01 |
| **Manual demo script** (gate 3) | Scrub board through time (SP1) → diff two blocks (SP2) → click a failure → walk to root (SP3) → hover a capability → blast radius (SP4) → "who can touch acc://…" (SP5) → open an approval → consequence panel (SP6) → watch a drift alert fire (SP7) → cross-check a bundle to L4 (SP8) | recorded run-through |

**Both suites (`go test ./...`, `node --test web/test/*.mjs`) must stay green** (RUNBOOK-00 convention).

---

# Backend-dependency summary table

Which superpowers ship fully client-side vs need backend/infra work. **RPC methods named here were all verified present by `rg` against `web/`** unless explicitly marked "DOES NOT EXIST."

| SP | Existing RPCs used (verified) | New node RPC needed? | Ships fully client-side? |
|----|-------------------------------|----------------------|--------------------------|
| **SP1** Global scrubber | `nexus.cockpit`, `explorer.recentIntents`, `explorer.anchorMode`/`pluginStatus`/`trustDrift`/`workflowHealth` (`store.js:171-188`); `timeContext.setAt`/`withAt` | **No** — but **verify** the node honors `at` for `nexus.cockpit` + the 4 runtime reads (if any ignore `at`, that method is a backend dep) | Yes (after RUNBOOK-03 T4) |
| **SP2** Temporal diff | same as SP1 + the `fetchNarrativeRaw` set: `intent.get`, `explorer.planGet`/`approvalByPlan`/`outcomeGet`/`policyDecisionTrace`/`anchorGet`/`anchorChain`, `evidence.get` (`store.js:198-220`); `nexus.governNode` | **No** (same SP1 `at`-honoring caveat) | Yes |
| **SP3** Causal walk | `explorer.policyDecisionTrace`, `explorer.anchorChain`, `explorer.outcomeGet` (`store.js:215-219`); `nexus.governNode` (lazy) | **No** | **Yes** |
| **SP4** Blast-radius / what-if | `nexus.governNode`, `nexus.governAtlas` (`govern.js:89,111`); **`policy.simulate`** (`policies.js:502`) for POLICY_* delta | **Optional** — precise arbitrary-mutation `governed.whatIf` **DOES NOT EXIST**; client estimate ships, badged "estimated" | Partial (policy delta exact via `policy.simulate`; authority what-if estimated) |
| **SP5** Reverse query | `nexus.governAtlas`, `nexus.governNode`; optional `explorer.capabilityByIdentity`/`roleHolders`/`capabilityGrants` | **Optional** — `nexus.authorityFor` reverse-index for scale (>500 nodes) would help; not required | Yes (scale caveat) |
| **SP6** Consequence panel | none (pure `explainSignature`, `identity.js:79`); reads `nexus.approvalDossier` (`approve.js:118`) + `nexus.previewDossier` (`compose.js:371`) already fetched | **No** | **Yes** *(real cryptographic signing remains a separate RUNBOOK-04 wallet dependency, out of scope)* |
| **SP7** Anomaly/trends | `explorer.anchorMode`/`pluginStatus`/`trustDrift`/`workflowHealth` via `runtimePulse` (`store.js:175-183`); optional `awareness.profile` (`subsystems.js:320`) | **No** | **Yes** |
| **SP8** In-browser L4 | `explorer.l0Endpoint` (`anchors.js:438`); offline `verifyPortablePackage` (`portableVerifier.js`); `buildReceiptFromVerifier`/`validateReceipt` (`proofReceipt.js`) | **No new Infrix RPC**; **infra dep:** L0 endpoint must be **CORS-reachable** (else CLI fallback, no upgrade) | Yes, if L0 is CORS-reachable |

**Net:** SP3, SP6, SP7 are unconditionally client-side. SP1/SP2 are client-side *contingent on the node honoring `at`* for the board reads (verify). SP4 ships with an exact policy-delta path (`policy.simulate`) + an estimated authority what-if (precise version flagged). SP5 ships client-side with an optional scale RPC flagged. SP8 ships client-side contingent on a CORS-reachable L0 endpoint, fail-closed to L3 otherwise.

---

## As-built reconciliation (what actually shipped)

All eight superpowers are implemented; the pure-logic cores are unit-tested and a Go fence (`superpowers_fence_test.go`) locks the wiring. Deviations from the spec, made to fit the current tree (line numbers in the spec predate RUNBOOK-01–06) and kept honest:

- **New files** landed as named in the manifest, with one rename: the per-lib tests use the existing repo convention `*.test.mjs` under `web/test/` (e.g. `temporalDiff.test.mjs`), all picked up by `node --test web/test/*.mjs`.
- **SP1 preconditions already met.** RUNBOOK-03 Task 4 had already wired the store's `onAtChange` invalidation (`store.js`) and the poller `isAtLive()` guard, so the scrubber re-paints the board for real. `boardScrubber.js` factors a headless `createScrubberCore` (stubbable `ctx`) so the seek/play machinery is unit-tested without a DOM.
- **SP2 explicit-`at`.** `timeSnapshot.rpcAt` calls the raw `rpc` (never `rpcWithDisclosure`), proven by a test that sets the global cursor to block 9 and still sends `at:{block:5}`. The fence forbids `rpcWithDisclosure(` in that file.
- **SP4 graph highlight.** The Atlas is a node-card grid (no force-graph), so "highlight on graph" lights the affected `.govern-node-card[data-node-id]` cards (a `data-node-id` handle was added to `renderNodeRow`). The POLICY_* delta classifier is pure + tested; it gates Submit in both submit flows (Studio `compose.js` via `mountPolicyDelta`, and the cockpit rail).
- **SP5 routing.** `#/govern/who-can-touch` is handled inside the govern view (it owns `#/govern/*`), reusing the already-fetched `governAtlas`; `#/govern/who-can-touch/<target>` seeds the query. A discoverable "Who can touch…? →" link sits in the govern header. The index is coarse-from-atlas (the two-tier lazy `governNode` enrichment is left as a flagged scale follow-up; redacted paths surface as `hidden` rows, never dropped).
- **SP6 single injection point.** The consequence panel mounts via the shared `renderDossier` (covers Studio + cockpit-rail submit) and is prepended in the live Approve dossier. It reads the **real** dossier; the `/testdata` fixture stays only in the Identity viewer. (Per the spec caveat, "Sign" remains an asserted-actor `governed.approve` — real client signing is RUNBOOK-04's flagged wallet dependency.)
- **SP7 buffer in the store.** `pushSample` is hooked at the store's slice-publish point (guarded by `isAtLive()` so frozen re-fetches don't pollute the live trend), so the ring buffer survives telemetry unmount. The rail draws static SVG sparklines + an anomaly alerts strip.
- **SP8 honest by construction.** The previously-disabled "Cross-check against L0 now" button is live; it queries Accumulate L0 **directly** (`query-tx`), never `evidence.verify`. The offline verifier path rebuilds the receipt to **L4 only through `validateReceipt`** — an L4 that fails validation is discarded and the receipt stays L3 (locked by `proofReceipt.l4.test.mjs`). The **CORS-reachable L0 endpoint** remains the flagged deployment dependency; the CLI command is the fail-closed fallback.

**Verification:** `go test ./...` green (incl. `superpowers_fence_test.go`); `node --test web/test/*.mjs` green (188 tests; 67 net-new across the twelve superpower libs). The axe/manual demo-script checks in the Combined test plan remain manual (no JS toolchain in-repo — see RUNBOOK-06).
