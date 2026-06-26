// Nexus — cockpit rails.
//
// Phase 1 builds three context-rail panels and one main-region dock:
//   1. Pending approval queue (rail) — awaiting signature
//   2. Risk rail (rail) — drift / backlog / failure / stale signals
//   3. Verification rail (rail) — recent anchored bundles ready to verify
//   4. Quick compose dock (main) — paste customParams, preview, submit
//
// Every panel reads from the central NexusStore's 'cockpit' slice so
// they all share a single backend round-trip. They render distinct
// state components (loading / hidden / notProduced / unavailable /
// error) when the slice is in any non-visible state.

import {
  rpcWithDisclosure,
  shortHash,
  formatTime,
  jsonBlock,
  emptyState,
  hashChip,
  hiddenNode,
  errorStateNode,
} from '/lib/spineCommon.js';
import { subscribe2, refreshSlice } from '/lib/store.js';
import { severityBadge, sortBySeverity, severityRank } from '/lib/severity.js';
import { renderDossier } from '/lib/dossier.js';
import { onAtChange, isAtLive } from '/lib/timeContext.js';
import { agoLabel } from '/lib/liveness.js';

// =================================================================
// Pending approval queue
// =================================================================
export function createApprovalQueue() {
  const root = document.createElement('section');
  root.className = 'tele-card cockpit-rail cockpit-approvals';

  const head = document.createElement('div');
  head.className = 'tele-head';
  const title = document.createElement('h3');
  title.textContent = 'Awaiting your sign-off';
  head.appendChild(title);
  const count = document.createElement('span');
  count.className = 'cockpit-rail-count';
  count.id = 'approvals-count';
  count.textContent = '0';
  head.appendChild(count);
  const fresh = document.createElement('span');
  fresh.className = 'cockpit-rail-fresh';
  head.appendChild(fresh);
  root.appendChild(head);

  const body = document.createElement('div');
  body.className = 'cockpit-rail-body';
  body.id = 'approvals-body';
  root.appendChild(body);

  const subs = [subscribe2('cockpit', (slice) => render(slice))];

  function render(slice) {
    if (!slice || slice.status === 'loading') {
      body.replaceChildren(skeletonRows(2));
      return;
    }
    // RUNBOOK-03 Task 2 — only show the full error node when there is genuinely
    // no prior data to keep. A kept-stale slice (transient error preserving
    // last-known-good) keeps rendering its data, dimmed + badged "retrying".
    if (slice.status === 'error' && !slice.data) { body.replaceChildren(errorStateNode(slice.error)); return; }
    if (slice.status === 'hidden') { body.replaceChildren(hiddenNode()); return; }
    root.classList.toggle('stale', Boolean(slice.stale));
    setFresh(fresh, slice);
    const data = slice.data || {};
    const items = Array.isArray(data.pendingApprovals) ? data.pendingApprovals : [];
    count.textContent = String(items.length);
    if (items.length === 0) {
      body.replaceChildren(emptyRail('Nothing waiting for your signature.'));
      return;
    }
    body.replaceChildren();
    for (const a of items) {
      // RUNBOOK-02 Task 4a — review the dossier IN PLACE; the irreversible
      // signature still happens on the dedicated #/approve surface (the
      // canonical signing surface), reached via the secondary deep-link below.
      const item = document.createElement('div');
      item.className = 'cockpit-rail-item approval-item';

      const head = document.createElement('div');
      head.className = 'cockpit-rail-row-head';
      const role = document.createElement('span');
      role.className = 'cockpit-rail-row-role';
      role.textContent = a.role || 'role: —';
      head.appendChild(role);
      head.appendChild(severityBadge('attention'));
      item.appendChild(head);

      const id = document.createElement('div');
      id.className = 'cockpit-rail-row-id mono';
      id.textContent = shortHash(a.planId || a.id, 28, 6);
      item.appendChild(id);

      const meta = document.createElement('div');
      meta.className = 'cockpit-rail-row-meta';
      meta.textContent = `signer: ${a.identity || '—'}`;
      item.appendChild(meta);

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
          } catch (err) {
            loaded = false; // allow a retry on the next expand
            panel.replaceChildren(errorStateNode(err));
          }
        }
      });
      item.appendChild(toggle);
      item.appendChild(panel);
      body.appendChild(item);
    }
  }

  return {
    element: root,
    destroy() { for (const u of subs) try { u(); } catch (e) { /* */ } },
  };
}

// =================================================================
// Risk rail
// =================================================================
export function createRiskRail() {
  const root = document.createElement('section');
  root.className = 'tele-card cockpit-rail cockpit-risks';

  const head = document.createElement('div');
  head.className = 'tele-head';
  const title = document.createElement('h3');
  title.textContent = 'Needs attention';
  head.appendChild(title);
  const count = document.createElement('span');
  count.className = 'cockpit-rail-count';
  count.id = 'risks-count';
  count.textContent = '0';
  head.appendChild(count);
  const fresh = document.createElement('span');
  fresh.className = 'cockpit-rail-fresh';
  head.appendChild(fresh);
  root.appendChild(head);

  const body = document.createElement('div');
  body.className = 'cockpit-rail-body';
  body.id = 'risks-body';
  root.appendChild(body);

  const subs = [subscribe2('cockpit', (slice) => render(slice))];

  function render(slice) {
    if (!slice || slice.status === 'loading') {
      body.replaceChildren(skeletonRows(2));
      return;
    }
    if (slice.status === 'error' && !slice.data) { body.replaceChildren(errorStateNode(slice.error)); return; }
    if (slice.status === 'hidden') { body.replaceChildren(hiddenNode()); return; }
    root.classList.toggle('stale', Boolean(slice.stale));
    setFresh(fresh, slice);
    const data = slice.data || {};
    const signals = sortBySeverity(Array.isArray(data.riskSignals) ? data.riskSignals : []);
    count.textContent = String(signals.length);
    if (signals.length === 0) {
      body.replaceChildren(emptyRail('No risks right now. System is healthy.'));
      return;
    }
    body.replaceChildren();
    for (const s of signals) {
      const row = document.createElement('div');
      row.className = `cockpit-rail-row risk-row risk-${s.severity || 'normal'}`;
      const head = document.createElement('div');
      head.className = 'cockpit-rail-row-head';
      const kind = document.createElement('span');
      kind.className = 'cockpit-rail-row-kind';
      kind.textContent = (s.kind || 'signal').replace(/_/g, ' ');
      head.appendChild(kind);
      head.appendChild(severityBadge(s.severity));
      row.appendChild(head);
      const msg = document.createElement('div');
      msg.className = 'cockpit-rail-row-msg';
      msg.textContent = s.message || '';
      row.appendChild(msg);
      if (s.profileId) {
        // NEXUS-REIMAGINED Phase 6: trust-drift risk rows open the
        // govern atlas drilldown for that trust profile so operators
        // can see the full drift impact.
        row.classList.add('govern-clickable');
        row.addEventListener('click', () => {
          window.location.hash = '#/govern/trustProfiles/' + encodeURIComponent(s.profileId);
        });
      }
      body.appendChild(row);
    }
  }

  return {
    element: root,
    destroy() { for (const u of subs) try { u(); } catch (e) { /* */ } },
  };
}

// =================================================================
// Verification rail — anchored bundles ready to verify
// =================================================================
export function createVerificationRail() {
  const root = document.createElement('section');
  root.className = 'tele-card cockpit-rail cockpit-verification';

  const head = document.createElement('div');
  head.className = 'tele-head';
  const title = document.createElement('h3');
  title.textContent = 'Ready to verify';
  head.appendChild(title);
  const count = document.createElement('span');
  count.className = 'cockpit-rail-count';
  count.id = 'verify-count';
  count.textContent = '0';
  head.appendChild(count);
  const fresh = document.createElement('span');
  fresh.className = 'cockpit-rail-fresh';
  head.appendChild(fresh);
  root.appendChild(head);

  const body = document.createElement('div');
  body.className = 'cockpit-rail-body';
  body.id = 'verify-body';
  root.appendChild(body);

  const subs = [subscribe2('cockpit', (slice) => render(slice))];

  function render(slice) {
    if (!slice || slice.status === 'loading') {
      body.replaceChildren(skeletonRows(2));
      return;
    }
    if (slice.status === 'error' && !slice.data) { body.replaceChildren(errorStateNode(slice.error)); return; }
    if (slice.status === 'hidden') { body.replaceChildren(hiddenNode()); return; }
    root.classList.toggle('stale', Boolean(slice.stale));
    setFresh(fresh, slice);
    const data = slice.data || {};
    const tasks = Array.isArray(data.verificationTasks) ? data.verificationTasks : [];
    count.textContent = String(tasks.length);
    if (tasks.length === 0) {
      body.replaceChildren(emptyRail('No completed actions ready to verify yet.'));
      return;
    }
    body.replaceChildren();
    for (const t of tasks) {
      const item = document.createElement('div');
      item.className = 'cockpit-rail-item verify-item';

      const head = document.createElement('div');
      head.className = 'cockpit-rail-row-head';
      const lvl = document.createElement('span');
      lvl.className = 'cockpit-rail-row-kind';
      lvl.textContent = t.level || 'standard';
      head.appendChild(lvl);
      head.appendChild(severityBadge('normal'));
      item.appendChild(head);

      const id = document.createElement('div');
      id.className = 'cockpit-rail-row-id mono';
      id.textContent = shortHash(t.bundleId, 22, 6);
      item.appendChild(id);

      if (t.bundleHash) {
        const hash = document.createElement('div');
        hash.className = 'cockpit-rail-row-meta';
        hash.appendChild(document.createTextNode('hash: '));
        hash.appendChild(hashChip(t.bundleHash, { head: 10, tail: 6 }));
        item.appendChild(hash);
      }

      if (t.bundleId) {
        // RUNBOOK-02 Task 4b — verification is read-only + idempotent, so the
        // 8-check runs fully IN PLACE here; the dedicated reader (#/prove) stays
        // a secondary deep-link for chain-walk + portable export.
        const result = document.createElement('div');
        result.className = 'cockpit-rail-verify-result';
        const run = document.createElement('button');
        run.type = 'button';
        run.className = 'cockpit-rail-expand-toggle';
        run.textContent = 'Run 8-check';
        run.addEventListener('click', async () => {
          run.disabled = true;
          result.replaceChildren(loadingPreview('Verifying…'));
          try {
            const r = await rpcWithDisclosure('evidence.verify', { id: t.bundleId });
            result.replaceChildren(compactVerify(r));
          } catch (err) {
            result.replaceChildren(errorStateNode(err));
          } finally {
            run.disabled = false;
          }
        });
        item.appendChild(run);
        item.appendChild(result);
        const open = document.createElement('a');
        open.className = 'cockpit-rail-deeplink';
        open.href = '#/prove/' + encodeURIComponent(t.bundleId);
        open.textContent = 'Open full verifier →';
        item.appendChild(open);
      } else if (t.intentId) {
        // No bundle yet — nothing to verify in place; keep the single deep-link.
        const open = document.createElement('a');
        open.className = 'cockpit-rail-deeplink';
        open.href = '#/spine/' + encodeURIComponent(t.intentId);
        open.textContent = 'Open intent →';
        item.appendChild(open);
      }

      body.appendChild(item);
    }
  }

  return {
    element: root,
    destroy() { for (const u of subs) try { u(); } catch (e) { /* */ } },
  };
}

// =================================================================
// Quick compose dock — paste customParams, preview, submit
// =================================================================
const GOAL_TYPES = [
  'CONTRACT_CALL',
  'CONTRACT_DEPLOY',
  'OBJECT_CREATE',
  'OBJECT_MUTATE',
  'SETTLEMENT',
  'POLICY_BIND',
  'ROLE_ASSIGN',
  'CAPABILITY_GRANT',
  'SUBSYSTEM_ACTION',
];

// RUNBOOK-02 Task 3 — this raw-JSON quick-compose dock is NO LONGER mounted on
// the Cockpit (the home leads with the spine hero + attention rails; the
// expert paste-JSON path belongs behind the Build/Studio surface). It stays
// exported as the reference preview/submit implementation that the Studio view
// (RUNBOOK-04) consumes behind an "Advanced: paste customParams" disclosure.
// Do NOT re-add it to spine.js.
export function createQuickComposeDock() {
  const root = document.createElement('section');
  root.className = 'cockpit-compose';

  const head = document.createElement('div');
  head.className = 'cockpit-compose-head';
  const title = document.createElement('h2');
  title.className = 'cockpit-compose-title';
  title.textContent = 'Quick action';
  head.appendChild(title);
  const sub = document.createElement('p');
  sub.className = 'cockpit-compose-sub';
  sub.textContent = 'Quick way to send a new action — pick the type, paste the settings, preview the result, then submit. For a guided form with safety checks, open the full Studio.';
  head.appendChild(sub);
  // Link to the full Studio with categorized actions, guided form,
  // and the full preview report.
  const studioLink = document.createElement('a');
  studioLink.className = 'cockpit-compose-studio-link';
  studioLink.href = '#/compose';
  studioLink.textContent = 'Open the full Studio →';
  head.appendChild(studioLink);
  root.appendChild(head);

  const form = document.createElement('div');
  form.className = 'cockpit-compose-form';

  // Goal type select
  const goalWrap = document.createElement('label');
  goalWrap.className = 'cockpit-compose-label';
  goalWrap.appendChild(spanLabel('Goal type'));
  const goalSelect = document.createElement('select');
  goalSelect.className = 'cockpit-compose-select';
  for (const g of GOAL_TYPES) {
    const o = document.createElement('option');
    o.value = g;
    o.textContent = g;
    goalSelect.appendChild(o);
  }
  goalWrap.appendChild(goalSelect);
  form.appendChild(goalWrap);

  // Custom params textarea
  const paramsWrap = document.createElement('label');
  paramsWrap.className = 'cockpit-compose-label cockpit-compose-params';
  paramsWrap.appendChild(spanLabel('customParams (JSON)'));
  const paramsTa = document.createElement('textarea');
  paramsTa.className = 'cockpit-compose-textarea';
  paramsTa.spellcheck = false;
  paramsTa.placeholder = '{ "authority": "acc://test.acme/counter", "function": "increment" }';
  paramsTa.value = '{}';
  paramsWrap.appendChild(paramsTa);
  form.appendChild(paramsWrap);

  // Buttons
  const btnRow = document.createElement('div');
  btnRow.className = 'cockpit-compose-buttons';
  const previewBtn = document.createElement('button');
  previewBtn.type = 'button';
  previewBtn.className = 'verify-btn cockpit-compose-preview';
  previewBtn.textContent = 'Preview plan';
  btnRow.appendChild(previewBtn);
  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'verify-btn cockpit-compose-submit';
  submitBtn.textContent = 'Submit (after preview)';
  submitBtn.disabled = true;
  btnRow.appendChild(submitBtn);
  form.appendChild(btnRow);

  root.appendChild(form);

  // Output panel
  const out = document.createElement('div');
  out.className = 'cockpit-compose-out';
  root.appendChild(out);

  // Preview state — captured between "preview" and "submit"
  let previewedParams = null;

  previewBtn.addEventListener('click', async () => {
    out.replaceChildren(loadingPreview());
    submitBtn.disabled = true;
    let params;
    try { params = JSON.parse(paramsTa.value || '{}'); }
    catch (err) { out.replaceChildren(errorStateNode(new Error('JSON parse: ' + err.message))); return; }
    try {
      // NEXUS-REIMAGINED Phase 2: use the rich dossier projection so
      // the inline preview shows the same depth of safety information
      // the full Intent Studio surfaces — plan hash, approvals/waiver,
      // ghost evidence, plugin selections, trust assumptions, expected
      // evidence, and per-signal risks.
      const dossier = await rpcWithDisclosure('nexus.previewDossier', {
        goalType: goalSelect.value,
        customParams: params,
      });
      previewedParams = { goalType: goalSelect.value, customParams: params };
      const policyDenied = dossier && dossier.policyDecision && dossier.policyDecision.allowed === false;
      const noPlan = !dossier || !dossier.plan;
      submitBtn.disabled = policyDenied || noPlan;
      out.replaceChildren(renderDossier(dossier));
    } catch (err) {
      out.replaceChildren(errorStateNode(err));
    }
  });

  submitBtn.addEventListener('click', async () => {
    if (!previewedParams) return;
    submitBtn.disabled = true;
    out.replaceChildren(loadingPreview('Submitting…'));
    try {
      const result = await rpcWithDisclosure('governed.submit', {
        goalType: previewedParams.goalType,
        customParams: previewedParams.customParams,
      });
      const banner = document.createElement('div');
      banner.className = 'verify-summary verify-pass';
      const intentID = result && result.Intent && result.Intent.ID;
      banner.textContent = intentID ? `✓ Submitted as ${intentID}` : '✓ Submitted.';
      out.replaceChildren(banner);
      // Navigate to the new intent's narrative
      if (intentID) setTimeout(() => { window.location.hash = '#/spine/' + encodeURIComponent(intentID); }, 600);
      // Force an immediate refresh of the cockpit slice so the new
      // intent appears in active intents + spine counts.
      refreshSlice('cockpit');
      refreshSlice('recentIntents');
    } catch (err) {
      out.replaceChildren(errorStateNode(err));
      submitBtn.disabled = false;
    }
  });

  return { element: root };
}

function renderPreviewResult(r) {
  const wrap = document.createElement('div');
  if (!r) {
    wrap.appendChild(emptyRail('No preview result.'));
    return wrap;
  }
  // The IntentResult shape carries Plan / Receipt / Error / Intent.
  if (r.Error) {
    wrap.appendChild(errorStateNode(new Error(r.Error)));
    return wrap;
  }
  const summary = document.createElement('div');
  summary.className = 'verify-summary verify-pass';
  summary.textContent = '✓ Plan compiled successfully.';
  wrap.appendChild(summary);

  if (r.Plan) {
    const meta = document.createElement('div');
    meta.className = 'cockpit-compose-out-meta';
    meta.appendChild(metaRow('Plan ID',     r.Plan.ID || '—'));
    meta.appendChild(metaRow('Steps',       (r.Plan.Steps || []).length));
    meta.appendChild(metaRow('Total gas',   r.Plan.TotalGasEstimate || 0));
    meta.appendChild(metaRow('Approvals',   (r.Plan.RequiredApprovals || []).length));
    meta.appendChild(metaRow('Drift threshold', r.Plan.DriftThreshold || '—'));
    wrap.appendChild(meta);
  }

  const details = document.createElement('details');
  details.className = 'raw-details';
  const sum = document.createElement('summary');
  sum.textContent = 'Raw preview result';
  details.appendChild(sum);
  details.appendChild(jsonBlock(r));
  wrap.appendChild(details);

  return wrap;
}

function metaRow(label, value) {
  const row = document.createElement('div');
  row.className = 'cockpit-compose-meta-row';
  const l = document.createElement('span');
  l.className = 'cockpit-compose-meta-label';
  l.textContent = label;
  row.appendChild(l);
  const v = document.createElement('span');
  v.className = 'cockpit-compose-meta-value mono';
  v.textContent = String(value);
  row.appendChild(v);
  return row;
}

// =================================================================
// Helpers
// =================================================================
function spanLabel(text) {
  const s = document.createElement('span');
  s.textContent = text;
  return s;
}
function emptyRail(msg) {
  const d = document.createElement('div');
  d.className = 'cockpit-rail-empty';
  d.textContent = msg;
  return d;
}
function skeletonRows(n) {
  const wrap = document.createElement('div');
  for (let i = 0; i < n; i++) {
    const row = document.createElement('div');
    row.className = 'cockpit-rail-skeleton';
    wrap.appendChild(row);
  }
  return wrap;
}
function loadingPreview(label = 'Compiling preview…') {
  const d = document.createElement('div');
  d.className = 'cockpit-compose-out-loading';
  d.textContent = label;
  return d;
}
// RUNBOOK-02 Task 4b — compact pass/fail line for the in-place verify rail. The
// full per-check list lives on the dedicated #/prove reader (deep-linked). Reads
// the same { verified, checks:[{passed}] } shape evidence.verify returns.
function compactVerify(result) {
  const checks = (result && result.checks) || [];
  const passed = checks.filter((c) => c.passed).length;
  const total = checks.length;
  const d = document.createElement('div');
  const ok = !!(result && result.verified);
  d.className = 'cockpit-verify-summary verify-' + (ok ? 'pass' : 'fail');
  d.setAttribute('role', 'status');
  d.textContent = ok
    ? `✓ Verified — ${passed}/${total} checks passed`
    : `✗ Failed — ${total - passed}/${total} checks failed`;
  return d;
}

// RUNBOOK-03 Task 2 — paint a rail's "updated Ns ago" badge from the slice's
// fetchedAt (the last GOOD fetch, preserved across transient errors) and tag it
// "retrying" while stale. data-at lets the shared ticker advance it each second.
function setFresh(el, slice) {
  if (!el) return;
  const at = slice && slice.fetchedAt ? slice.fetchedAt : 0;
  el.dataset.at = String(at);
  if (slice && slice.stale) el.dataset.stale = '1'; else delete el.dataset.stale;
  el.textContent = at
    ? 'updated ' + agoLabel(at) + (slice && slice.stale ? ' · retrying' : '')
    : '';
}

// One module-level ticker advances every mounted rail badge once a second so the
// relative label stays honest between polls. A no-op when no badges are mounted
// or the tab is hidden (no always-on cost when the cockpit isn't visible).
if (typeof document !== 'undefined' && typeof setInterval === 'function') {
  setInterval(() => {
    if (document.hidden) return;
    const badges = document.querySelectorAll('.cockpit-rail-fresh[data-at]');
    for (const el of badges) {
      const at = Number(el.dataset.at) || 0;
      if (!at) continue;
      el.textContent = 'updated ' + agoLabel(at) + (el.dataset.stale ? ' · retrying' : '');
    }
  }, 1000);
}

// =================================================================
// Drafts rail — Cinema-Inbox-Time E2C6
// =================================================================
// The drafts rail shows the operator's in-flight Intent Studio drafts
// (nexus.draftList) so they can resume composing without rediscovery.
// It also fires nexus.inbox in parallel so the rail counter doubles as
// an "inbox unread" probe that the header badge can mirror.
export function createDraftsRail({ pollMs = 30000 } = {}) {
  const root = document.createElement('section');
  root.className = 'tele-card cockpit-rail cockpit-drafts';

  const head = document.createElement('div');
  head.className = 'tele-head';
  const title = document.createElement('h3');
  title.textContent = 'Your drafts';
  head.appendChild(title);
  const count = document.createElement('span');
  count.className = 'cockpit-rail-count';
  count.id = 'drafts-count';
  count.textContent = '0';
  head.appendChild(count);
  root.appendChild(head);

  const body = document.createElement('div');
  body.className = 'cockpit-rail-body';
  body.id = 'drafts-body';
  body.appendChild(skeletonRows(2));
  root.appendChild(body);

  // RUNBOOK-02 Task 3 — the single primary compose CTA on the Cockpit. Targets
  // the Build surface (#/compose); doubles as "resume a draft / start a new one".
  const composeNew = document.createElement('a');
  composeNew.className = 'cockpit-rail-footer-link';
  composeNew.href = '#/compose';
  composeNew.textContent = 'New action →';
  root.appendChild(composeNew);

  let timer = null;
  async function refresh() {
    try {
      const r = await rpcWithDisclosure('nexus.draftList', { limit: 25 });
      const drafts = (r && r.drafts) || [];
      count.textContent = String(drafts.length);
      body.replaceChildren();
      if (drafts.length === 0) {
        body.appendChild(emptyRail('No drafts. Start a new action to begin.'));
        return;
      }
      for (const d of drafts) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'cockpit-rail-row drafts-row';
        row.addEventListener('click', () => {
          window.location.hash = '#/compose/' + encodeURIComponent(d.goalType || '') + '/draft/' + encodeURIComponent(d.id);
        });
        const h = document.createElement('div');
        h.className = 'cockpit-rail-row-head';
        const goal = document.createElement('span');
        goal.className = 'cockpit-rail-row-role';
        goal.textContent = d.goalType || '(unset)';
        h.appendChild(goal);
        const ts = document.createElement('span');
        ts.className = 'cockpit-rail-row-time';
        ts.textContent = formatTime(d.autoSavedAt || d.updatedAt || d.createdAt || '');
        h.appendChild(ts);
        row.appendChild(h);
        if (d.title) {
          const t = document.createElement('div');
          t.className = 'cockpit-rail-row-meta';
          t.textContent = d.title;
          row.appendChild(t);
        }
        body.appendChild(row);
      }
    } catch (e) {
      body.replaceChildren(errorStateNode(e));
    }
  }

  let atUnsub = null;
  function start() {
    refresh();
    timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      // Cinema-Inbox-Time E3C6 — past snapshots don't change; skip
      // polling and just refresh on coordinate transitions.
      if (!isAtLive()) return;
      refresh();
    }, pollMs);
    atUnsub = onAtChange(() => refresh());
  }
  start();

  return {
    element: root,
    destroy() {
      if (timer) clearInterval(timer);
      timer = null;
      if (atUnsub) { try { atUnsub(); } catch (_) {} atUnsub = null; }
    },
  };
}

// =================================================================
// Header inbox badge — Cinema-Inbox-Time E2C6
// =================================================================
// Mounts on the span#headerInboxBadge that index.html reserves inside
// the Inbox workspace nav link, then polls nexus.inbox so the unread
// counter is always current. Two-state: hidden when zero, visible with
// a count otherwise. Returns a destroy() handle so the SPA can unwind
// the interval when the page is closed.
export function startHeaderInboxBadge({ pollMs = 15000 } = {}) {
  const el = document.getElementById('headerInboxBadge');
  if (!el) return { destroy() {} };
  let timer = null;
  async function refresh() {
    try {
      const r = await rpcWithDisclosure('nexus.inbox', { limit: 1 });
      const unread = (r && (r.approvalsCount || 0) + (r.mentionsCount || 0) + (r.handoffsCount || 0)) || 0;
      if (unread > 0) {
        el.textContent = unread > 99 ? '99+' : String(unread);
        el.hidden = false;
      } else {
        el.hidden = true;
        el.textContent = '';
      }
    } catch (_) {
      // Quiet on failure — the badge is decorative; do not flash.
    }
  }
  refresh();
  timer = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    // Cinema-Inbox-Time E3C6 — the badge represents unread counts at
    // the cursor; when frozen, fetch only on cursor transitions.
    if (!isAtLive()) return;
    refresh();
  }, pollMs);
  const atUnsub = onAtChange(() => refresh());
  return {
    refresh,
    destroy() {
      if (timer) clearInterval(timer);
      timer = null;
      try { atUnsub(); } catch (_) {}
    },
  };
}
