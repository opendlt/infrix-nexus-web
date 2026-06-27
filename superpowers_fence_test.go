// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

// RUNBOOK-07 — The Eight Superpowers fence.
//
// Locks the net-new "wow" features so they survive refactors: the explicit-`at`
// snapshot bypass + temporal diff (SP1/SP2), the causal walk (SP3), the
// blast-radius / what-if (SP4), the reverse authority query (SP5), the
// consequence panel wired into the live flows (SP6), the pulse buffer + trend
// alerts (SP7), and the in-browser L0 cross-check that upgrades the receipt to
// L4 only through validateReceipt (SP8). See docs/runbooks/RUNBOOK-07-superpowers.md.

package nexusweb

import (
	"strings"
	"testing"
)

func spAsset(t *testing.T, p string) string {
	t.Helper()
	b, err := Asset(p)
	if err != nil {
		t.Fatalf("Asset(%s): %v", p, err)
	}
	return string(b)
}

func spMustContain(t *testing.T, file, body string, toks ...string) {
	t.Helper()
	for _, tok := range toks {
		if !strings.Contains(body, tok) {
			t.Errorf("%s must contain %q", file, tok)
		}
	}
}

// Every net-new lib/view must be embedded + export its key entry point.
func TestSP_NewModulesShipAndExport(t *testing.T) {
	cases := []struct {
		path   string
		tokens []string
	}{
		{"lib/timeSnapshot.js", []string{"export function rpcAt", "export async function fetchBoardSnapshot"}},
		{"lib/temporalDiff.js", []string{"export function diffSnapshots"}},
		{"lib/boardScrubber.js", []string{"export function mountBoardScrubber", "export function createScrubberCore"}},
		{"lib/causalWalk.js", []string{"export function buildCausalChain"}},
		{"lib/causalWalkView.js", []string{"export function createCausalWalkPanel"}},
		{"lib/blastRadius.js", []string{"export function computeBlastRadius"}},
		{"lib/whatIfSimulator.js", []string{"export function mountWhatIf", "export function classifyPolicyFlips", "export async function simulatePolicyDelta"}},
		{"lib/authorityIndex.js", []string{"export function buildAuthorityIndex", "export function queryWhoCanTouch"}},
		{"views/reverseQuery.js", []string{"export function mountReverseQuery"}},
		{"lib/consequencePanel.js", []string{"export function consequenceFromDossier", "export function renderConsequencePanel"}},
		{"lib/pulseBuffer.js", []string{"export function pushSample", "export function series"}},
		{"lib/trendAlerts.js", []string{"export function detectAnomalies", "export function renderSparkline"}},
		{"lib/l0CrossCheck.js", []string{"export async function crossCheckL0"}},
		{"views/diff.js", []string{"export const diffView"}},
		{"test/tools/contrast.mjs", nil}, // sanity: prior runbook asset still embedded
	}
	for _, c := range cases {
		if c.path == "test/tools/contrast.mjs" {
			if _, err := Asset(c.path); err != nil {
				t.Errorf("expected %s to remain embedded: %v", c.path, err)
			}
			continue
		}
		spMustContain(t, c.path, spAsset(t, c.path), c.tokens...)
	}
}

// SP1/SP2 — the diff route is registered, and the snapshot helper uses the raw
// rpc + explicit at (NOT rpcWithDisclosure, which would let the global cursor win).
func TestSP_DiffRouteAndExplicitAt(t *testing.T) {
	app := spAsset(t, "app.js")
	spMustContain(t, "app.js", app, "import { diffView }", "diff: diffView")

	snap := spAsset(t, "lib/timeSnapshot.js")
	spMustContain(t, "lib/timeSnapshot.js", snap, "import { rpc }", "p.at = atCoord")
	if strings.Contains(snap, "rpcWithDisclosure(") {
		t.Error("timeSnapshot.rpcAt must bypass the global cursor — it must NOT call rpcWithDisclosure()")
	}

	spine := spAsset(t, "views/spine.js")
	spMustContain(t, "views/spine.js", spine, "mountBoardScrubber")
}

// SP3 — the causal walk is mounted inside the narrative.
func TestSP_CausalWalkMounted(t *testing.T) {
	spMustContain(t, "lib/narrative.js", spAsset(t, "lib/narrative.js"), "createCausalWalkPanel")
}

// SP4 — the what-if simulator is mounted on the authority drawers, and the
// POLICY_* delta is wired into BOTH submit flows.
func TestSP_WhatIfWiring(t *testing.T) {
	spMustContain(t, "lib/governAtlas.js", spAsset(t, "lib/governAtlas.js"), "mountWhatIf", "highlightAtlasCards", "dataset.nodeId")
	spMustContain(t, "views/compose.js", spAsset(t, "views/compose.js"), "mountPolicyDelta")
	spMustContain(t, "lib/cockpitRails.js", spAsset(t, "lib/cockpitRails.js"), "simulatePolicyDelta")
}

// SP5 — the reverse query is reachable via the govern who-can-touch subpath.
func TestSP_ReverseQueryRoute(t *testing.T) {
	spMustContain(t, "views/govern.js", spAsset(t, "views/govern.js"), "who-can-touch", "mountReverseQuery")
}

// SP6 — the consequence panel is mounted into the live approve + submit flows,
// computed from the real dossier (the fixture path stays only in the identity viewer).
func TestSP_ConsequencePanelLive(t *testing.T) {
	spMustContain(t, "views/approve.js", spAsset(t, "views/approve.js"), "renderConsequencePanel")
	spMustContain(t, "lib/dossier.js", spAsset(t, "lib/dossier.js"), "renderConsequencePanel")
}

// SP7 — the pulse buffer is fed from the store (survives telemetry remount) and
// the rail draws sparklines + anomaly alerts.
func TestSP_PulseTrends(t *testing.T) {
	spMustContain(t, "lib/store.js", spAsset(t, "lib/store.js"), "pushSample")
	spMustContain(t, "lib/telemetry.js", spAsset(t, "lib/telemetry.js"), "renderSparkline", "detectAnomalies")
}

// SP8 — the L0 button is live (not disabled), and the receipt only reaches L4
// through validateReceipt (fail-closed). The node-trusting evidence.verify must
// NOT be used to claim L4.
func TestSP_L0CrossCheckHonest(t *testing.T) {
	ev := spAsset(t, "lib/evidenceProof.js")
	spMustContain(t, "lib/evidenceProof.js", ev, "crossCheckL0", "evidence-l0-crosscheck")
	// The old "coming soon" placeholder (button rendered permanently disabled)
	// must be gone — SP8 makes the cross-check live.
	if strings.Contains(ev, "In-app live L0 cross-check is coming") {
		t.Error("the L0 cross-check button must no longer be a disabled placeholder (SP8 makes it live)")
	}

	prove := spAsset(t, "views/prove.js")
	spMustContain(t, "views/prove.js", prove, "crossCheckL0", "validateReceipt", "proofLevel: 'L4'")

	l0 := spAsset(t, "lib/l0CrossCheck.js")
	if strings.Contains(l0, "'evidence.verify'") {
		t.Error("l0CrossCheck must not call the node-trusting evidence.verify to claim L4")
	}
	spMustContain(t, "lib/l0CrossCheck.js", l0, "query-tx")
}
