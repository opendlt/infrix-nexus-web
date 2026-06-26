# RUNBOOK-04 — Fix & Elevate the Live Governance Surfaces

> Parent plan: **§4.4 — Governance surfaces (Approve / Inbox / Operate / Atlas / Studio / Verifier / Identity)**
> Cross-refs: **RUNBOOK-07** (SP4 what-if blast-radius, SP5 reverse-query, SP6 consequence panels, SP8 L4 verification loop)

---

## Objective

Bring the seven *live* governance surfaces up to a single, honest, decision-grade
standard:

- **Approve** (`web/views/approve.js`, `web/lib/approvalDossier.js`) — give the
  signer *at least* what the author saw at compose time, a real role/key choice,
  a plan-vs-previous diff, a single risk badge, and an honest "Sign" semantic.
- **Inbox** (`web/views/inbox.js`) — close the **bulk-approve safety regression**:
  it currently signs with `{intentId, rationale}` only, with **no plan binding and
  no invalidator gate**.
- **Operate Console** (`web/views/operatePanel.js`, `web/lib/operatePanel.js`) —
  turn dead health counts into drill-throughs.
- **Authority Atlas** (`web/views/govern.js`, `web/lib/governAtlas.js`) — make
  policy rules readable and add seedable (previewable) renew/revoke actions.
- **Intent Studio** (`web/views/compose.js`) — add a submit confirmation that
  re-shows the exact plan hash and close the preview→submit TOCTOU.
- **Evidence Verifier** (`web/views/prove.js`, `web/lib/portableVerifier.js`,
  `web/lib/evidenceProof.js`) — fix the `version "3"` placeholder vs required
  `"4"`, add an offline-path download, and add an in-app L0 cross-check entry.
- **Identity** (`web/views/identity.js`, `web/lib/identity.js`) — decide its
  status (preview vs live) and relocate the `explainSignature` consequence engine
  into the live signing flows.

---

## Exit gate

This runbook is **done** only when both gates below pass.

### Gate 0 — Safety (MUST ship before anything else in this runbook)

| # | Item | Surface | Phase |
|---|------|---------|-------|
| G0.1 | Inbox bulk-approve honours the **blocked/invalidator gate** per item before calling `governed.approve` (parity with the single-path gate in `approvalDossier.js:113/276-285`). | Inbox | **Phase 0** |
| G0.2 | Inbox bulk-approve sends **`planHash`, `stageId`, `role`** per item (parity with `approve.js:174-180`), never `{intentId, rationale}` alone. | Inbox | **Phase 0** |
| G0.3 | Inbox replaces `window.prompt` / `window.alert` (`inbox.js:403/406/409/426/446/448/634/649`) with `openRationaleModal` (`web/lib/rationaleModal.js`). | Inbox | **Phase 0** |
| G0.4 | Verifier paste placeholder advertises the version the verifier actually accepts — `"4"` not `"3"` (`prove.js:195` vs `portableVerifier.js:42/56-59`). | Verifier | **Phase 0** |

### Gate 3 — Decision-grade parity (the elevation work)

| # | Item | Surface |
|---|------|---------|
| G3.1 | Approve renders the **step graph + ghost per-step predictions** the author saw at preview (`dossier.js:233-456`). | Approve |
| G3.2 | Approve has a **role/key-page picker** (replaces `remaining[0]` auto-pick at `approve.js:160-167`). | Approve |
| G3.3 | Approve shows a **plan-vs-previous diff** keyed off invalidator reason codes, plus a **single risk badge**. | Approve |
| G3.4 | Operate health panels **drill through** (pending→inbox, denials→policy node, drift→trust node, expiring→renew seed) and an **expiring-authority** panel exists. | Operate |
| G3.5 | Atlas renders policy **rules as a table** (not raw JSON at `governAtlas.js:342-346`) and exposes **renew/revoke seed** actions. | Atlas |
| G3.6 | Studio shows a **confirm step re-displaying the exact plan hash** before `governed.submit`. | Studio |
| G3.7 | Verifier offline path offers a **download**, and the bundle reader has an **L0 cross-check** entry point (gated on backend RPC — see Task 6). | Verifier |
| G3.8 | `explainSignature` is reachable from a **live** signing flow, not only the fixture page. | Identity/Approve |

---

## Preconditions

| Precondition | Check | Owner |
|---|---|---|
| `governed.approve` accepts `{intentId, stageId, planHash, role, rationale}` | Already used by single path `approve.js:174-180` | Backend (existing) |
| `nexus.approvalDossier { planId }` returns `{plan, planHash, remaining[], invalidators[], requiredRoles[], requiredCredentials[], risk[], summary[], scope, threshold, signed[]}` | `approvalDossier.js:44-104` consumes all of these | Backend (existing) |
| `nexus.previewDossier` returns `stepGraph{nodes,edges}` + `ghostEvidence{steps[]}` | `dossier.js:238/432` consumes both | Backend (existing) |
| `nexus.operateHealth` exposes counts only for `policyDenials`/`pendingApprovals` and **does not** yet emit denying-policy ids or an expiring-authority list | `operatePanel.js:158-172` | Backend — **see Task 3 dependency note** |
| `nexus.governAtlas` capability nodes carry `expiresAtBlock`/`expiryState`; trust nodes carry `driftImpactCount` + `dependentApprovals[].invalidated` | `governAtlas.js:180-181/362-371` | Backend (existing) |
| `governed.submit` re-plans server-side from `{goalType, customParams}` | `compose.js:691-694` | Backend — **TOCTOU, see Task 5** |
| Portable package version constant | `portableVerifier.js:42` = `'4'` | Frontend (existing) |
| `nexus.evidenceProof` returns `proof.anchor.{status,recordId,txHash,blockHeight,l0CrossCheck}` | `evidenceProof.js:363-380` | Backend (existing) |
| A **live L0 cross-check RPC** (e.g. `nexus.evidenceCrossCheckL0`) | **DOES NOT EXIST** — currently only a copy-CLI string `p.verifyCommand` (`evidenceProof.js:191`) | Backend — **NEW dependency, see Task 6** |
| Identity twin is fixture-backed only | `identity.js:23` fetches `/testdata/identity.fixture.json` | Frontend (existing) |
| A **real client-signing path** (key-page signature over `planHash`) | **DOES NOT EXIST** in this SPA — "Sign" is an asserted-actor `governed.approve` | Backend/Wallet — **NEW dependency, see Task 2** |

> **Backend-dependency flags** (do not invent these — they gate the marked steps):
> 1. Operate drill-through for denials/expiring requires `operateHealth` to emit
>    ids (Task 3, G3.4 partial).
> 2. Real client signing over the plan hash requires a wallet-connect + signature
>    endpoint (Task 2, Option B).
> 3. In-app L0 cross-check requires a server RPC (Task 6, G3.7).
> Where a backend piece is missing, the runbook ships the **UI + relabel/seed**
> path now and leaves a typed TODO referencing the SP/runbook that delivers it.

---

# Per-surface tasks (ordered)

> Order: **Task 1 and Task 6-step-1 are Phase 0** and ship first (they are Gate 0
> safety/honesty fixes). Tasks 2–5, 6-rest, 7 follow.

---

## Task 1 — Inbox safety (Phase 0) ⛔

**Replace prompts with the rationale modal, and make bulk-approve as safe as the
single approve path.**

### Files & anchors
- `web/views/inbox.js`
  - `onBulkApprove` ~`401-419` (prompt `406`, gate `408-411`, RPC `413-415`)
  - `onBulkReject` ~`421-439`, `onBulkHandoff` ~`441-456`
  - `onReply` prompt `634`, `onForward` prompts `649/651`
  - `collectSelectedIntentIds` ~`458-467`, `findRowByKey` ~`469-485`
- `web/lib/rationaleModal.js` — `openRationaleModal({verb,intentId,defaultValue})` (`17`)
- `web/lib/approvalDossier.js` — blocked predicate `113`/`276`; invalidator list `231-271`
- Single safe reference path: `web/views/approve.js:148-196` (`signApproval`)

### Steps (code-level)

1. **Import the modal.** Add to the import block at `inbox.js:37-45`:
   ```js
   import { openRationaleModal } from '/lib/rationaleModal.js';
   ```

2. **Carry the binding fields on selected rows.** `collectSelectedIntentIds`
   (`458-467`) only returns `intentId || id`. Replace it with
   `collectSelectedApprovalRows()` that returns the full row objects (via
   `findRowByKey`), filtered to `lane === 'approvals'`:
   ```js
   function collectSelectedApprovalRows() {
     const out = [];
     for (const key of selection) {
       const row = findRowByKey(key);
       if (row && row.lane === 'approvals') out.push(row);
     }
     return out;
   }
   ```
   Approval rows already carry `planId` — `openRow` at `inbox.js:371` reads
   `r.planId`. Non-approval lanes must not flow into approve.

3. **Rewrite `onBulkApprove` (`401-419`)** to mirror the single path. Per item:
   fetch the dossier, honour the gate, then approve with full binding:
   ```js
   async function onBulkApprove() {
     const rows = collectSelectedApprovalRows();
     if (rows.length === 0) { flashToast('Select at least one approval row.'); return; }

     // One rationale, but the user must explicitly confirm it applies to all.
     const rationale = await openRationaleModal({
       verb: 'sign',
       intentId: rows.length === 1 ? (rows[0].intentId || rows[0].id) : `${rows.length} selected approvals`,
     });
     if (rationale === null) return; // modal already enforces the 10-char floor

     const results = [];
     for (const row of rows) {
       const planId = row.planId || row.intentId || row.id;
       try {
         const d = await rpcWithDisclosure('nexus.approvalDossier', { planId });
         // GATE — identical predicate to approvalDossier.js:113 / 276.
         const blocked = !d.plan ||
           (d.invalidators || []).some((i) => i.severity === 'blocked' || i.severity === 'failed');
         if (blocked) {
           results.push({ status: 'rejected', reason: new Error(`blocked: ${planId}`) });
           continue;
         }
         const remaining0 = Array.isArray(d.remaining) && d.remaining[0] ? d.remaining[0] : {};
         const role = remaining0.role || (d.requiredRoles && d.requiredRoles[0]) || '';
         const stageId = remaining0.stageId || '';
         const r = await rpcWithDisclosure('governed.approve', {
           intentId: d.intentId,
           stageId,
           planHash: d.planHash,
           role,
           rationale,
         });
         results.push({ status: 'fulfilled', value: r });
       } catch (err) {
         results.push({ status: 'rejected', reason: err });
       }
     }
     reportBulkOutcome(results, 'approve');   // existing helper at 487
     selection.clear();
     await refresh();
   }
   ```
   > Note: this is **sequential**, not `Promise.allSettled` — each approve now
   > depends on its own dossier fetch, and serial execution keeps the blocked
   > count and per-item error reporting honest. `reportBulkOutcome` already counts
   > `fulfilled`/`rejected` (`487-501`), so a blocked item shows up as a failure
   > with a console reason.

4. **Bulk reject (`421-439`) and handoff (`441-456`)** — swap the `window.prompt`
   rationale for `openRationaleModal({verb:'reject',...})`; keep `governed.reject`
   and `nexus.handoffCreate`. Handoff's assignee prompt may stay a prompt for now
   (out of Gate-0 scope) **but** the rationale/note prompts go through the modal.

5. **`onReply` (`632-645`) and `onForward` (`647-663`)** — replace the
   `window.prompt` note inputs with the modal (or a small inline composer). At
   minimum, remove all `alert()` failure paths in favour of `flashToast`
   (`503-512`), which already exists.

6. **Keyboard single-approve (`602-619`)** — `a`/`d` funnel one row into
   `onBulkApprove`/`onBulkReject`. They now inherit the gate automatically. No
   change needed beyond confirming the single selected row is an approval row.

### Why
The single path (`approve.js`) fetches the dossier, disables Sign when blocked
(`approvalDossier.js:282`), and binds `planHash/stageId/role`. The bulk path
(`inbox.js:413-415`) sends only `{intentId, rationale}` — **no plan binding, no
invalidator check** — and reuses one rationale across every item via a raw
`window.prompt`. That is a signature bound to nothing, applied blind to a batch.
This task makes bulk a loop of the safe single path.

### Verify
- Select a known-blocked approval (a plan with a `blocked`/`failed` invalidator)
  plus a clean one; bulk-approve. The blocked item is **skipped/failed**, the
  clean one succeeds; the toast reports `1 ok, 1 failed`.
- Network tab: every `governed.approve` carries `planHash`, `stageId`, `role`.
- No `window.prompt`/`alert` remains in `inbox.js` (grep).

### Acceptance
- G0.1, G0.2, G0.3 satisfied.
- New smoke `inbox_bulk_gate_smoke.mjs` (see Test plan) passes.

---

## Task 2 — Approve parity + decision-grade

**Give the signer everything the author saw, a real role choice, a diff, one risk
badge, the consequence panel, and an honest Sign.**

### Files & anchors
- `web/views/approve.js` — `signApproval` `148-196` (role auto-pick `160-167`)
- `web/lib/approvalDossier.js` — panels `44-104`; identity panel `132-151`;
  binding panel `153-176`; threshold `178-205`; invalidators `231-271`; CTA `273-319`
- `web/lib/dossier.js` — `renderStepGraph` `352-394`; ghost predictions table `432-456`
- `web/lib/identity.js` — `explainSignature` `79-113`

### Steps (code-level)

1. **Step graph + ghost predictions (G3.1).** The approval dossier today renders
   binding/threshold/invalidators but **not** the step graph or ghost per-step
   table that compose preview shows (`dossier.js:233-456`). Two clean options:
   - **2a (preferred):** export the two pure renderers from `dossier.js` —
     `renderStepGraph(graph)` (`352`) and a new `renderGhostPredictions(ghost)`
     extracted from the block at `dossier.js:432-456` — and import them into
     `approvalDossier.js`. Add a new panel between Binding (`79`) and Threshold
     (`82`):
     ```js
     // approvalDossier.js, inside renderApprovalDossier, after renderBindingPanel:
     if (d.stepGraph && Array.isArray(d.stepGraph.nodes) && d.stepGraph.nodes.length) {
       const sec = panelSection('What this plan will do (step by step)');
       sec.body.appendChild(renderStepGraph(d.stepGraph));
       root.appendChild(sec.element);
     }
     if (d.ghostEvidence && Array.isArray(d.ghostEvidence.steps) && d.ghostEvidence.steps.length) {
       const sec = panelSection('Predicted per-step outcome');
       sec.body.appendChild(renderGhostPredictions(d.ghostEvidence));
       root.appendChild(sec.element);
     }
     ```
   - **Dependency:** `nexus.approvalDossier` must include `stepGraph` and
     `ghostEvidence` (the same shapes `previewDossier` returns). If the backend
     does not yet attach them, render from the plan the dossier already binds, or
     fetch `nexus.previewDossier` for the bound `planHash`. Flag as a backend
     field-parity request; do **not** invent a new RPC.

2. **Role / key-page picker (G3.2).** Replace the silent `remaining[0]` pick at
   `approve.js:160-167`. In `renderIdentityPanel` (`approvalDossier.js:132`) add a
   `<select>` populated from `d.remaining` (each option = `{stageId, role}`,
   labelled `role @ stageId · short by N`) plus any `d.requiredRoles` not already
   covered. Surface the chosen `{role, stageId}` to the caller through the
   `onSign` callback:
   ```js
   // approvalDossier.js CTA — pass the picked slot up
   sign.addEventListener('click', () => opts.onSign(d, getSelectedSlot()));
   ```
   ```js
   // approve.js signApproval(dossier, slot)
   const role = (slot && slot.role) || (dossier.remaining[0] && dossier.remaining[0].role) || '';
   const stageId = (slot && slot.stageId) || (dossier.remaining[0] && dossier.remaining[0].stageId) || '';
   ```
   When `d.remaining.length <= 1`, render a static line instead of a dropdown.

3. **Plan-vs-previous diff (G3.3).** The invalidators already carry reason codes
   (`approvalDossier.js:249` renders `i.reason`). Add a compact diff banner above
   the CTA that summarises the *change classes* present in `d.invalidators`, e.g.
   map known reason codes to human phrases:
   ```js
   const DIFF_REASONS = {
     plan_hash_changed:      'The plan was regenerated — hash differs from earlier signatures.',
     simulation_stale:       'The simulation is stale — re-preview before signing.',
     trust_profile_degraded: 'A trust profile this plan depends on degraded.',
     role_revoked:           'A required role/credential was revoked.',
     policy_changed:         'A governing policy changed since this plan was built.',
   };
   ```
   Render only the codes present. (No new RPC — this is a presentation of the
   existing `invalidators[]`.)

4. **Single risk badge (G3.3).** `d.risk` is already sorted and rendered as a rail
   (`approvalDossier.js:71-73`). Add a one-glance badge next to the status banner
   computed as the max severity across `d.risk` ∪ `d.invalidators` using the
   existing `severityBadge`/`sortBySeverity` from `web/lib/severity.js` (already
   imported at `approvalDossier.js:33`). No new dependency.

5. **Consequence panel (G3.8, cross-ref SP6/RUNBOOK-07).** Import
   `explainSignature` from `web/lib/identity.js:79`. Build a request object from
   the dossier just before the rationale modal opens in `signApproval`
   (`approve.js:154`), and render the returned consequence block (mirror
   `identity.js:explanationBlock` `56-83`) inside the sign confirmation:
   ```js
   const ex = explainSignature({
     goalType: dossier.goalType,                  // dossier must surface goalType
     signer:   chosenKeyPage,                     // from the role/key picker
     network:  dossier.network || 'local',
     agentInitiated: !!dossier.agentInitiated,
     sourceAssets: dossier.scope && dossier.scope.sourceAssets,
     targetAssets: dossier.scope && dossier.scope.targetAssets,
   });
   ```
   `explainSignature` **fails closed** (`identity.js:81-84`) — if it returns
   `{error}`, show the error and do not present Sign. This is exactly the
   pre-action consequence surface the spec wants, moved off the inert fixture page.
   > Field dependency: `nexus.approvalDossier` must surface `goalType` and a key
   > page for the chosen role; both already exist in the governance model
   > (`governAtlas.js:285` shows `keyPage` on role nodes). Flag as field-parity.

6. **"Sign" honesty.** Today "Sign" is `governed.approve` under an asserted actor
   string with `planHash` shown (`approvalDossier.js:159`) but **nothing the user
   holds is bound**. Two paths — pick one explicitly:
   - **Option A — Relabel (ship now, zero backend):** change the button text from
     `Sign` (`approvalDossier.js:281`) to **"Record approval"** and the success
     banners (`approve.js:184-188`) to "Approval recorded", and add a one-line note
     under the CTA: *"This records a governed approval under your session actor.
     It is not a key-page cryptographic signature."* Honest, immediate.
   - **Option B — Real client signature (preferred end-state, backend-gated):**
     add a wallet-connect step that produces an Ed25519 signature over the bound
     `planHash` using the signer's key page, and pass the signature envelope to
     `governed.approve`. **Backend dependency:** `governed.approve` must accept and
     verify a `signature`/`sigAlgo`/`keyPage` envelope (the dossier already
     displays `sigAlgo` on signed rows — `approvalDossier.js:222` — so the wire
     field exists on read; the write path needs to accept it). Do **not** invent
     the endpoint shape here; file it as the SP6/wallet dependency. Until B lands,
     ship A so the UI never overstates what happened.

### Why
A reviewer must not see *less* than the author. Auto-picking `remaining[0]` hides
the role choice. A signature that binds a plan hash the user can't diff against
the last one, with a button that says "Sign" while nothing user-held is bound, is
a trust overstatement. This task closes all four.

### Verify
- Approve screen now shows the step graph + ghost table identical in content to
  the compose preview for the same plan.
- The role dropdown lists every remaining slot; the chosen `{role,stageId}` shows
  up in the `governed.approve` payload.
- A degraded trust profile produces the `trust_profile_degraded` diff line and a
  red single badge; Sign is disabled (existing blocked gate at `:282`).
- `explainSignature` block appears before confirm and refuses an unexplainable
  request.

### Acceptance
- G3.1, G3.2, G3.3, G3.8 satisfied. "Sign" semantics are honest (A or B).
- New smoke `approve_stepgraph_smoke.mjs` passes.

---

## Task 3 — Operate Console drill-through

**Make the dead health counts navigable; add an expiring-authority panel.**

### Files & anchors
- `web/lib/operatePanel.js` — health grid `74-95`; `policyDenials` `158-164`;
  `pendingApprovals` `166-172`; `trustDrift` `116-135`; template seed `276-287`;
  `SEED_KEY` `345`
- `web/views/operatePanel.js` — mount/refresh `25-80`
- Nav convention: views set `window.location.hash = '#/...'` (e.g.
  `operatePanel.js:286`, `inbox.js:151/371`); the router listens on `hashchange`
  (`router.js:132-135`). The exported `router.navigateTo` (`router.js:148-156`)
  is equivalent — either is acceptable; **match the in-view `window.location.hash`
  convention already used in this file.**

### Steps (code-level)

1. **Pending approvals → Inbox (no backend dep).** In
   `renderPendingApprovalsPanel` (`166-172`) wrap the card content in a click
   target that navigates to the approvals lane:
   ```js
   card.classList.add('operate-panel-clickable');
   card.addEventListener('click', () => { window.location.hash = '#/inbox/approvals'; });
   ```

2. **Trust drift → trust node (no backend dep).** `renderTrustDriftPanel`
   (`116-135`) already iterates rows with `r.profileId` (`130`). Make each `<li>`
   a link into the Atlas trust drawer:
   ```js
   li.style.cursor = 'pointer';
   li.addEventListener('click', () => {
     window.location.hash = '#/govern/trustProfiles/' + encodeURIComponent(r.profileId);
   });
   ```
   (Route shape confirmed: `govern.js:73-74` parses `#/govern/<kind>/<nodeId>`;
   `trustProfiles` maps to node kind `trust` at `govern.js:19-27`.)

3. **Policy denials → denying policy node (BACKEND DEP).**
   `renderPolicyDenialsPanel` (`158-164`) shows `d.count` only. To drill through,
   `operateHealth.policyDenials` must emit the denying policy id(s) (e.g.
   `d.recent[].policyId`). **Until the backend adds that field**, make the panel
   navigate to the policies list as a degraded fallback and leave a typed TODO:
   ```js
   // TODO(RUNBOOK-04 T3 / backend operateHealth): emit recent[].policyId to deep-link the exact node.
   card.addEventListener('click', () => { window.location.hash = '#/govern/policies'; });
   ```
   When the field arrives, link to `#/govern/policies/<policyId>`.

4. **Expiring authority panel + renew seed (partial BACKEND DEP).** Add a ninth
   health panel `renderExpiringAuthorityPanel(h.expiringAuthority)` to the grid
   (`renderHealthGrid` `74-86`). It lists capabilities/roles with
   `expiryState === 'expires_soon'` (the Atlas already models `expiryState`/
   `expiresAtBlock` — `governAtlas.js:180-181/310`). Each row gets a **"Renew →"**
   action that uses the **existing operator-template seed pattern**
   (`operatePanel.js:276-287`): write the seed to `localStorage[SEED_KEY]` and
   navigate to `#/compose/<RENEW_GOAL_TYPE>`:
   ```js
   localStorage.setItem(SEED_KEY, JSON.stringify({
     goalType: row.renewGoalType,            // supplied by the health payload
     customParams: { capabilityId: row.id }, // pre-fill the renew form
     source: 'operate-expiring',
     capturedAt: new Date().toISOString(),
   }));
   window.location.hash = '#/compose/' + encodeURIComponent(row.renewGoalType);
   ```
   **Backend dependency:** `operateHealth` must expose an `expiringAuthority[]`
   list (id, kind, expiresAtBlock, renewGoalType). Until then, the panel renders
   "no data" via the existing `emptyText` helper (`337-342`) — no crash, no fake
   numbers. File the field request; do not invent the RPC.

5. **Shared affordance.** Add a single `.operate-panel-clickable` style and a
   keyboard handler (Enter/Space) so panels are reachable without a mouse, mirror
   of `prove.js:258-263`.

### Why
The console says "8 health panels" but every count is a dead end —
`policyDenials`/`pendingApprovals` are count-only (`158-172`), drift rows aren't
clickable (`128-133`). An operator who sees "3 awaiting signature" must be one
click from acting. The template seed pattern (`276-287`) already proves the
"surface → previewable intent" loop; reuse it for renew.

### Verify
- Click "pending approvals" → lands on `#/inbox/approvals`.
- Click a drift row → opens the trust drawer for that `profileId`.
- Expiring panel renders rows when the backend supplies them, "no data"
  otherwise; "Renew →" lands in Studio with the seed pre-filled.
- Denials panel deep-links once `policyId` is present; falls back to the list now.

### Acceptance
- G3.4 satisfied (denials/expiring deep-link may be in degraded mode pending the
  two flagged backend fields — both fallbacks are honest, no fabricated ids).

---

## Task 4 — Atlas actions + readability

**Render policy rules as a table; add renew/revoke seed actions to drawers.**

### Files & anchors
- `web/lib/governAtlas.js` — policy panel `330-349` (raw JSON dump `342-346`);
  capability panel `301-328`; trust panel `351-372`; drawer entry `222-271`
- `web/views/govern.js` — drawer refresh `85-125`
- Seed pattern reference: `web/lib/operatePanel.js:276-287` + `SEED_KEY` (`345`)

### Steps (code-level)

1. **Policy rules → table (G3.5).** Replace the raw `jsonBlock(p.rules)` at
   `governAtlas.js:344` with a real table. Rule objects vary, so build columns
   from the union of keys, with stable leading columns:
   ```js
   function renderPolicyRulesTable(rules) {
     const tbl = document.createElement('table');
     tbl.className = 'dossier-table govern-policy-rules';
     const cols = ['effect', 'condition', 'action', 'target', 'priority'];
     const present = cols.filter((c) => rules.some((r) => r[c] !== undefined));
     const extras = [...new Set(rules.flatMap((r) => Object.keys(r)))].filter((k) => !present.includes(k));
     const head = [...present, ...extras];
     tbl.innerHTML = '<thead><tr>' + head.map((h) => `<th>${h}</th>`).join('') + '</tr></thead>';
     const tbody = document.createElement('tbody');
     for (const r of rules) {
       const tr = document.createElement('tr');
       for (const h of head) {
         const c = document.createElement('td');
         c.className = 'mono';
         const v = r[h];
         c.textContent = v === undefined ? '—' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
         tr.appendChild(c);
       }
       tbody.appendChild(tr);
     }
     tbl.appendChild(tbody);
     return tbl;
   }
   ```
   Keep the raw JSON available under a `<details>` for power users (the drawer
   already appends raw node JSON at `governAtlas.js:262-268`).

2. **Drawer actions: renew / revoke (G3.5).** The atlas is 100% read-only
   (drawers have one CTA, the approval-dossier link at `:436-442`). Add a
   `renderDrawerActions(kind, data)` helper invoked at the end of the capability,
   role, and policy panels. Each action **seeds a previewable intent** — it never
   mutates directly — using the operator-template pattern:
   ```js
   function seedIntentAction(label, goalType, customParams) {
     const btn = document.createElement('button');
     btn.type = 'button';
     btn.className = 'verify-btn govern-drawer-action';
     btn.textContent = label;
     btn.addEventListener('click', () => {
       try {
         localStorage.setItem('nexus.compose.operatorSeed', JSON.stringify({
           goalType, customParams, source: 'govern-drawer',
           capturedAt: new Date().toISOString(),
         }));
       } catch (_) {}
       window.location.hash = '#/compose/' + encodeURIComponent(goalType);
     });
     return btn;
   }
   ```
   - Capability drawer (`301-328`): **Renew** (`{capabilityId: c.id}`) and
     **Revoke** (`{capabilityId: c.id}`) seeds — goal types supplied by the
     operator-template catalogue (do not hardcode unknown goal types; read them
     from `nexus.operatorTemplates` so they stay in sync — same source the Operate
     console uses).
   - Role drawer (`280-299`): **Revoke role binding** seed.
   - Policy drawer (`330-349`): **Amend policy** seed.
   > **Reuse the exact `SEED_KEY` literal** (`'nexus.compose.operatorSeed'`,
   > `operatePanel.js:19`) so Studio's existing seed reader picks it up unchanged.

3. **Trust drawer blast-radius (cross-ref SP4/RUNBOOK-07).** Do **not** rebuild
   blast-radius here. The trust panel already computes it: the banner shows
   `driftImpactCount` (`governAtlas.js:364`) and the dependent-approvals list flags
   `a.invalidated` (`371`). Add a `data-` hook / note that RUNBOOK-07 SP4 reuses
   this same projection for the what-if surface. Reverse-query (SP5) and what-if
   (SP4) are explicitly **out of scope** for this runbook.

### Why
Policy rules dumped as raw JSON (`342-346`) are unreadable to the operator who
most needs them. And an atlas that can show "this capability expires soon" but
offers no way to act forces the operator out of the governance model — exactly
what the Operate console's "every control is a previewable intent" invariant
(`operatePanel.js:53-54`) forbids. Seed actions keep the preview→approve→prove
loop intact.

### Verify
- Open a policy node → rules render as a sortable-looking table with a raw-JSON
  `<details>` fallback.
- Open a capability node near expiry → "Renew" seeds Studio and pre-fills
  `capabilityId`.
- Trust drawer still shows `driftImpactCount` and `INVALIDATED` flags unchanged.

### Acceptance
- G3.5 satisfied. No direct mutation added anywhere in the atlas (every action is
  a seed → preview).

---

## Task 5 — Studio submit confirmation (close the TOCTOU)

**Re-show the exact plan hash being submitted; ideally submit the previewed plan
id rather than re-planning.**

### Files & anchors
- `web/views/compose.js` — `submitDossier` `684-706` (re-plan call `691-694`)
- `web/lib/dossier.js` — submit button + gate `75-101`; "last chance" note `95-98`

### Steps (code-level)

1. **Confirm step re-showing the plan hash (G3.6, no backend dep).** Before the
   `governed.submit` call at `compose.js:691`, insert a confirmation that displays
   `lastDossier.plan.planHash` (the exact hash the user reviewed —
   `dossier.js:192/412`) and requires an explicit click:
   ```js
   async function submitDossier(out) {
     if (!lastDossier || !lastDossier.plan) return;
     const confirmed = await confirmSubmit(lastDossier.plan.planHash, lastDossier.plan.stepCount);
     if (!confirmed) return;
     // …existing banner + governed.submit…
   }
   ```
   `confirmSubmit` is a small modal (reuse the `rationale-modal-*` structure from
   `rationaleModal.js` for consistency) that renders the hash via `hashChip` and a
   "Submit this exact plan" button. This makes the binding the user commits to
   explicit and visible.

2. **Close the TOCTOU (G3.6, preferred — backend-gated).** `governed.submit`
   currently re-sends `{goalType, customParams}` and **re-plans server-side**
   (`compose.js:691-694`), so the submitted plan hash can differ from the previewed
   one (different block height, plugin set, or gas regime between preview and
   submit). Two paths:
   - **Option A — Verify-after (ship now):** keep `{goalType, customParams}` but
     also send the previewed `expectedPlanHash: lastDossier.plan.planHash`. On the
     response, compare `result.plan.planHash` to the expected hash; if they differ,
     **do not auto-navigate** — show a "the plan changed since you reviewed it,
     re-preview before submitting" warning. This needs `governed.submit` to echo
     the produced plan hash (it returns `result.Intent.ID` today — `:697`; confirm
     it also returns the plan hash, otherwise read it back via the spine).
   - **Option B — Submit the previewed plan id (true fix):** send the already-built
     plan id so the server executes the *reviewed* plan instead of re-planning.
     **Backend dependency:** `governed.submit` must accept `{planId}` (or
     `{previewId}`) and skip re-planning. Do **not** invent the parameter name;
     file it as the SP-Studio backend dependency. Until B lands, ship A — it never
     silently executes a plan the user didn't see.

3. **Keep the existing disabled-state gates.** The submit button already disables
   on policy-denied / no-plan (`dossier.js:81-91`); the confirm step is additive
   and must not bypass them.

### Why
The user reviews plan hash X in the preview, but `governed.submit` re-plans and may
execute hash Y. The "last chance to review" note (`dossier.js:97`) is currently a
promise the code can't keep. A confirm-with-hash plus either verify-after or
submit-by-id makes the reviewed artifact and the executed artifact provably the
same (or visibly different and blocked).

### Verify
- Submitting opens a confirm modal showing the same `planHash` chip as the preview.
- (Option A) Force a re-plan divergence (e.g. submit after the block height moves):
  the UI warns and refuses to navigate instead of silently proceeding.

### Acceptance
- G3.6 satisfied via Option A now; Option B tracked as the backend dependency.

---

## Task 6 — Verifier completion (Phase 0 fix + extensions)

**Fix the version placeholder (Phase 0), add an offline-path download, add an
in-app L0 cross-check.**

### Files & anchors
- `web/views/prove.js` — paste placeholder `195`; offline `verify()` `208-245`;
  live `downloadReport` `116-144`; `downloadJSON` `146-156`; live opts wiring
  `89-92`
- `web/lib/portableVerifier.js` — `PORTABLE_VERSION = '4'` `42`; version check
  `56-59`
- `web/lib/evidenceProof.js` — anchor panel `363-382` (`txHash` `369`, `blockHeight`
  `370`, `l0CrossCheck` `373-380`); export controls `499-528`; CLI string `191`
- `web/lib/proofReceipt.js` — `buildReceiptFromVerifier` (already used `prove.js:226`)

### Steps (code-level)

1. **⛔ Phase 0 — fix the placeholder.** `prove.js:195` advertises
   `{ "version": "3", … }` while `portableVerifier.js:42/56-59` hard-requires
   `'4'` and returns a single failed `version` check otherwise. Change the
   placeholder to `'4'`:
   ```js
   ta.placeholder = '{ "version": "4", "bundleData": "...", ... }';
   ```
   This is a one-line, zero-risk honesty fix that removes an instant, confusing
   "version mismatch" failure for anyone who types the example.

2. **Offline-path download (G3.7).** The drop-zone `verify()` (`208-245`) builds a
   receipt + checks table but offers **no download** (only the *live* reader path
   has `downloadReport` at `116-144`). Reuse the existing module-level
   `downloadJSON` (`146-156`). After `result.appendChild(renderPortableChecks(...))`
   (`239`), append a "Download verification result" button:
   ```js
   const dl = document.createElement('button');
   dl.type = 'button';
   dl.className = 'verify-btn prove-offline-download';
   dl.textContent = 'Download verification result';
   dl.addEventListener('click', () => downloadJSON(
     `offline-verification-${(bundle.id || bundle.bundleId || 'bundle')}.json`,
     { generatedAt: new Date().toISOString(), passed: out.passed, checks: out.checks, receipt }
   ));
   result.appendChild(dl);
   ```
   (`out`, `bundle`, and `receipt` are all already in scope at `218/225/226`.)

3. **In-app L0 cross-check (G3.7, BACKEND DEP — cross-ref SP8/RUNBOOK-07).** The
   bundle reader already knows the anchor coordinates: `proof.anchor.txHash`
   (`evidenceProof.js:369`) and `blockHeight` (`370`), and shows an availability
   note from `l0CrossCheck` (`373-380`). Today the only "cross-check" is a
   copy-pasteable CLI string `p.verifyCommand` (`191`). Add an
   `onCrossCheckL0(proof)` callback to `renderEvidenceProof`'s opts and wire a
   button in `renderAnchorPanel` (or `renderExportControls` `499-528`):
   ```js
   // prove.js refreshProof() opts (89-92), add:
   onCrossCheckL0: () => crossCheckL0(proof),
   ```
   ```js
   async function crossCheckL0(proof) {
     // BACKEND DEP: requires a server RPC that re-derives the L0 inclusion for
     // proof.anchor.txHash @ blockHeight. DO NOT invent the method name here.
     // Until SP8/RUNBOOK-07 lands the endpoint, keep the copy-CLI affordance.
   }
   ```
   **Until the backend RPC exists**, keep the CLI command block (`191`) as the
   working path and render the button **disabled** with a tooltip pointing at the
   readiness dashboard (`evidenceProof.js:187`). The button must never *claim* a
   cross-check it can't perform. SP8/RUNBOOK-07 builds the full L4 loop and
   supplies the RPC.

### Why
The placeholder/required-version mismatch is a guaranteed first-touch failure
(Phase 0). The offline path is where an external auditor — outside the operator's
trust boundary (`prove.js:13`, `portableVerifier.js:6-8`) — most needs a durable
artifact, yet it can't download its result. And an L0 cross-check is the whole
point of an anchored proof; the data is already on screen, only the live action is
missing.

### Verify
- Paste the placeholder JSON verbatim → no longer fails on `version`.
- Offline verify → "Download verification result" produces a JSON with `passed` +
  10 checks + receipt.
- Bundle reader shows the L0 cross-check entry (disabled-with-CLI until the RPC
  ships; live once it does).

### Acceptance
- G0.4 satisfied (Phase 0). G3.7 satisfied for download now; L0 button present and
  honest (degraded to CLI) pending the SP8 RPC.
- New smoke `verifier_version_smoke.mjs` passes.

---

## Task 7 — Identity decision

**Stop the fixture page from masquerading as a control surface; move the
consequence engine into the live flows.**

### Files & anchors
- `web/views/identity.js` — fixture-only page; signature queue panel `85-101`;
  `explanationBlock` `56-83`; no Sign button anywhere
- `web/lib/identity.js` — fixture loader `23-28`; `explainSignature` `79-113`;
  `isConnected` honesty `40-43`

### Decision (recommended)

**Label the page as preview AND relocate `explainSignature` into the live flows.**
The page is honest about *not* holding keys (`identity.js:7`, `isConnected`
`40-43`), but its signature queue (`identity.js:85-101`) reads a fixture
(`identity.js:23`) and controls nothing — there is no Sign button. Rather than wire
a parallel live signing path here (duplicating Approve), do this:

### Steps

1. **Relocate the consequence engine (cross-ref Task 2 step 5 / SP6).** Keep
   `explainSignature` in `web/lib/identity.js:79-113` (it is a pure function with no
   fixture dependency). Import and call it from the **live** Approve flow (Task 2.5)
   and, when Studio gains a sign step, there too. This is where a real decision is
   about to happen.

2. **Label the Identity page as preview.** In `identity.js` add a banner to the
   header (`mount` `196-223`, after the subtitle `202-203`):
   ```js
   header.appendChild(setAttrs(
     elt('p', 'identity-preview-banner',
       'Preview — this screen reads a sample identity to demonstrate the signature explainer. Live signing happens on the Approve screen.'),
     { role: 'note' }));
   ```
   And link the signature-queue panel (`85-101`) to the real queue: each item's
   action routes to `#/approve/<planId>` or `#/inbox/approvals` so the demo points
   at the live surface instead of dead-ending.

3. **Do not fake "connected".** Leave `isConnected` (`40-43`) untouched — it
   already refuses to show connected without `verifiedAt`/`liveProvider`. The
   alternative (full wallet-connect + live `governed.approve` from the queue here)
   is **Option B of Task 2.6** and is the same backend/wallet dependency; do it
   once, in Approve, not twice.

### Why
A page titled "what a signature will do" that can't make one is a trust mirage. The
`explainSignature` engine (funds-move / irreversible / agent-initiated / expected
proof — `identity.js:88-110`) is the single best pre-action consequence panel in
the codebase and it's stranded. Move the *capability* to where the action is;
mark the *page* as the preview it actually is.

### Verify
- Identity page shows a "Preview" banner; queue items deep-link to Approve/Inbox.
- The same `explainSignature` block now renders inside the live Approve confirm
  (Task 2).

### Acceptance
- G3.8 satisfied (also credited under Task 2). No page claims a control it lacks.

---

# Test plan

All smokes are **no-browser** Node `--test` modules under `web/test/`, matching the
existing harness convention (`web/test/inbox_collab_smoke.mjs`,
`web/test/verify_portable_fixture.mjs`). Run:

```
node --test web/test/*.mjs
```

### Fence: `inbox_bulk_gate_smoke.mjs`  (Task 1, Phase 0)
```
test('bulk approve skips a blocked dossier and never calls governed.approve for it')
test('bulk approve sends planHash, stageId, role for each non-blocked item')
test('bulk approve uses the rationale modal floor (>=10 chars), not window.prompt')
```
- Stub `rpcWithDisclosure`: `nexus.approvalDossier` returns one dossier with a
  `blocked` invalidator and one clean; assert the blocked planId yields **zero**
  `governed.approve` calls and the clean one yields exactly one call carrying
  `{planHash, stageId, role}`. Assert no `window.prompt` is invoked (spy on
  `globalThis.prompt`).

### Fence: `approve_stepgraph_smoke.mjs`  (Task 2)
```
test('approval dossier renders the step graph nodes when present')
test('approval dossier renders ghost per-step predictions when present')
test('role picker surfaces every remaining slot (not just remaining[0])')
```
- Feed `renderApprovalDossier` a dossier carrying `stepGraph.nodes` +
  `ghostEvidence.steps` (reuse shapes from `dossier.js` renderers); assert the
  DOM contains `.dossier-step-card` and the ghost predictions table rows; assert
  the role `<select>` has one option per `remaining[]` entry.

### Fence: `verifier_version_smoke.mjs`  (Task 6, Phase 0)
```
test('the paste placeholder advertises the version the verifier requires')
test('portable verifier rejects version "3" and accepts version "4"')
```
- Read `prove.js` source and assert the placeholder string contains
  `"version": "4"` and **not** `"3"`. Import `verifyPortablePackage`; assert a
  `{version:'3'}` package fails the `version` check and the checked-in v4 fixture
  passes (reuse `_verifier_harness.mjs`).

### Existing regression smokes (must still pass)
- `web/test/verify_portable_fixture.mjs` (v4 fixture, `manifest.portableVersion === '4'`).
- `web/test/inbox_collab_smoke.mjs` (separate fixture inbox — confirm Task 1 did
  not touch `web/lib/inbox.js`; the live inbox is `web/views/inbox.js`).
- `web/test/identity_smoke.mjs` (explainSignature behaviour unchanged by Task 7).
- `web/test/router_smoke.mjs` (deep-link routes added by Tasks 3/4).

### Manual / browser checks (per Verify sections)
Inbox blocked-batch; Approve diff + badge + step graph; Operate drill-throughs;
Atlas rules table + seed; Studio confirm-hash divergence; Verifier offline
download + L0 entry; Identity preview banner.

---

# Acceptance (rollup)

| Gate item | Surface | Verified by |
|---|---|---|
| G0.1–G0.3 | Inbox | `inbox_bulk_gate_smoke.mjs` + network inspection |
| G0.4 | Verifier | `verifier_version_smoke.mjs` |
| G3.1–G3.3, G3.8 | Approve | `approve_stepgraph_smoke.mjs` + manual |
| G3.4 | Operate | `router_smoke.mjs` + manual (degraded denials/expiring honest) |
| G3.5 | Atlas | manual rules-table + seed-to-Studio |
| G3.6 | Studio | manual confirm-hash + divergence warning |
| G3.7 | Verifier | offline download smoke + manual L0 entry |

Backend dependencies are **tracked, not blocking** the Phase-0 and Gate-0 items.
The following ship in **degraded-but-honest** form until their backend lands:
denials deep-link (Task 3.3), expiring panel (Task 3.4), real client signing
(Task 2.6 Option B), submit-by-plan-id (Task 5.2 Option B), live L0 cross-check
(Task 6.3).

---

# Rollback

Each task is an isolated, additive change set; revert independently.

| Task | Rollback |
|---|---|
| 1 Inbox | Revert `web/views/inbox.js`. The previous bulk path returns — **this re-opens the safety regression**, so only roll back if a worse bug is introduced; prefer fixing forward. Remove `inbox_bulk_gate_smoke.mjs` if reverting. |
| 2 Approve | Revert `web/views/approve.js` + `web/lib/approvalDossier.js` (and the two new exports in `web/lib/dossier.js`). The role auto-pick (`approve.js:160-167`) and dossier-without-graph return. |
| 3 Operate | Revert `web/lib/operatePanel.js` (+ view). Panels go back to non-clickable counts; the ninth panel disappears. |
| 4 Atlas | Revert `web/lib/governAtlas.js`. Policy rules return to raw JSON; drawers return to read-only. No data loss (actions were seed-only). |
| 5 Studio | Revert `web/views/compose.js`. Confirm step removed; re-plan-on-submit returns (TOCTOU re-opens). |
| 6 Verifier | The placeholder fix (`prove.js:195`) and offline download are independently revertible. **Do not** revert the placeholder fix without cause — it re-introduces the Phase-0 failure. |
| 7 Identity | Revert the banner + queue links in `web/views/identity.js`. `explainSignature` stays exported either way (pure function); Approve's import is reverted with Task 2. |

No migrations, no persisted-state changes (the only persistence is the existing
`localStorage` compose seed at `operatePanel.js:19`, reused unchanged). All changes
are client-side; reverting a file is sufficient.
