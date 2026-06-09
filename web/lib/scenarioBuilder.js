// Nexus — scenario builder helpers (nextux-02).
//
// Pure, server-free building blocks for the Scenario Builder view: the template
// catalog, the "what do you want to prove" entry choices, and a fast structural
// validator that mirrors the Go pkg/scenario rules (the Go validator stays
// authoritative; this gives instant feedback in the builder).

export const TEMPLATE_SUMMARIES = [
  { id: 'regulated-escrow', title: 'Regulated escrow with selective disclosure', promise: 'A regulated party released funds correctly, verifiable without seeing the private payload.', localSupport: true, kermitSupport: true },
  { id: 'release-evidence', title: 'Release evidence matches a commit and L0 anchor', promise: 'A release package matches a commit and an L0 anchor.', localSupport: true, kermitSupport: true },
  { id: 'witness-quorum', title: 'Two independent witnesses confirmed an event', promise: 'Two independent witnesses confirmed an event.', localSupport: false, kermitSupport: true },
  { id: 'selective-disclosure', title: 'A user disclosed only approved encrypted data', promise: 'A user disclosed only approved encrypted data.', localSupport: true, kermitSupport: true },
  { id: 'bridge-handoff', title: 'A cross-domain handoff settled under governance', promise: 'A cross-domain handoff settled under governance with a verifiable proof.', localSupport: false, kermitSupport: true },
  { id: 'restore-drill', title: 'State restored from L0 and re-verified', promise: 'A node restored its state from L0 and the proof still verifies.', localSupport: false, kermitSupport: true },
  { id: 'metamask-signing', title: 'A MetaMask user authorized a governed action', promise: 'A real wallet signature drove a governed intent.', localSupport: true, kermitSupport: true },
  { id: 'ai-agent-approved-workflow', title: 'An AI agent ran a governed workflow under approval', promise: 'An AI agent executed a governed workflow only after explicit approval.', localSupport: true, kermitSupport: true },
];

// The first screen asks what you want to prove, not what subsystem to configure.
export const ENTRY_CHOICES = [
  { label: 'A regulated party released funds correctly', templateId: 'regulated-escrow' },
  { label: 'A proof can be verified without trusting a node', templateId: 'selective-disclosure' },
  { label: 'Two independent witnesses confirmed an event', templateId: 'witness-quorum' },
  { label: 'A user disclosed only approved encrypted data', templateId: 'selective-disclosure' },
  { label: 'A release package matches a commit and L0 anchor', templateId: 'release-evidence' },
];

export function templateById(id) {
  return TEMPLATE_SUMMARIES.find((t) => t.id === id);
}

// validateScenarioShape returns an array of human-readable errors (empty = ok).
export function validateScenarioShape(sc) {
  const errors = [];
  if (!sc || typeof sc !== 'object') return ['scenario is empty'];
  if (sc.version !== 1) errors.push('version must be 1');
  if (!sc.id) errors.push('id is required');
  if (!sc.title) errors.push('title is required');
  if (sc.network === 'mainnet') errors.push('network mainnet is not allowed');
  else if (sc.network !== 'local' && sc.network !== 'kermit') errors.push('network must be local or kermit');
  if (!sc.actors || Object.keys(sc.actors).length === 0) errors.push('at least one actor is required');
  if (!Array.isArray(sc.steps) || sc.steps.length === 0) errors.push('at least one step is required');
  const seen = new Set();
  for (const st of sc.steps || []) {
    if (!st.id) errors.push('a step has no id');
    else if (seen.has(st.id)) errors.push('duplicate step id ' + st.id);
    else seen.add(st.id);
    if (!st.action) errors.push('step ' + st.id + ' has no action');
    if (st.actor && sc.actors && !sc.actors[st.actor]) errors.push('step ' + st.id + ' references unknown actor ' + st.actor);
  }
  const view = sc.policy && sc.policy.disclosure && sc.policy.disclosure.regulatorCanView;
  if (view && view.length) {
    const hasAuthority = Object.values(sc.actors || {}).some((a) => a.kind === 'disclosureAuthority');
    if (!hasAuthority) errors.push('disclosure grants a regulator view but no disclosureAuthority actor exists');
  }
  return errors;
}

// assurancePreview gives the builder an honest, pre-run expectation string.
export function assurancePreview(templateId, network) {
  const t = templateById(templateId);
  if (!t) return 'Unknown template.';
  if (network === 'kermit') {
    return t.kermitSupport
      ? 'On Kermit: a live, L0-confirmed proof (up to L4/G2). The story is independently verifiable.'
      : 'This template is not supported on Kermit.';
  }
  return t.localSupport
    ? 'Locally: a deterministic, offline proof that caps at L3 (no live L0). The story is independently verifiable; it never claims L4.'
    : 'This template needs Kermit for its full claim; a local run produces a governed L3 proof and reports the rest honestly.';
}
