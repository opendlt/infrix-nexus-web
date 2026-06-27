// Nexus — approval gate (RUNBOOK-04 Task 1).
//
// The bulk-approve safety gate as a PURE function, so the safety-critical logic
// is unit-tested directly (no DOM, no RPC, no /lib imports). Given an approval
// dossier (and the inbox row it came from), it returns either:
//   { blocked: true, reason }                              — do NOT approve
//   { blocked: false, intentId, stageId, planHash, role }  — governed.approve args
//
// This mirrors the gate the dedicated single-approve screen applies
// (approvalDossier blocked() — no plan, or any blocked/failed invalidator) and
// the full plan binding the single path sends (approve.js signApproval).

export function approvalCallFromDossier(d, row) {
  if (!d || !d.plan) return { blocked: true, reason: 'no plan' };
  const invalid = (d.invalidators || []).some(
    (i) => i && (i.severity === 'blocked' || i.severity === 'failed'),
  );
  if (invalid) return { blocked: true, reason: 'invalidator' };
  const remaining0 = (Array.isArray(d.remaining) && d.remaining[0]) ? d.remaining[0] : {};
  return {
    blocked: false,
    intentId: d.intentId || (row && (row.intentId || row.id)) || '',
    stageId: remaining0.stageId || '',
    planHash: d.planHash,
    role: remaining0.role || (d.requiredRoles && d.requiredRoles[0]) || '',
  };
}
