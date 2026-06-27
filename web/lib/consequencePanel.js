// RUNBOOK-07 SP6 — pre-action consequence panel.
//
// Moves explainSignature (identity.js) out of the fixture-only Identity viewer
// into the LIVE approve + submit flows. It builds the explainSignature request
// from the REAL plan/dossier those flows already fetch (never from the
// /testdata fixture), renders "what this does / irreversible / funds move / data
// disclosed / expected proof", and emits a single risk badge.
//
// explainSignature is pure and fails closed ({error}); we render "cannot
// preview" rather than a blank panel in that case.

import { explainSignature } from '/lib/identity.js';

// Best-effort network inference when the dossier doesn't carry one.
function inferNetwork() {
  try {
    const host = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
    if (/localhost|127\.0\.0\.1|^$/.test(host)) return 'local';
  } catch (_) { /* no window */ }
  return 'local';
}

/**
 * consequenceFromDossier(dossier, opts) → { explanation, badge }
 * Pure given its inputs (explainSignature is pure). `dossier` is the live
 * approval/preview dossier; `opts.agentInitiated` flags AI-initiated requests.
 */
export function consequenceFromDossier(dossier, { agentInitiated = false } = {}) {
  const d = dossier || {};
  const plan = d.plan || (d.response && d.response.plan) || {};
  const scope = d.scope || plan.scope || {};
  const req = {
    goalType: d.goalType || plan.goalType,
    signer: d.signerKeyPage || d.requiredKeyPage || plan.signer
      || (d.remaining && d.remaining[0] && d.remaining[0].keyPage)
      || (d.requiredRoles && d.requiredRoles[0]),
    signerVersion: d.signerVersion || plan.signerVersion,
    network: d.network || plan.network || inferNetwork(),
    sourceAssets: plan.sourceAssets || scope.sourceAssets || [],
    targetAssets: plan.targetAssets || scope.targetAssets || [],
    disclosesData: !!(plan.disclosesData || d.disclosesData),
    agentInitiated: agentInitiated || !!d.agentInitiated,
    action: plan.summary || plan.action || undefined,
    customType: plan.customType || d.customType,
  };
  const explanation = explainSignature(req);
  return { explanation, badge: riskBadge(explanation) };
}

/** Map an explanation to a single risk badge ({level, text}). */
export function riskBadge(ex) {
  if (!ex || ex.error) return { level: 'unknown', text: 'cannot preview consequences' };
  const warns = ex.warnings || [];
  if (warns.some((w) => /MAINNET|funds are real/i.test(w)) || (ex.fundsOrCreditsMove && /mainnet/i.test(ex.network || ''))) {
    return { level: 'high', text: 'irreversible · funds move' };
  }
  if (ex.fundsOrCreditsMove || ex.dataDisclosed) return { level: 'medium', text: 'state change' };
  return { level: 'low', text: 'offline proof · no network state' };
}

// ---- rendering (DOM; not exercised by the pure test) ----

const BADGE_LABEL = { high: 'High risk', medium: 'Caution', low: 'Low risk', unknown: 'Unknown' };

/**
 * renderConsequencePanel(dossier, opts) → HTMLElement
 * A compact card: risk badge + the four consequence bullets + irreversible /
 * warning lists. Fails closed to a "cannot preview" card.
 */
export function renderConsequencePanel(dossier, opts = {}) {
  const { explanation: ex, badge } = consequenceFromDossier(dossier, opts);
  const card = document.createElement('section');
  card.className = 'consequence-panel sp6-consequence';

  const head = document.createElement('div');
  head.className = 'consequence-head';
  const b = document.createElement('span');
  b.className = 'consequence-badge consequence-' + badge.level;
  b.textContent = `${BADGE_LABEL[badge.level] || badge.level} — ${badge.text}`;
  head.appendChild(b);
  card.appendChild(head);

  if (ex.error) {
    const p = document.createElement('p');
    p.className = 'consequence-error';
    p.textContent = 'Cannot preview consequences from this dossier — review the raw plan before acting. (' + ex.error + ')';
    card.appendChild(p);
    return card;
  }

  const bullets = document.createElement('ul');
  bullets.className = 'consequence-bullets';
  bullets.appendChild(li('What this does', ex.action || '—'));
  bullets.appendChild(li('Network', ex.network));
  bullets.appendChild(li('Moves funds/credits', ex.fundsOrCreditsMove ? 'yes' : 'no'));
  bullets.appendChild(li('Discloses data', ex.dataDisclosed ? 'yes' : 'no'));
  bullets.appendChild(li('Expected proof', ex.expectedProof || '—'));
  card.appendChild(bullets);

  if ((ex.irreversibleEffects || []).length) {
    card.appendChild(listBlock('Irreversible', ex.irreversibleEffects));
  }
  if ((ex.warnings || []).length) {
    card.appendChild(listBlock('Warnings', ex.warnings, 'consequence-warn'));
  }
  return card;
}

function li(k, v) {
  const el = document.createElement('li');
  const key = document.createElement('span'); key.className = 'consequence-k'; key.textContent = k;
  const val = document.createElement('span'); val.className = 'consequence-v'; val.textContent = String(v);
  el.appendChild(key); el.appendChild(val);
  return el;
}
function listBlock(title, items, cls) {
  const wrap = document.createElement('div');
  wrap.className = 'consequence-list ' + (cls || '');
  const h = document.createElement('div'); h.className = 'consequence-list-title'; h.textContent = title;
  wrap.appendChild(h);
  const ul = document.createElement('ul');
  for (const it of items) { const li = document.createElement('li'); li.textContent = it; ul.appendChild(li); }
  wrap.appendChild(ul);
  return wrap;
}
