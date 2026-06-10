// Nexus — Visual Workflow Studio palette (nextux-12).
//
// The node palette grouped for the studio canvas. Default labels are plain
// ("Buyer approves"); the expert reveal exposes the technical fields (action
// ids, key pages, thresholds). The palette is taken from the loaded fixture
// when present (so it stays in lockstep with the Go pkg/studio.Palette), with a
// static fallback so the panel renders even before data loads.

import { getStudioData } from '/lib/studioGraph.js';

const FALLBACK = [
  { group: 'People and agents', items: [
    { kind: 'actor', defaultLabel: 'Add a participant', expert: 'actor id + role', needsActor: true },
  ] },
  { group: 'Actions', items: [
    { kind: 'workflow_action', defaultLabel: 'Run a governed action', expert: 'agent action id', needsAction: true },
  ] },
  { group: 'Trust and proof', items: [
    { kind: 'disclosure', defaultLabel: 'Regulator can view invoice', expert: 'disclosure authority + fields', needsActor: true },
    { kind: 'witness', defaultLabel: 'Two operators witness', expert: 'witness threshold (M-of-N)' },
    { kind: 'proof_export', defaultLabel: 'Export proof receipt', expert: 'portable evidence package' },
    { kind: 'proof_verify', defaultLabel: 'Verify the proof', expert: 'verifier command, live L0 = L4' },
    { kind: 'cinema_replay', defaultLabel: 'Replay in Cinema', expert: 'replay capsule' },
  ] },
  { group: 'Review', items: [
    { kind: 'approval', defaultLabel: 'Buyer approves', expert: 'approver key page', needsActor: true },
    { kind: 'agent_approval', defaultLabel: 'Agent approves under policy', expert: 'agent session token', needsActor: true },
    { kind: 'inbox_review', defaultLabel: 'Reviewer checks the proof', expert: 'signed, artifact-bound decision', needsActor: true },
  ] },
  { group: 'Outputs', items: [
    { kind: 'proof_export', defaultLabel: 'Export proof receipt', expert: 'receipt + verifier command' },
  ] },
];

/** paletteGroups returns the palette from the loaded fixture, or the fallback. */
export function paletteGroups() {
  try {
    const d = getStudioData();
    if (d && Array.isArray(d.palette) && d.palette.length) return d.palette;
  } catch (_) {
    /* data not loaded yet — use the static fallback */
  }
  return FALLBACK;
}

/** kindLabel returns a plain label for a node kind from the palette. */
export function kindLabel(kind) {
  for (const g of paletteGroups()) {
    for (const it of g.items || []) {
      if (it.kind === kind) return it.defaultLabel;
    }
  }
  return kind;
}
