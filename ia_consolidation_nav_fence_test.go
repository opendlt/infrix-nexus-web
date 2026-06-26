// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

// RUNBOOK-01 — Information-Architecture consolidation fence.
//
// Locks in the post-consolidation contract: six canonical nav doors, the
// removal of the fixture/marketing view imports from the SPA router, the
// newcomer default-landing (#/start, not the deleted #/app), and the command
// palette carrying the folded-out doors so nothing becomes URL-only. If a
// future change reintroduces a duplicate door or a deleted surface, CI fails
// here. See docs/runbooks/RUNBOOK-01-ia-consolidation.md.

package nexusweb

import (
	"os"
	"strings"
	"testing"
)

func TestIAConsolidation_SixNavDoors(t *testing.T) {
	data, err := os.ReadFile("web/index.html")
	if err != nil {
		t.Fatalf("read web/index.html: %v", err)
	}
	src := string(data)

	// Exactly six workspace-link anchors.
	if got := strings.Count(src, `class="workspace-link"`); got != 6 {
		t.Errorf("expected exactly 6 workspace-link nav doors, found %d", got)
	}

	// Each of the six canonical doors must be present.
	for _, ws := range []string{"start", "compose", "prove", "spine", "govern", "inbox"} {
		if !strings.Contains(src, `data-workspace="`+ws+`"`) {
			t.Errorf("nav must contain the %q door (data-workspace=%q)", ws, ws)
		}
	}

	// The folded-out workspaces must NOT be nav doors anymore.
	for _, ws := range []string{"operate", "agent", "scenarios"} {
		if strings.Contains(src, `data-workspace="`+ws+`"`) {
			t.Errorf("data-workspace=%q must NOT be a nav door (it moved to the command palette)", ws)
		}
	}

	// The inbox badge + start link the other fences depend on stay.
	if !strings.Contains(src, `id="headerInboxBadge"`) {
		t.Errorf("index.html must keep span#headerInboxBadge")
	}
	if !strings.Contains(src, `href="#/start"`) {
		t.Errorf("index.html must keep the #/start nav link")
	}
}

func TestIAConsolidation_RemovedViewImportsGone(t *testing.T) {
	data, err := os.ReadFile("web/app.js")
	if err != nil {
		t.Fatalf("read web/app.js: %v", err)
	}
	src := string(data)

	// Deleted fixture views + relocated marketing views must no longer be
	// imported into the SPA module graph.
	removed := []string{
		"/views/app.js",
		"/views/workbench.js",
		"/views/autopilot.js",
		"/views/studio.js",
		"/views/room.js",
		"/views/companion.js",
		"/views/launch.js",
		"/views/compare.js",
		"/views/design.js",
		"/views/trust_center.js",
		"/views/wallet_lab.js",
		"/views/inbox_collab.js", // proof-inbox folded into the inbox lane
	}
	for _, p := range removed {
		if strings.Contains(src, p) {
			t.Errorf("app.js must not reference %q after IA consolidation", p)
		}
	}

	// The merged-away routes must survive as redirect stubs (deep-link safety).
	for _, stub := range []string{
		"autopilot: makeRedirect",
		"workbench: makeRedirect",
		"studio: makeRedirect",
		"companion: makeRedirect",
		"rooms: makeRedirect",
		"app: makeRedirect",
		"'proof-inbox': makeRedirect",
		"'trust-center': makeRedirect",
		"'wallet-lab': makeRedirect",
	} {
		if !strings.Contains(src, stub) {
			t.Errorf("app.js must keep redirect stub %q for deep-link preservation", stub)
		}
	}
}

func TestIAConsolidation_NewcomerLanding(t *testing.T) {
	data, err := os.ReadFile("web/app.js")
	if err != nil {
		t.Fatalf("read web/app.js: %v", err)
	}
	src := string(data)

	// Newcomers land on the guided Start hub; experts on the spine.
	if !strings.Contains(src, `mode === 'expert' ? '#/spine' : '#/start'`) {
		t.Errorf("default-landing must route experts to #/spine and newcomers to #/start")
	}
	// The deleted #/app fixture landing must be gone from the landing logic.
	if strings.Contains(src, `window.location.hash = '#/app'`) {
		t.Errorf("the removed #/app default landing must not be reintroduced")
	}
}

func TestIAConsolidation_PaletteCarriesFoldedDoors(t *testing.T) {
	data, err := os.ReadFile("web/lib/commandPalette.js")
	if err != nil {
		t.Fatalf("read web/lib/commandPalette.js: %v", err)
	}
	src := string(data)

	// The folded-out doors must be jumpable in the palette, or they become
	// URL-only (the global search returns chain objects, not workspaces).
	for _, qj := range []string{"qj.operate", "qj.agent", "qj.scenarios"} {
		if !strings.Contains(src, qj) {
			t.Errorf("command palette QUICK_JUMPS must include %q so it is not URL-only", qj)
		}
	}
}
