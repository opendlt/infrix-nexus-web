// RUNBOOK-07 SP4 — authority blast-radius / what-if simulator.
//
// Two surfaces:
//   1. Governance drawers (trust / capability / role): "What if I revoke /
//      expire / degrade this?" → the breaking set of approvals + in-flight
//      intents (computeBlastRadius), with a "highlight on graph" toggle. Trust
//      degrade is EXACT (server-provided); capability/role are DERIVED and
//      badged "estimated".
//   2. Submit flow (POLICY_*): the allow/deny DELTA from policy.simulate, gating
//      Submit on net-new denials. The flip classification is pure + tested.

import { computeBlastRadius, blastHeadline } from '/lib/blastRadius.js';
import { rpcWithDisclosure } from '/lib/spineCommon.js';

const MUTATION_FOR_KIND = {
  trust: { mutation: 'degrade_trust', verb: 'degrade this trust profile' },
  capability: { mutation: 'revoke_capability', verb: 'revoke this capability' },
  role: { mutation: 'expire_role', verb: 'let this role expire' },
};

/**
 * mountWhatIf(host, { kind, node, onHighlight }) — append a what-if section for a
 * governance drawer. `onHighlight(ids|null)` lights/clears the atlas highlight.
 * For trust it projects immediately (exact); for capability/role it lazily
 * fetches the atlas on demand (the breaking set needs the full approval list).
 */
export function mountWhatIf(host, { kind, node, onHighlight } = {}) {
  const spec = MUTATION_FOR_KIND[kind];
  if (!spec || !node) return;

  const sec = document.createElement('section');
  sec.className = 'whatif-panel';
  const head = document.createElement('div');
  head.className = 'whatif-head';
  head.textContent = `What if I ${spec.verb}?`;
  sec.appendChild(head);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'whatif-run verify-btn';
  btn.textContent = 'Show blast radius';
  sec.appendChild(btn);

  const out = document.createElement('div');
  out.className = 'whatif-out';
  sec.appendChild(out);

  let highlighted = false;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    out.textContent = 'Computing…';
    try {
      let result;
      if (spec.mutation === 'degrade_trust') {
        result = computeBlastRadius({}, node, spec.mutation);            // exact, server-provided
      } else {
        const atlas = await rpcWithDisclosure('nexus.governAtlas', { limit: 500 }).catch(() => ({}));
        result = computeBlastRadius(atlas, node, spec.mutation);         // derived
      }
      out.replaceChildren(renderBlast(result, onHighlight, () => highlighted, (v) => { highlighted = v; }));
    } catch (e) {
      out.textContent = 'Could not compute the blast radius.';
    } finally {
      btn.disabled = false;
    }
  });

  host.appendChild(sec);
  return sec;
}

function renderBlast(result, onHighlight, getHi, setHi) {
  const wrap = document.createElement('div');

  const headline = document.createElement('p');
  headline.className = 'whatif-headline';
  headline.textContent = blastHeadline(result);
  wrap.appendChild(headline);

  const badge = document.createElement('span');
  badge.className = 'whatif-source whatif-source-' + result.source;
  badge.textContent = result.source === 'server' ? 'exact (server-computed)' : 'estimated (derived from the authority graph)';
  wrap.appendChild(badge);

  const breaking = result.approvals.filter((a) => a.breaks);
  if (breaking.length) {
    const ul = document.createElement('ul');
    ul.className = 'whatif-list';
    for (const a of breaking) {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = a.planId ? '#/govern/approvals/' + encodeURIComponent(a.planId) : '#/govern/approvals';
      link.textContent = `approval on ${a.planId || '?'}${a.role ? ' (role ' + a.role + ')' : ''}`;
      li.appendChild(link);
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  }
  if (result.intents.length) {
    const ul = document.createElement('ul');
    ul.className = 'whatif-list whatif-intents';
    for (const it of result.intents) {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = '#/spine/' + encodeURIComponent(it.id || '');
      link.textContent = `in-flight intent ${it.id || '?'}`;
      li.appendChild(link);
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  }

  if (typeof onHighlight === 'function' && result.highlightIds && result.highlightIds.size) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'whatif-highlight';
    const ids = [...result.highlightIds];
    const sync = () => { toggle.textContent = getHi() ? 'Clear highlight' : `Highlight ${ids.length} on graph`; toggle.setAttribute('aria-pressed', getHi() ? 'true' : 'false'); };
    toggle.addEventListener('click', () => {
      setHi(!getHi());
      onHighlight(getHi() ? ids : null);
      sync();
    });
    sync();
    wrap.appendChild(toggle);
  }
  return wrap;
}

// ---- POLICY_* allow/deny delta (submit flow) ----

// classifyPolicyFlips(before, after) — pure. before/after are arrays of
// decisions {id, allowed} (or {intentId, allowed}). Returns the intents whose
// decision flipped allow↔deny.
export function classifyPolicyFlips(before, after) {
  const beforeMap = decisionMap(before);
  const afterMap = decisionMap(after);
  const newlyDenied = [];
  const newlyAllowed = [];
  for (const [id, aAllowed] of afterMap) {
    const bAllowed = beforeMap.has(id) ? beforeMap.get(id) : true;   // unknown-before defaults to allowed
    if (bAllowed !== false && aAllowed === false) newlyDenied.push(id);
    if (bAllowed === false && aAllowed !== false) newlyAllowed.push(id);
  }
  return { newlyDenied, newlyAllowed, netDeny: newlyDenied.length > newlyAllowed.length };
}

function decisionMap(arr) {
  const m = new Map();
  for (const d of (Array.isArray(arr) ? arr : (arr && (arr.decisions || arr.Decisions)) || [])) {
    const id = d.intentId || d.IntentID || d.id || d.ID;
    if (id != null) m.set(String(id), d.allowed !== undefined ? d.allowed : d.Allowed);
  }
  return m;
}

/** policyDeltaGatesSubmit — Submit stays blocked while there is a net-new denial. */
export function policyDeltaGatesSubmit(flips) {
  return !!(flips && flips.newlyDenied && flips.newlyDenied.length > 0);
}

/**
 * simulatePolicyDelta({ goalType, customParams, currentDecisions }, { rpc }) →
 * { flips, before, after }. Calls policy.simulate for the proposed change and
 * classifies the flips vs the current decisions. `rpc` is injectable for tests.
 */
export async function simulatePolicyDelta(params, { rpc } = {}) {
  const call = rpc || rpcWithDisclosure;
  const res = await call('policy.simulate', {
    goalType: params.goalType,
    customParams: params.customParams,
  });
  const after = (res && (res.decisions || res.Decisions || res.results)) || [];
  const before = params.currentDecisions || [];
  return { flips: classifyPolicyFlips(before, after), before, after };
}

/**
 * mountPolicyDelta(out, { goalType, customParams, dossier }) — async helper for
 * the submit preview flows. Calls policy.simulate, appends the allow/deny delta
 * to `out`, and gates the dossier's Submit button on net-new denials (an
 * acknowledge checkbox re-enables it, mirroring the consequence-confirm idiom).
 * Best-effort: if policy.simulate is unavailable it appends nothing and leaves
 * the existing policyDecision gate untouched.
 */
export async function mountPolicyDelta(out, { goalType, customParams, dossier } = {}) {
  let flips;
  try {
    const current = (dossier && dossier.policyDecision && (dossier.policyDecision.decisions || [])) || [];
    const r = await simulatePolicyDelta({ goalType, customParams, currentDecisions: current });
    flips = r.flips;
  } catch (_) {
    return; // policy.simulate not reachable → leave the existing gate as-is
  }
  if (!out || !out.appendChild) return;
  const panel = document.createElement('section');
  panel.className = 'policy-delta-panel';
  panel.appendChild(renderPolicyDeltaTable(flips));

  if (policyDeltaGatesSubmit(flips)) {
    const submitBtn = out.querySelector('.dossier-submit-btn');
    if (submitBtn && !submitBtn.disabled) {
      submitBtn.disabled = true;
      const ack = document.createElement('label');
      ack.className = 'policy-delta-ack';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.addEventListener('change', () => { submitBtn.disabled = !box.checked; });
      ack.appendChild(box);
      ack.appendChild(document.createTextNode(' I understand this change newly denies ' + flips.newlyDenied.length + ' intent(s) and want to proceed.'));
      panel.appendChild(ack);
    }
  }
  out.appendChild(panel);
}

/** renderPolicyDeltaTable(flips) → HTMLElement for the submit preview. */
export function renderPolicyDeltaTable(flips) {
  const wrap = document.createElement('div');
  wrap.className = 'policy-delta';
  const line = document.createElement('p');
  line.className = 'policy-delta-line';
  line.textContent = `This policy change would newly deny ${flips.newlyDenied.length} intent${flips.newlyDenied.length === 1 ? '' : 's'}; newly allow ${flips.newlyAllowed.length}.`;
  wrap.appendChild(line);
  if (flips.newlyDenied.length) {
    const ul = document.createElement('ul');
    ul.className = 'policy-delta-denied';
    for (const id of flips.newlyDenied) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#/spine/' + encodeURIComponent(id);
      a.textContent = id;
      li.appendChild(a);
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  }
  return wrap;
}
