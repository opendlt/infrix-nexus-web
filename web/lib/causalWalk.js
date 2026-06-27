// RUNBOOK-07 SP3 — causal "why" walk.
//
// Pure assembler (no DOM, no RPC). Given a narrative snapshot (the same cache
// store.js/narrative.js already hold: { intent, outcome, policies, anchorChain,
// ... }), assemble the cause chain behind a FAILED outcome:
//
//   outcome failed → compensation stage → policy denied → trust drift → block
//
// Returns null when the outcome did not fail (nothing to explain). Honest about
// gaps: a hop that is hidden/notProduced is marked, and the chain's confidence
// drops to 'partial' rather than fabricating a value.

// Read a field tolerating camelCase and Go PascalCase (the RPC layer mixes them).
function rf(obj, name) {
  if (!obj) return undefined;
  if (obj[name] != null) return obj[name];
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  if (obj[cap] != null) return obj[cap];
  const low = name.charAt(0).toLowerCase() + name.slice(1);
  return obj[low];
}

/**
 * buildCausalChain(snapshot) → { root, links[], confidence } | null
 */
export function buildCausalChain(s) {
  if (!s) return null;
  const oc = s.outcome;
  const status = String(rf(oc, 'overallStatus') || '').toLowerCase();
  if (!oc || status !== 'failed') return null;      // only explain failures

  const intentId = (s.intent && (rf(s.intent, 'id') || s.intent.ID || rf(s.intent, 'intentId'))) || s.intentId || '';
  const links = [{
    kind: 'outcome', id: intentId, status: 'failed',
    detail: rf(oc, 'failureReason') || rf(oc, 'failureDetail') || 'outcome did not complete successfully',
    ref: '#/spine/' + intentId,
  }];

  // 1. The compensation stage that fired (or failed to fire).
  const steps = rf(oc, 'stepOutcomes') || rf(oc, 'StepOutcomes') || [];
  const comp = (Array.isArray(steps) ? steps : []).find((st) => /compensat/i.test(rf(st, 'kind') || rf(st, 'stage') || rf(st, 'name') || ''));
  if (comp) {
    links.push({
      kind: 'compensation',
      stageId: rf(comp, 'id') || rf(comp, 'stageId'),
      status: rf(comp, 'status'),
      detail: rf(comp, 'detail') || rf(comp, 'reason') || '',
    });
  }

  // 2. The policy denial that caused the failure.
  const denial = pickDenial(s.policies);
  let denialHidden = false;
  if (denial) {
    links.push({
      kind: 'policy', policyId: denial.policyId, decision: 'denied',
      rule: denial.rule, reason: denial.reason,
      ref: '#/govern/policies/' + (denial.policyId || ''),
    });
  } else if (isRedacted(s.policies)) {
    denialHidden = true;
    links.push({ kind: 'policy', _hidden: true, decision: 'redacted',
      detail: 'cause redacted by disclosure', ref: '#/govern/policies' });
  }

  // 3. Trust drift behind the policy denial (lazy: resolved on expand).
  if (denial && denial.trustProfileId) {
    links.push({
      kind: 'trust', profileId: denial.trustProfileId, state: 'degraded', _lazy: true,
      ref: '#/govern/trustProfiles/' + denial.trustProfileId,
    });
  }

  // 4. Terminal block from the anchor chain (deepest known block).
  const chain = s.anchorChain;
  const chainLinks = (chain && (rf(chain, 'links') || rf(chain, 'Links'))) || [];
  const tail = Array.isArray(chainLinks) && chainLinks.length ? chainLinks[chainLinks.length - 1] : null;
  if (tail) {
    links.push({
      kind: 'block',
      block: rf(tail, 'blockHeight') || rf(tail, 'block'),
      txHash: rf(tail, 'txHash') || rf(tail, 'txid'),
      ref: '#/anchors/' + (rf(tail, 'recordId') || ''),
    });
  }

  const confidence = (links.some((l) => l._hidden) || denialHidden) ? 'partial' : 'derived';
  return { root: 'outcome', links, confidence };
}

// pickDenial — walk the policyDecisionTrace and return the first allowed===false
// decision, surfacing policyId / rule / reason / trustProfileId.
export function pickDenial(policies) {
  if (!policies) return null;
  const arr = Array.isArray(policies)
    ? policies
    : (rf(policies, 'decisions') || rf(policies, 'policies') || rf(policies, 'trace') || []);
  for (const d of (Array.isArray(arr) ? arr : [])) {
    if (rf(d, 'allowed') === false) {
      return {
        policyId: rf(d, 'policyId') || d.PolicyID || rf(d, 'id') || d.ID,
        rule: rf(d, 'rule') || rf(d, 'matchedRule'),
        reason: rf(d, 'reason') || rf(d, 'message'),
        trustProfileId: rf(d, 'trustProfileId') || d.TrustProfileID || rf(d, 'profileId') || d.ProfileID,
      };
    }
  }
  return null;
}

// isRedacted — did the policy trace come back hidden/notProduced rather than a
// real (allow-only) trace? Used to render an honest "redacted" hop.
function isRedacted(policies) {
  if (!policies) return false;
  const st = rf(policies, 'status') || rf(policies, 'state');
  return st === 'hidden' || st === 'notProduced' || st === 'redacted';
}
