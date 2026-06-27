// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

// RUNBOOK-05 — Visual / Brand / Cinema fence.
//
// Locks the brand-loads + Cinema-hardening invariants so they survive refactors:
// the fonts are declared + embedded, the renderer is DPR-correct / idle-friendly /
// theme-aware / shape-complete / touch-enabled / leak-free, the FPS HUD is gated,
// and motion is compositor-friendly. See docs/runbooks/RUNBOOK-05-visual-brand-cinema.md.

package nexusweb

import (
	"strings"
	"testing"
)

func cinemaAsset(t *testing.T, p string) string {
	t.Helper()
	b, err := Asset(p)
	if err != nil {
		t.Fatalf("Asset(%s): %v", p, err)
	}
	return string(b)
}

func TestBrand_FontsAreLoaded(t *testing.T) {
	css := cinemaAsset(t, "styles.css")
	if strings.Count(css, "@font-face") < 4 {
		t.Error("styles.css must declare @font-face for Inter + JetBrains Mono (upright+italic)")
	}
	if !strings.Contains(css, "font-display: swap") {
		t.Error("brand fonts must use font-display: swap")
	}
	// The self-hosted variable woff2 must be embedded + served by assets.go.
	for _, f := range []string{
		"fonts/Inter-Variable.woff2",
		"fonts/Inter-Variable-Italic.woff2",
		"fonts/JetBrainsMono-Variable.woff2",
		"fonts/JetBrainsMono-Variable-Italic.woff2",
	} {
		if _, err := Asset(f); err != nil {
			t.Errorf("font asset %q must be embedded/served: %v", f, err)
		}
	}
	// OFL licenses must ship with the binaries.
	for _, l := range []string{"fonts/Inter-OFL.txt", "fonts/JetBrainsMono-OFL.txt"} {
		if _, err := Asset(l); err != nil {
			t.Errorf("font license %q must ship with the binaries (OFL): %v", l, err)
		}
	}
}

func TestCinema_RendererHardeningInvariants(t *testing.T) {
	r := cinemaAsset(t, "cinema-core/renderer.js")
	for _, tok := range []string{
		"devicePixelRatio",                 // Task 2 — DPR backing store
		"setTransform(",                    // Task 2 — context scale
		"needsContinuousAnimation",         // Task 4 — idle loop
		"IntersectionObserver",             // Task 4 — pause off-screen
		"removeEventListener('resize'",     // Task 4 — F10 leak fix
		"getComputedStyle(",                // Task 5 — theme tokens
		"prefers-reduced-motion",           // Task 8 — canvas matchMedia gate
		"pointerdown",                      // Task 9 — touch/pointer
	} {
		if !strings.Contains(r, tok) {
			t.Errorf("renderer.js must contain %q", tok)
		}
	}
	// The FPS HUD must be debug-gated, not always-on.
	if strings.Contains(r, "${this.fps} FPS") && !strings.Contains(r, "_debugHud") {
		t.Error("the FPS HUD must be gated behind the debug flag")
	}
}

func TestCinema_FullShapeVocabulary(t *testing.T) {
	r := cinemaAsset(t, "cinema-core/renderer.js")
	for _, s := range []string{"shield", "gate", "document", "arrow", "octagon", "pentagon", "star", "gauge"} {
		if !strings.Contains(r, "'"+s+"'") {
			t.Errorf("renderer.js tracePath must handle shape %q", s)
		}
	}
	if !strings.Contains(cinemaAsset(t, "cinema-core/visualVocabulary.js"), "shapeForKind") {
		t.Error("visualVocabulary.js must export shapeForKind")
	}
	if strings.Contains(cinemaAsset(t, "lib/cinemaMount.js"), "shape: 'rectangle'") {
		t.Error("cinemaMount must not hardcode shape: 'rectangle' (use shapeForKind)")
	}
}

func TestMotion_NoLeftAnimationsOrAllTransitions(t *testing.T) {
	css := cinemaAsset(t, "styles.css")
	if strings.Contains(css, "transition: all") {
		t.Error("styles.css must scope transitions, not 'transition: all'")
	}
	// particle keyframes must not animate `left`
	if strings.Contains(css, "left: 100%") {
		t.Error("particles must animate transform, not left")
	}
}
