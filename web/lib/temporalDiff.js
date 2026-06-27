// RUNBOOK-07 SP2 — temporal diff engine.
//
// Pure: no DOM, no RPC. Given two BoardSnapshots (from timeSnapshot.js) at block
// A (earlier) and block B (later), produce a typed, stage-ordered list of deltas
// — new intents, intents that advanced, a policy that began denying, approvals
// invalidated by trust degradation, an anchor that finalized, a trust profile
// that degraded. Each delta carries enough to deep-link and (for the policy
// case) a causal ref for SP3.

// Spine stage order — deltas sort by this so the story reads intent → anchor.
const STAGE_ORDER = ['intent', 'plan', 'approval', 'execution', 'outcome', 'evidence', 'anchor'];
const KIND_STAGE = {
  intent_created: 'intent',
  intent_advanced: 'plan',
  intent_state: 'plan',
  policy_now_denies: 'approval',
  approvals_invalidated: 'approval',
  trust_degraded: 'approval',
  anchor_finalized: 'anchor',
};

const D = (kind, payload) => ({ kind, stage: KIND_STAGE[kind] || 'intent', ...payload });

function asMap(m) {
  if (m instanceof Map) return m;
  // Tolerate a plain object {id: rec} for fixtures/tests.
  const out = new Map();
  for (const k of Object.keys(m || {})) out.set(k, m[k]);
  return out;
}

/**
 * diffSnapshots(a, b) → Delta[]  (a = earlier, b = later)
 * Deterministic and stage-ordered.
 */
export function diffSnapshots(a, b) {
  if (!a || !b) return [];
  const ai = asMap(a.intents), bi = asMap(b.intents);
  const at = asMap(a.trust), bt = asMap(b.trust);
  const deltas = [];

  for (const [id, B] of bi) {
    const A = ai.get(id);

    // 1. Intent born.
    if (!A) { deltas.push(D('intent_created', { id, stage: B.stage, ref: '#/spine/' + id })); continue; }

    // Intent advanced / changed state.
    if (A.stage !== B.stage) deltas.push(D('intent_advanced', { id, from: A.stage, to: B.stage, ref: '#/spine/' + id }));
    if (A.state !== B.state) deltas.push(D('intent_state', { id, from: A.state, to: B.state, ref: '#/spine/' + id }));

    // 2. Policy began denying this intent (allowed was not-false → now false).
    const aAllow = A.policyDecision ? A.policyDecision.allowed : undefined;
    const bAllow = B.policyDecision ? B.policyDecision.allowed : undefined;
    if (aAllow !== false && bAllow === false) {
      deltas.push(D('policy_now_denies', {
        id,
        denials: (B.policyDecision && B.policyDecision.denials) || [],
        causal: B,                          // SP3 causal-walk ref
        ref: '#/spine/' + id,
      }));
    }

    // 3. Approvals invalidated (trust degradation downstream).
    const aInval = (A.approvals && A.approvals.invalidated) || 0;
    const bInval = (B.approvals && B.approvals.invalidated) || 0;
    if (bInval > aInval) {
      deltas.push(D('approvals_invalidated', { id, count: bInval - aInval, ref: '#/spine/' + id }));
    }

    // 4. Anchor finalized between A and B.
    const aAnchored = A.anchor && A.anchor.status === 'anchored';
    const bAnchored = B.anchor && B.anchor.status === 'anchored';
    if (!aAnchored && bAnchored) {
      deltas.push(D('anchor_finalized', {
        id, txHash: B.anchor.txHash, block: B.anchor.blockHeight,
        ref: B.anchor.recordId ? '#/anchors/' + B.anchor.recordId : '#/spine/' + id,
      }));
    }
  }

  // 5. Trust profiles that degraded between A and B.
  for (const [pid, B] of bt) {
    const A = at.get(pid);
    const aState = (A && A.state) || 'active';
    if (aState === 'active' && B.state && B.state !== 'active') {
      deltas.push(D('trust_degraded', {
        pid, to: B.state, invalidated: B.driftImpactCount || 0,
        ref: '#/govern/trustProfiles/' + pid,
      }));
    }
  }

  return sortByStage(deltas);
}

function sortByStage(deltas) {
  return deltas
    .map((d, i) => ({ d, i }))
    .sort((x, y) => {
      const sx = STAGE_ORDER.indexOf(x.d.stage), sy = STAGE_ORDER.indexOf(y.d.stage);
      if (sx !== sy) return sx - sy;
      return x.i - y.i;                      // stable within a stage
    })
    .map((w) => w.d);
}

// Plain-language one-liner for a delta (used by the diff view + tests).
export function describeDelta(d) {
  switch (d.kind) {
    case 'intent_created':       return `New intent ${short(d.id)} entered at stage ${d.stage}`;
    case 'intent_advanced':      return `Intent ${short(d.id)} advanced ${d.from} → ${d.to}`;
    case 'intent_state':         return `Intent ${short(d.id)} changed state ${d.from} → ${d.to}`;
    case 'policy_now_denies':    return `Policy began denying intent ${short(d.id)}`;
    case 'approvals_invalidated':return `${d.count} approval${d.count === 1 ? '' : 's'} invalidated on ${short(d.id)}`;
    case 'anchor_finalized':     return `Anchor finalized for ${short(d.id)} at block ${d.block || '?'}`;
    case 'trust_degraded':       return `Trust profile ${short(d.pid)} degraded → ${d.to} (invalidated ${d.invalidated})`;
    default:                     return d.kind;
  }
}

function short(s) {
  s = String(s || '');
  return s.length <= 16 ? s : s.slice(0, 10) + '…' + s.slice(-4);
}

// Severity mapping for the diff rows (reuses the severity vocabulary keys).
export function deltaSeverity(d) {
  switch (d.kind) {
    case 'policy_now_denies':
    case 'trust_degraded':       return 'blocked';
    case 'approvals_invalidated':return 'attention';
    case 'anchor_finalized':     return 'normal';
    default:                     return 'normal';
  }
}
