// Nexus — the narrative panel.
//
// When an intent is selected, the narrative panel slides up over
// the timeline, covering the flow region. It tells the SELECTED
// intent's story as 7 chapters — one per stage of the spine — that
// the user scrolls vertically. The spine strip above pins to this
// intent's progression and acts as a chapter jump-bar.
//
// Each chapter renders the canonical content for its stage:
//   1. Intent     — goal payload, actor, customParams
//   2. Plan       — hash, drift, ghost evidence, declared steps
//   3. Approval   — signers, plan-hash binding, simulation lock
//   4. Execution  — per-step trace + gas + plugin attribution
//   5. Outcome    — finality state machine, gas drift summary
//   6. Evidence   — bundle hash chain + inline 8-check verifier +
//                   portable export
//   7. Anchor     — L0 binding + chain walker + L0 cross-check
//
// References to entities (plugins, policies, trust profiles, roles,
// capabilities) are clickable and open side drawers — the user
// stays inside the narrative even when reading definitions.

import {
  rpcWithDisclosure,
  shortHash,
  formatTime,
  hashChip,
  jsonBlock,
  emptyState,
  kvRow,
  card,
  statusPill,
  readField,
  loadingNode,
  errorNode,
  STAGES,
} from '/lib/spineCommon.js';
import {
  openPluginDrawer,
  openTrustDrawer,
  openPolicyDecisionDrawer,
  openRoleDrawer,
  closeAllDrawers,
} from '/lib/drawer.js';
import { fetchNarrative } from '/lib/store.js';

// One canonical STAGES source (RUNBOOK-02 Task 1): one narrative chapter per
// spine stage, in canonical order. The extra `token` field on STAGES is ignored
// here; {key,label,blurb} are used exactly as before.
const CHAPTERS = STAGES;

export function createNarrative({ onClose, onChapterEnter }) {
  const root = document.createElement('div');
  root.className = 'spine-narrative';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'Intent narrative');
  root.dataset.open = 'false';

  // Header: breadcrumb + close
  const head = document.createElement('div');
  head.className = 'narr-head';
  const crumb = document.createElement('div');
  crumb.className = 'narr-crumb';
  crumb.id = 'narr-crumb';
  head.appendChild(crumb);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'narr-close';
  closeBtn.setAttribute('aria-label', 'Close narrative');
  closeBtn.innerHTML = '<span>Close</span><span class="narr-close-x">×</span>';
  closeBtn.addEventListener('click', () => onClose && onClose());
  head.appendChild(closeBtn);
  root.appendChild(head);

  // Scrollable chapter region
  const scroller = document.createElement('div');
  scroller.className = 'narr-scroll';
  scroller.id = 'narr-scroll';
  root.appendChild(scroller);

  // Cleanup tracking
  let intersectionObserver = null;
  let cache = {};

  function close() {
    root.classList.remove('open');
    root.dataset.open = 'false';
    closeAllDrawers();
    if (intersectionObserver) {
      intersectionObserver.disconnect();
      intersectionObserver = null;
    }
  }

  function openIntent(intentId, onStages) {
    cache = {};
    root.classList.add('open');
    root.dataset.open = 'true';

    // Reset DOM
    crumb.replaceChildren();
    scroller.replaceChildren(loadingNode('Loading intent narrative…'));

    loadAll(intentId).then(() => {
      // Build chapters
      scroller.replaceChildren();
      for (const ch of CHAPTERS) {
        const sec = document.createElement('section');
        sec.className = 'narr-chapter';
        sec.dataset.stage = ch.key;
        sec.id = 'narr-ch-' + ch.key;

        const head = document.createElement('header');
        head.className = 'narr-chapter-head';
        const num = document.createElement('div');
        num.className = 'narr-chapter-num';
        num.textContent = String(CHAPTERS.indexOf(ch) + 1).padStart(2, '0');
        head.appendChild(num);
        const titleWrap = document.createElement('div');
        titleWrap.className = 'narr-chapter-titlewrap';
        const title = document.createElement('h2');
        title.className = 'narr-chapter-title';
        title.textContent = ch.label;
        titleWrap.appendChild(title);
        const blurb = document.createElement('div');
        blurb.className = 'narr-chapter-blurb';
        blurb.textContent = ch.blurb;
        titleWrap.appendChild(blurb);
        head.appendChild(titleWrap);
        const stamp = document.createElement('div');
        stamp.className = 'narr-chapter-stamp';
        stamp.id = 'narr-stamp-' + ch.key;
        head.appendChild(stamp);
        sec.appendChild(head);

        const body = document.createElement('div');
        body.className = 'narr-chapter-body';
        body.dataset.stage = ch.key;
        sec.appendChild(body);

        scroller.appendChild(sec);
      }

      // Render breadcrumb
      renderCrumb(intentId);

      // Render chapters
      renderChapter('intent');
      renderChapter('plan');
      renderChapter('approval');
      renderChapter('execution');
      renderChapter('outcome');
      renderChapter('evidence');
      renderChapter('anchor');

      // Stamps (timestamps + status from spineRow)
      stampChapters();

      // IntersectionObserver: tell strip which chapter is active
      if (intersectionObserver) intersectionObserver.disconnect();
      intersectionObserver = new IntersectionObserver((entries) => {
        let topMost = null;
        for (const e of entries) {
          if (e.isIntersecting) {
            if (!topMost || e.boundingClientRect.top < topMost.boundingClientRect.top) {
              topMost = e;
            }
          }
        }
        if (topMost && onChapterEnter) {
          onChapterEnter(topMost.target.dataset.stage);
        }
      }, { root: scroller, threshold: [0, 0.4, 1] });
      for (const sec of scroller.querySelectorAll('.narr-chapter')) intersectionObserver.observe(sec);

      // Tell the strip the intent's stages
      if (onStages && cache.spineRow && cache.spineRow.stages) {
        onStages(cache.spineRow.stages);
      }
    }).catch((err) => {
      scroller.replaceChildren(errorNode(err));
    });
  }

  function scrollToChapter(stageKey) {
    const target = document.getElementById('narr-ch-' + stageKey);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Data load ──────────────────────────────────────────────────────
  // Phase 0: route through the central store. The store dedupes
  // concurrent fetches and caches per-intent narratives so opening
  // an intent twice is a single backend round-trip.
  async function loadAll(intentId) {
    const slice = await fetchNarrative(intentId);
    if (!slice || slice.status === 'error') throw (slice && slice.error) || new Error('failed to load narrative');
    if (!slice.data) throw new Error('intent not found');
    const d = slice.data;
    cache.intent = d.intent;
    cache.intentId = intentId;
    cache.spineRow = d.spineRow;
    cache.plan = d.plan;
    cache.approvals = d.approvals;
    cache.outcome = d.outcome;
    cache.evidence = d.evidence;
    cache.anchor = d.anchor;
    cache.policies = d.policies;
    cache.anchorChain = d.anchorChain;
    cache.evidenceID = d.evidenceID;
    cache.anchorID = d.anchorID;
  }

  // ── Crumb ──
  function renderCrumb(intentId) {
    crumb.replaceChildren();
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'narr-crumb-back';
    back.innerHTML = '<span class="narr-crumb-arrow">←</span><span>Back to timeline</span>';
    back.addEventListener('click', () => onClose && onClose());
    crumb.appendChild(back);

    const title = document.createElement('div');
    title.className = 'narr-crumb-title';
    const eyebrow = document.createElement('div');
    eyebrow.className = 'narr-crumb-eyebrow';
    eyebrow.textContent = 'INTENT NARRATIVE';
    title.appendChild(eyebrow);
    const idEl = document.createElement('div');
    idEl.className = 'narr-crumb-id mono';
    idEl.textContent = intentId;
    title.appendChild(idEl);
    crumb.appendChild(title);

    const goal = readField(cache.intent, 'goalType') || readField(cache.intent, 'GoalType');
    const actor = readField(cache.intent, 'userAddress') || readField(cache.intent, 'UserAddress') ||
                  (cache.spineRow && cache.spineRow.actor);
    const stats = document.createElement('div');
    stats.className = 'narr-crumb-stats';
    if (goal) {
      const goalEl = document.createElement('div');
      goalEl.className = 'narr-crumb-stat';
      goalEl.innerHTML = `<span class="narr-crumb-label">Goal</span><span class="narr-crumb-val">${escapeHtml(goal)}</span>`;
      stats.appendChild(goalEl);
    }
    if (actor) {
      const actEl = document.createElement('div');
      actEl.className = 'narr-crumb-stat';
      actEl.innerHTML = `<span class="narr-crumb-label">Actor</span><span class="narr-crumb-val mono">${escapeHtml(actor)}</span>`;
      stats.appendChild(actEl);
    }
    const stateEl = document.createElement('div');
    stateEl.className = 'narr-crumb-stat';
    stateEl.innerHTML = `<span class="narr-crumb-label">State</span>`;
    const pill = statusPill(cache.intent.state || cache.intent.State || '—', stateClass(cache.spineRow));
    stateEl.appendChild(pill);
    stats.appendChild(stateEl);
    crumb.appendChild(stats);

    // NEXUS-REIMAGINED Phase 4 — entry point into the Execution Cinema.
    // The narrative is the chronological story; #/execute is the live
    // dependency-graph view. Both are valid lenses on the same intent.
    const cinemaBtn = document.createElement('a');
    cinemaBtn.className = 'narr-crumb-cinema-btn';
    cinemaBtn.href = '#/execute/' + encodeURIComponent(intentId);
    cinemaBtn.textContent = 'Live execution →';
    cinemaBtn.title = 'See this action running step-by-step';
    crumb.appendChild(cinemaBtn);

    // NEXUS-REIMAGINED Phase 5 — entry point into the Evidence
    // Reader. Clickable when the intent has a recorded evidence
    // bundle (id mirrors "ev-<intentId>" by canonical convention).
    const proveBtn = document.createElement('a');
    proveBtn.className = 'narr-crumb-prove-btn';
    proveBtn.href = '#/prove/' + encodeURIComponent('ev-' + intentId);
    proveBtn.textContent = 'Verify result →';
    proveBtn.title = 'Open the verifier for this action\'s proof file';
    crumb.appendChild(proveBtn);

    // NEXUS-REIMAGINED Phase 6 — entry point into the Authority Atlas.
    // The atlas surfaces every actor / role / capability / policy /
    // trust profile / plugin associated with the intent.
    const governBtn = document.createElement('a');
    governBtn.className = 'narr-crumb-govern-btn';
    governBtn.href = '#/govern';
    governBtn.textContent = 'Authority →';
    governBtn.title = 'Who can do what — actors, roles, capabilities, policies, trust';
    crumb.appendChild(governBtn);

    // NEXUS-REIMAGINED Phase 7 — entry point into the Operate console.
    // Health panels + governed action templates. Every mutating
    // control opens Intent Studio in preview mode.
    const operateBtn = document.createElement('a');
    operateBtn.className = 'narr-crumb-operate-btn';
    operateBtn.href = '#/operate';
    operateBtn.textContent = 'Operations →';
    operateBtn.title = 'System health + ready-to-run actions';
    crumb.appendChild(operateBtn);
  }

  function stateClass(intent) {
    if (!intent) return 'warn';
    const s = (intent.state || '').toLowerCase();
    if (s === 'failed') return 'alert';
    if (s === 'completed' || intent.anchorRecordId) return 'ok';
    if (s === 'resolved') return 'info';
    return 'warn';
  }

  function stampChapters() {
    const stages = (cache.spineRow && cache.spineRow.stages) || [];
    for (const s of stages) {
      const stamp = document.getElementById('narr-stamp-' + s.stage);
      if (!stamp) continue;
      stamp.replaceChildren();
      if (s.completed) {
        stamp.appendChild(statusPill('✓ done', 'ok'));
      } else if (s.failed) {
        stamp.appendChild(statusPill('✗ failed', 'alert'));
      } else {
        stamp.appendChild(statusPill('· pending', 'warn'));
      }
    }
  }

  // ── Chapter renderers ──
  function renderChapter(key) {
    const body = document.querySelector(`.narr-chapter-body[data-stage="${key}"]`);
    if (!body) return;
    body.replaceChildren();
    switch (key) {
      case 'intent':    return body.appendChild(renderIntent());
      case 'plan':      return body.appendChild(renderPlan());
      case 'approval':  return body.appendChild(renderApproval());
      case 'execution': return body.appendChild(renderExecution());
      case 'outcome':   return body.appendChild(renderOutcome());
      case 'evidence':  return body.appendChild(renderEvidence());
      case 'anchor':    return body.appendChild(renderAnchor());
    }
  }

  function renderIntent() {
    const wrap = document.createElement('div');
    const obj = cache.intent;
    const grid = document.createElement('div');
    grid.className = 'detail-grid';
    const meta = document.createElement('div');
    meta.appendChild(kvRow('Goal type', readField(obj, 'goalType') || readField(obj, 'GoalType')));
    meta.appendChild(kvRow('Actor', readField(obj, 'userAddress') || readField(obj, 'UserAddress') || (cache.spineRow && cache.spineRow.actor)));
    meta.appendChild(kvRow('Submitted at', formatTime(obj.created || obj.Created)));
    meta.appendChild(kvRow('Last updated', formatTime(obj.updated || obj.Updated)));
    if (cache.spineRow && cache.spineRow.evidenceLevel) meta.appendChild(kvRow('Evidence level', cache.spineRow.evidenceLevel));
    grid.appendChild(card('Envelope', meta));
    const goal = extractGoal(obj);
    if (goal) grid.appendChild(card('Goal payload', jsonBlock(goal)));
    wrap.appendChild(grid);
    return wrap;
  }

  function renderPlan() {
    const wrap = document.createElement('div');
    const plan = cache.plan;
    if (!plan) { wrap.appendChild(emptyState('No plan persisted yet — the resolver may not have completed compilation.')); return wrap; }
    const grid = document.createElement('div');
    grid.className = 'detail-grid';
    const meta = document.createElement('div');
    meta.appendChild(kvRow('Plan ID', plan.id || plan.ID));
    meta.appendChild(kvRow('Plan hash', hashChip(readField(plan, 'PlanHash'), { head: 12, tail: 8 })));
    meta.appendChild(kvRow('Workflow def', readField(plan, 'WorkflowDefID') || '—'));
    meta.appendChild(kvRow('Step count', readField(plan, 'StepCount')));
    meta.appendChild(kvRow('Total gas estimate', readField(plan, 'TotalGasEstimate')));
    meta.appendChild(kvRow('Required approvals', readField(plan, 'ApprovalCount')));
    meta.appendChild(kvRow('Created at', formatTime(plan.created || plan.Created)));
    grid.appendChild(card('Plan envelope', meta));
    const note = document.createElement('div');
    note.appendChild(document.createTextNode(
      'Approvals on this plan committed to its hash. Drift in ghost evidence between approval and execution invalidates the binding (P1-005 cross-binding).'
    ));
    grid.appendChild(card('Plan-hash commitment', note));
    wrap.appendChild(grid);
    return wrap;
  }

  function renderApproval() {
    const wrap = document.createElement('div');
    const approvals = (cache.approvals && Array.isArray(cache.approvals.approvals)) ? cache.approvals.approvals : [];
    const bundleApprovals = bundleApprovalEvidence(cache.evidence);
    if (approvals.length === 0 && bundleApprovals.length === 0) {
      wrap.appendChild(emptyState('No approvals recorded — waived under the dev-test policy or admin-bootstrap goal.'));
      return wrap;
    }
    const grid = document.createElement('div');
    grid.className = 'detail-grid';
    if (bundleApprovals.length > 0) {
      const list = document.createElement('div');
      list.className = 'approval-mini-list';
      for (const a of bundleApprovals) {
        const row = document.createElement('div');
        row.className = 'approval-mini-row';
        const id = document.createElement('span');
        id.className = 'mono';
        id.textContent = a.identity || a.Identity || '—';
        row.appendChild(id);
        const role = a.role || a.Role || '—';
        const r = document.createElement('button');
        r.type = 'button';
        r.className = 'narr-entity-link';
        r.textContent = `role=${role}`;
        r.addEventListener('click', () => openRoleDrawer(role));
        row.appendChild(r);
        const ph = a.planHash || a.PlanHash;
        if (ph) row.appendChild(hashChip(ph, { head: 10, tail: 6 }));
        list.appendChild(row);
      }
      grid.appendChild(card(`Approval evidence on bundle (${bundleApprovals.length})`, list));
    }
    if (approvals.length > 0) {
      const list = document.createElement('div');
      list.className = 'approval-mini-list';
      for (const a of approvals) {
        const row = document.createElement('div');
        row.className = 'approval-mini-row';
        const id = document.createElement('span');
        id.className = 'mono';
        id.textContent = shortHash(a.id || a.ID, 16, 6);
        row.appendChild(id);
        const state = readField(a, 'state') || readField(a, 'State') || a.state || 'pending';
        row.appendChild(statusPill(state, state === 'granted' ? 'ok' : 'warn'));
        list.appendChild(row);
      }
      grid.appendChild(card(`Approval envelopes (${approvals.length})`, list));
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function renderExecution() {
    const wrap = document.createElement('div');
    const evidenceObj = cache.evidence;
    if (!evidenceObj) { wrap.appendChild(emptyState('No execution traces — evidence bundle not yet captured.')); return wrap; }
    const f = evidenceObj.fields || evidenceObj.Fields || {};
    let steps = f.StepOutcomes || f.stepOutcomes;
    if (typeof steps === 'string') { try { steps = JSON.parse(steps); } catch (e) { steps = []; } }
    if (!Array.isArray(steps) || steps.length === 0) {
      wrap.appendChild(emptyState('No per-step traces in the bundle.')); return wrap;
    }
    const tableWrap = document.createElement('div');
    tableWrap.className = 'spine-table-wrap';
    const table = document.createElement('table');
    table.className = 'spine-table';
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    for (const c of ['Step', 'Status', 'Gas planned', 'Gas actual', 'Drift', 'Output hash']) {
      const th = document.createElement('th');
      th.textContent = c;
      tr.appendChild(th);
    }
    thead.appendChild(tr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (const s of steps) {
      const r = document.createElement('tr');
      const stage = document.createElement('td');
      stage.className = 'mono';
      stage.textContent = s.stageId || s.StageID || '—';
      r.appendChild(stage);
      const stCell = document.createElement('td');
      const stat = s.status || s.Status || '—';
      stCell.appendChild(statusPill(stat, stat === 'completed' || stat === 'success' ? 'ok' : (stat === 'failed' ? 'alert' : 'warn')));
      r.appendChild(stCell);
      r.appendChild(td(s.plannedGas || s.PlannedGas));
      r.appendChild(td(s.actualGas || s.ActualGas));
      r.appendChild(td(formatPercent(s.gasDrift || s.GasDrift)));
      const oh = document.createElement('td');
      const ohash = s.outputHash || s.OutputHash;
      if (ohash) oh.appendChild(hashChip(ohash, { head: 10, tail: 6 }));
      else oh.textContent = '—';
      r.appendChild(oh);
      tbody.appendChild(r);
    }
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);

    // Plugins fired (pulled from bundle.PluginVersions; click → drawer)
    const plugins = bundlePluginVersions(cache.evidence);
    if (plugins.length > 0) {
      const phead = document.createElement('h3');
      phead.className = 'narr-mini-head';
      phead.textContent = `Plugins fired (${plugins.length})`;
      wrap.appendChild(phead);
      const chips = document.createElement('div');
      chips.className = 'narr-entity-chips';
      for (const p of plugins) {
        const id = p.pluginId || p.PluginID;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'narr-entity-chip';
        chip.innerHTML = `<span class="mono">${escapeHtml(id)}</span><span class="narr-entity-chip-sub">${escapeHtml(p.version || p.Version || '')}</span>`;
        chip.addEventListener('click', () => openPluginDrawer(id));
        chips.appendChild(chip);
      }
      wrap.appendChild(chips);
    }

    // Errors
    const errors = steps.filter((s) => (s.error || s.Error || '').length > 0);
    if (errors.length > 0) {
      for (const e of errors) {
        const row = document.createElement('div');
        row.className = 'spine-error';
        row.style.marginTop = '8px';
        row.textContent = `${e.stageId || e.StageID}: ${e.error || e.Error}`;
        wrap.appendChild(row);
      }
    }

    // Policy decisions inline
    const policies = (cache.policies && cache.policies.decisions) || [];
    if (policies.length > 0) {
      const head2 = document.createElement('h3');
      head2.className = 'narr-mini-head';
      head2.textContent = `Policy decisions during execution (${policies.length})`;
      wrap.appendChild(head2);
      const list = document.createElement('div');
      list.className = 'narr-entity-list';
      for (const d of policies) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'narr-entity-row';
        if (d.decision !== 'allow') row.classList.add('alert');
        row.innerHTML = `
          <span class="narr-entity-row-pill">${escapeHtml(d.decision)}</span>
          <span class="mono narr-entity-row-id">${escapeHtml(d.policyType)}</span>
          <span class="narr-entity-row-sub">${escapeHtml(d.ruleId || '—')}</span>
        `;
        row.addEventListener('click', () => openPolicyDecisionDrawer(d));
        list.appendChild(row);
      }
      wrap.appendChild(list);
    }

    // Trust profiles consulted
    const trust = bundleTrustAssumptions(cache.evidence);
    if (trust.length > 0) {
      const head2 = document.createElement('h3');
      head2.className = 'narr-mini-head';
      head2.textContent = `Trust profiles consulted (${trust.length})`;
      wrap.appendChild(head2);
      const chips = document.createElement('div');
      chips.className = 'narr-entity-chips';
      for (const t of trust) {
        const id = t.profileId || t.ProfileID;
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'narr-entity-chip';
        chip.innerHTML = `<span class="mono">${escapeHtml(id)}</span><span class="narr-entity-chip-sub">${escapeHtml(t.evaluation || t.Evaluation || '')}</span>`;
        chip.addEventListener('click', () => openTrustDrawer(id));
        chips.appendChild(chip);
      }
      wrap.appendChild(chips);
    }

    return wrap;
  }

  function renderOutcome() {
    const wrap = document.createElement('div');
    const outcome = cache.outcome;
    if (!outcome) { wrap.appendChild(emptyState('No outcome record persisted yet.')); return wrap; }
    const grid = document.createElement('div');
    grid.className = 'detail-grid';
    const meta = document.createElement('div');
    meta.appendChild(kvRow('Outcome ID', outcome.id || outcome.ID));
    meta.appendChild(kvRow('Overall status', readField(outcome, 'OverallStatus')));
    meta.appendChild(kvRow('Finality', statusPill(readField(outcome, 'Finality') || 'provisional', finalityKind(readField(outcome, 'Finality')))));
    meta.appendChild(kvRow('Gas used', readField(outcome, 'TotalGasUsed')));
    meta.appendChild(kvRow('Gas planned', readField(outcome, 'TotalGasPlanned')));
    meta.appendChild(kvRow('Gas drift', formatPercent(readField(outcome, 'GasDrift'))));
    grid.appendChild(card('Outcome envelope', meta));
    const fin = document.createElement('div');
    fin.appendChild(renderFinalityFlow(readField(outcome, 'Finality')));
    grid.appendChild(card('Finality state machine', fin));
    wrap.appendChild(grid);
    return wrap;
  }

  function renderEvidence() {
    const wrap = document.createElement('div');
    const evidenceObj = cache.evidence;
    if (!evidenceObj) { wrap.appendChild(emptyState('Evidence bundle not yet captured.')); return wrap; }
    const grid = document.createElement('div');
    grid.className = 'detail-grid';
    const meta = document.createElement('div');
    meta.appendChild(kvRow('Bundle ID', evidenceObj.id || evidenceObj.ID));
    meta.appendChild(kvRow('Level', statusPill(readField(evidenceObj, 'Level') || 'standard', 'info')));
    meta.appendChild(kvRow('Anchor status', statusPill(readField(evidenceObj, 'Anchor') || 'pending', readField(evidenceObj, 'Anchor') === 'anchored' ? 'ok' : 'warn')));
    meta.appendChild(kvRow('Bundle hash', hashChip(readField(evidenceObj, 'BundleHash'), { head: 12, tail: 8 })));
    meta.appendChild(kvRow('Sealed block', readField(evidenceObj, 'SealedBlockHeight')));
    grid.appendChild(card('Evidence bundle', meta));

    // 8-check verifier
    const verifyBody = document.createElement('div');
    const vBtn = document.createElement('button');
    vBtn.type = 'button';
    vBtn.className = 'verify-btn';
    vBtn.textContent = 'Run 8-check verification';
    const vOut = document.createElement('div');
    vOut.className = 'verify-output';
    vBtn.addEventListener('click', async () => {
      vBtn.disabled = true;
      vOut.replaceChildren(loadingNode('Verifying…'));
      try {
        const r = await rpcWithDisclosure('evidence.verify', { id: cache.evidenceID });
        vOut.replaceChildren(renderVerificationResult(r));
      } catch (e) { vOut.replaceChildren(errorNode(e)); }
      finally { vBtn.disabled = false; }
    });
    verifyBody.appendChild(vBtn);
    verifyBody.appendChild(vOut);
    grid.appendChild(card('Inline verification', verifyBody));

    // Portable export
    const expBody = document.createElement('div');
    const eBtn = document.createElement('button');
    eBtn.type = 'button';
    eBtn.className = 'verify-btn';
    eBtn.textContent = 'Export portable package (JSON)';
    const eOut = document.createElement('div');
    eOut.className = 'verify-output';
    eBtn.addEventListener('click', async () => {
      eBtn.disabled = true;
      eOut.replaceChildren(loadingNode('Building…'));
      try {
        const pkg = await rpcWithDisclosure('explorer.evidenceExportPortable', { id: cache.evidenceID });
        const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `portable-${cache.evidenceID}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        const ok = document.createElement('div');
        ok.className = 'verify-summary verify-pass';
        ok.textContent = `✓ Portable package downloaded. Drop it on the operate console → Verify tab to validate offline.`;
        eOut.replaceChildren(ok);
      } catch (e) { eOut.replaceChildren(errorNode(e)); }
      finally { eBtn.disabled = false; }
    });
    expBody.appendChild(eBtn);
    expBody.appendChild(eOut);
    grid.appendChild(card('Portable export', expBody));

    wrap.appendChild(grid);
    return wrap;
  }

  function renderAnchor() {
    const wrap = document.createElement('div');
    const anchorObj = cache.anchor;
    if (!anchorObj) { wrap.appendChild(emptyState('No anchor record yet.')); return wrap; }
    const f = anchorObj.fields || anchorObj.Fields || {};
    const grid = document.createElement('div');
    grid.className = 'detail-grid';
    const meta = document.createElement('div');
    meta.appendChild(kvRow('Anchor ID', anchorObj.id || anchorObj.ID));
    meta.appendChild(kvRow('Artifact type', f.artifactType || f.ArtifactType));
    meta.appendChild(kvRow('Artifact hash', hashChip(f.artifactHash || f.ArtifactHash, { head: 12, tail: 8 })));
    meta.appendChild(kvRow('Anchor class', f.anchorType || f.AnchorType));
    meta.appendChild(kvRow('Anchor purpose', f.anchorPurpose || f.AnchorPurpose));
    meta.appendChild(kvRow('Status', statusPill(f.status || anchorObj.state || 'pending', (f.status === 'confirmed') ? 'ok' : 'warn')));
    if (f.l0TxHash) meta.appendChild(kvRow('L0 tx hash', hashChip(f.l0TxHash, { head: 12, tail: 8 })));
    if (f.l0BlockHeight !== undefined) meta.appendChild(kvRow('L0 block', f.l0BlockHeight));
    if (f.l0DataAccount) meta.appendChild(kvRow('L0 data account', f.l0DataAccount));
    grid.appendChild(card('L0 binding', meta));
    // Chain
    const chain = cache.anchorChain && Array.isArray(cache.anchorChain.chain) ? cache.anchorChain.chain : [];
    if (chain.length > 0) {
      const cb = document.createElement('div');
      const ol = document.createElement('ol');
      ol.className = 'anchor-chain-list';
      for (const link of chain.slice(0, 10)) {
        const li = document.createElement('li');
        const id = document.createElement('span');
        id.className = 'mono';
        id.textContent = shortHash(link.id, 14, 6);
        li.appendChild(id);
        const at = document.createElement('span');
        at.className = 'chain-at';
        at.textContent = ` ${link.artifactType || '?'} · block ${link.l0BlockHeight !== undefined ? link.l0BlockHeight : '?'}`;
        li.appendChild(at);
        ol.appendChild(li);
      }
      cb.appendChild(ol);
      grid.appendChild(card('Anchor chain', cb));
    }
    wrap.appendChild(grid);
    return wrap;
  }

  return {
    element: root,
    openIntent,
    close,
    scrollToChapter,
    destroy() {
      if (intersectionObserver) intersectionObserver.disconnect();
    },
  };
}

// ── helpers ──
function bundleApprovalEvidence(evidenceObj) {
  if (!evidenceObj) return [];
  const f = evidenceObj.fields || evidenceObj.Fields || {};
  let data = f.ApprovalEvidence || f.approvalEvidence;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = []; } }
  return Array.isArray(data) ? data : [];
}
function bundlePluginVersions(evidenceObj) {
  if (!evidenceObj) return [];
  const f = evidenceObj.fields || evidenceObj.Fields || {};
  let data = f.PluginVersions || f.pluginVersions;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = []; } }
  return Array.isArray(data) ? data : [];
}
function bundleTrustAssumptions(evidenceObj) {
  if (!evidenceObj) return [];
  const f = evidenceObj.fields || evidenceObj.Fields || {};
  let data = f.TrustAssumptions || f.trustAssumptions;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = []; } }
  return Array.isArray(data) ? data : [];
}
function extractGoal(obj) {
  const fields = (obj && (obj.fields || obj.Fields)) || {};
  const goalType = fields.GoalType || fields.goalType;
  const customParams = fields.CustomParams || fields.customParams || fields.Goal || fields.goal;
  if (!goalType && !customParams) return null;
  return { goalType: goalType || '', customParams: customParams || {} };
}
function td(text) {
  const t = document.createElement('td');
  t.textContent = (text === undefined || text === null) ? '—' : String(text);
  return t;
}
function formatPercent(d) {
  if (typeof d !== 'number') return d ? String(d) : '—';
  const sign = d > 0 ? '+' : '';
  return `${sign}${(d * 100).toFixed(2)}%`;
}
function finalityKind(s) {
  switch (String(s)) {
    case 'L0AnchoredFinal': case 'l0_anchored_final': return 'ok';
    case 'LocallyFinal': case 'locally_final': return 'info';
    case 'failed': case 'Failed': return 'alert';
    default: return 'warn';
  }
}
function renderFinalityFlow(currentState) {
  const wrap = document.createElement('div');
  wrap.className = 'finality-flow';
  const states = [
    { label: 'Provisional', key: 'Provisional' },
    { label: 'Locally final', key: 'LocallyFinal' },
    { label: 'L0 anchored', key: 'L0AnchoredFinal' },
  ];
  let reachedIdx = states.findIndex((s) => s.key === currentState || s.key.toLowerCase() === String(currentState).toLowerCase());
  if (reachedIdx === -1 && currentState) reachedIdx = states.findIndex((s) => s.label.toLowerCase() === String(currentState).toLowerCase());
  states.forEach((s, idx) => {
    const stage = document.createElement('div');
    stage.className = 'finality-stage';
    if (idx <= reachedIdx) stage.classList.add('reached');
    if (idx === reachedIdx) stage.classList.add('current');
    stage.textContent = s.label;
    wrap.appendChild(stage);
    if (idx < states.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'finality-arrow';
      arrow.textContent = '→';
      wrap.appendChild(arrow);
    }
  });
  return wrap;
}
function renderVerificationResult(result) {
  const wrap = document.createElement('div');
  const summary = document.createElement('div');
  summary.className = `verify-summary verify-${result.verified ? 'pass' : 'fail'}`;
  const passed = (result.checks || []).filter((c) => c.passed).length;
  const total = (result.checks || []).length;
  summary.textContent = `${result.verified ? '✓ All passed' : '✗ Failed'} — ${passed}/${total}`;
  wrap.appendChild(summary);
  const list = document.createElement('ul');
  list.className = 'verify-checks';
  for (const c of (result.checks || [])) {
    const li = document.createElement('li');
    li.className = `verify-check verify-${c.passed ? 'pass' : 'fail'}`;
    const m = document.createElement('span');
    m.className = 'verify-mark';
    m.textContent = c.passed ? '✓' : '✗';
    li.appendChild(m);
    const n = document.createElement('span');
    n.className = 'verify-name';
    n.textContent = c.name;
    li.appendChild(n);
    if (c.detail) {
      const d = document.createElement('span');
      d.className = 'verify-detail';
      d.textContent = c.detail;
      li.appendChild(d);
    }
    list.appendChild(li);
  }
  wrap.appendChild(list);
  return wrap;
}
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
}
