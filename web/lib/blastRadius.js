// RUNBOOK-07 SP4 — authority blast-radius projection.
//
// Pure (no DOM, no RPC). Given the atlas graph and a governance node, project
// which pending approvals + in-flight intents break under a hypothetical
// mutation. Three mutations:
//   - degrade_trust    → EXACT: the server already computed dependentApprovals.
//   - revoke_capability→ DERIVED: walk the atlas authority paths (estimated).
//   - expire_role      → DERIVED: approvals signed under the role become
//                        unsatisfiable (estimated).
//
// `source` is 'server' (exact) only for degrade_trust; otherwise 'derived'
// (estimated) — the UI must badge derived results honestly.

const idOf = (n) => (n && (n.id ?? n.ID ?? n.recordId ?? n.planId)) || undefined;

/**
 * computeBlastRadius(atlas, node, mutation) →
 *   { approvals:[{planId,role,breaks}], intents:[{id}], highlightIds:Set, source }
 */
export function computeBlastRadius(atlas, node, mutation) {
  atlas = atlas || {};
  node = node || {};
  const approvals = [];
  const intents = [];
  const highlightIds = new Set();
  const self = idOf(node);
  if (self) highlightIds.add(self);

  if (mutation === 'degrade_trust') {
    // The server already told us exactly which approvals depend on this profile.
    for (const a of (node.dependentApprovals || [])) {
      approvals.push({ planId: a.planId, role: a.role, breaks: a.invalidated !== false });
      if (a.planId) highlightIds.add(a.planId);
    }
    return { approvals, intents, highlightIds, source: 'server' };
  }

  if (mutation === 'revoke_capability') {
    for (const ap of (atlas.approvals || [])) {
      if (usesCapability(ap, node)) {
        approvals.push({ planId: ap.planId, role: ap.role, breaks: true });
        const aid = idOf(ap); if (aid) highlightIds.add(aid);
        if (ap.planId) highlightIds.add(ap.planId);
      }
    }
    for (const it of allIntents(atlas)) {
      if (intentDependsOnCap(it, node)) {
        intents.push({ id: idOf(it) });
        const iid = idOf(it); if (iid) highlightIds.add(iid);
      }
    }
    return { approvals, intents, highlightIds, source: 'derived' };
  }

  if (mutation === 'expire_role') {
    for (const h of (node.holders || [])) { const hid = idOf(h) || h.identity || h; if (hid) highlightIds.add(hid); }
    for (const p of (node.policies || [])) { if (p.targetId) highlightIds.add(p.targetId); }
    for (const ap of (atlas.approvals || [])) {
      if (ap.role && node.role && ap.role === node.role) {
        approvals.push({ planId: ap.planId, role: ap.role, breaks: true });
        const aid = idOf(ap); if (aid) highlightIds.add(aid);
        if (ap.planId) highlightIds.add(ap.planId);
      }
    }
    return { approvals, intents, highlightIds, source: 'derived' };
  }

  return { approvals, intents, highlightIds, source: 'derived' };
}

// usesCapability — does this approval's authority path traverse the capability
// node? Conservative match across the fields the atlas carries.
function usesCapability(ap, capNode) {
  const capId = idOf(capNode);
  const obj = capNode.object;
  const grantee = capNode.grantee;
  if (capId && (ap.capabilityId === capId || ap.capability === capId)) return true;
  if (Array.isArray(ap.capabilities) && ap.capabilities.some((c) => (idOf(c) || c) === capId)) return true;
  if (obj && (ap.object === obj || ap.targetId === obj || ap.scopeTarget === obj)) return true;
  if (grantee && (ap.identity === grantee || ap.keyPage === grantee)) return true;
  // Delegation chain membership.
  if (Array.isArray(capNode.delegationChain) && capNode.delegationChain.some((d) => (idOf(d) || d) === ap.identity)) return true;
  return false;
}

function intentDependsOnCap(it, capNode) {
  const capId = idOf(capNode);
  const obj = capNode.object;
  if (capId && Array.isArray(it.capabilities) && it.capabilities.some((c) => (idOf(c) || c) === capId)) return true;
  if (obj && (it.targetId === obj || it.object === obj)) return true;
  return false;
}

function allIntents(atlas) {
  const out = [];
  for (const a of (atlas.actors || [])) for (const it of (a.intents || [])) out.push(it);
  for (const it of (atlas.intents || [])) out.push(it);
  return out;
}

// Headline for the UI ("7 pending approvals and 3 in-flight intents would break").
export function blastHeadline(result) {
  const a = result.approvals.filter((x) => x.breaks).length;
  const i = result.intents.length;
  return `${a} pending approval${a === 1 ? '' : 's'} and ${i} in-flight intent${i === 1 ? '' : 's'} would break`;
}
