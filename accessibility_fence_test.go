// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

// RUNBOOK-06 — Accessibility fence.
//
// Locks the WCAG 2.1 AA affordances so they survive refactors: the skip link,
// the canvas ARIA + parallel DOM, canvas keyboard navigation + reduced-motion
// gating, status/live-region announcements, the mobile nav disclosure, the
// route-change focus management, and the self-checking contrast tool.
// See docs/runbooks/RUNBOOK-06-accessibility.md.

package nexusweb

import (
	"strings"
	"testing"
)

func a11yAsset(t *testing.T, p string) string {
	t.Helper()
	b, err := Asset(p)
	if err != nil {
		t.Fatalf("Asset(%s): %v", p, err)
	}
	return string(b)
}

func mustContainAll(t *testing.T, file, body string, toks []string) {
	t.Helper()
	for _, tok := range toks {
		if !strings.Contains(body, tok) {
			t.Errorf("%s must contain %q", file, tok)
		}
	}
}

func TestA11y_SkipLinkAndLandmarks(t *testing.T) {
	html := a11yAsset(t, "index.html")
	mustContainAll(t, "index.html", html, []string{
		`class="skip-link"`,          // Task 1 — bypass blocks
		`href="#view-container"`,     // skip target
		`id="view-container"`,        // the target exists
	})
	// The skip target must be programmatically focusable.
	if !strings.Contains(html, `id="view-container" tabindex="-1"`) {
		t.Error("#view-container must have tabindex=-1 so the skip link can focus it")
	}
	css := a11yAsset(t, "styles.css")
	mustContainAll(t, "styles.css", css, []string{
		".skip-link {",
		".skip-link:focus {",
	})
}

func TestA11y_StatusAndBlockHeightAnnounce(t *testing.T) {
	html := a11yAsset(t, "index.html")
	// Task 5 — status region announces politely + atomically, dot is decorative.
	mustContainAll(t, "index.html", html, []string{
		`class="status-indicator" aria-live="polite" aria-atomic="true"`,
		`id="statusDot" aria-hidden="true"`,
		`id="blockHeightDisplay" aria-live="polite" aria-atomic="true"`,
	})
	// The block-height poll must guard the DOM write so aria-live doesn't
	// re-announce an unchanged value every tick.
	header := a11yAsset(t, "lib/header.js")
	if !strings.Contains(header, "if (el.textContent !== next)") {
		t.Error("header.js initBlockHeight must only write on change (aria-live re-announce guard)")
	}
}

func TestA11y_CanvasAriaAndParallelDom(t *testing.T) {
	app := a11yAsset(t, "cinema-core/app.js")
	// Task 2 — canvas exposed as a named application widget with a DOM mirror.
	mustContainAll(t, "cinema-core/app.js", app, []string{
		`'role', 'application'`,
		`'aria-roledescription', 'Interactive proof graph'`,
		`'tabindex', '0'`,
		`'cinema-live'`,            // polite live region
		`'cinema-alt'`,             // parallel DOM
		"renderCinemaAlt",          // builder
		"describeNode",             // node → sentence
		"nodeFocused",              // keyboard focus announced
		"selectNodeById",           // alt-DOM buttons reuse the selection path
	})
}

func TestA11y_CanvasKeyboardAndReducedMotion(t *testing.T) {
	r := a11yAsset(t, "cinema-core/renderer.js")
	mustContainAll(t, "cinema-core/renderer.js", r, []string{
		"orderedNodes",             // Task 3 — stable traversal order
		"centerOnFocusedNode",      // Task 3 — pan + announce
		"focusedNodeIndex",         // Task 3 — focus state
		"focusVisible",             // Task 3 — keyboard-only focus ring
		"'nodeFocused'",            // Task 3 — emits focus events
		"selectNodeById",           // Task 2/3 — programmatic select
		"_reducedMotion ? 1",       // Task 4 — entryScale gated
	})
	// Tab must never be force-handled (no keyboard trap). The keydown switch
	// must have a default that leaves keys unhandled.
	if !strings.Contains(r, "handled = false") {
		t.Error("renderer.js keydown must leave unknown keys (incl. Tab) unhandled — no keyboard trap")
	}
}

func TestA11y_MobileNav(t *testing.T) {
	html := a11yAsset(t, "index.html")
	mustContainAll(t, "index.html", html, []string{
		`id="navToggle"`,
		`aria-controls="headerWorkspaces"`,
		`id="headerWorkspaces"`,
	})
	js := a11yAsset(t, "lib/mobileNav.js")
	mustContainAll(t, "lib/mobileNav.js", js, []string{
		"export function initMobileNav",
		"aria-expanded",
		"Escape",
		"is-open",
	})
	// Wired into the header bootstrap.
	if !strings.Contains(a11yAsset(t, "lib/header.js"), "initMobileNav(") {
		t.Error("header.js must call initMobileNav()")
	}
	css := a11yAsset(t, "styles.css")
	mustContainAll(t, "styles.css", css, []string{".nav-toggle {", `aria-expanded="true"`})
}

func TestA11y_RouterFocusManagement(t *testing.T) {
	r := a11yAsset(t, "lib/router.js")
	mustContainAll(t, "lib/router.js", r, []string{
		"frame.tabIndex = -1",   // Task 8 — focusable frames
		"moveFocusToView",       // Task 8 — focus the new view
		"moveFocus",             // Task 8 — opt threaded through activate
	})
	// Deliberate navigations move focus; popstate/hashchange must not.
	if !strings.Contains(r, "{ moveFocus: true }") {
		t.Error("router.js must pass moveFocus:true on click + navigateTo")
	}
}

func TestA11y_ContrastToolShipsAndAudits(t *testing.T) {
	tool := a11yAsset(t, "test/tools/contrast.mjs")
	mustContainAll(t, "test/tools/contrast.mjs", tool, []string{
		"export function contrastRatio",
		"export function auditThemes",
		"4.5", // AA normal-text threshold
	})
}
