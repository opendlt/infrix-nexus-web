// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

// Cinema-Inbox-Time E3C4 — structural fences for lib/timeContext.js
// and its wiring into spineCommon + app.js.

package nexusweb

import (
	"os"
	"strings"
	"testing"
)

func TestTimeE3C4_TimeContextExports(t *testing.T) {
	data, err := os.ReadFile("web/lib/timeContext.js")
	if err != nil {
		t.Fatalf("read timeContext.js: %v", err)
	}
	src := string(data)
	for _, tok := range []string{
		"export function getAt",
		"export function setAt",
		"export function withAt",
		"export function onAtChange",
		"export function initTimeContext",
		"replaceState",
		"window.history",
		"window.location",
		"popstate",
	} {
		if !strings.Contains(src, tok) {
			t.Errorf("timeContext.js must contain %q", tok)
		}
	}
}

func TestTimeE3C4_SpineCommonInjectsAt(t *testing.T) {
	data, err := os.ReadFile("web/lib/spineCommon.js")
	if err != nil {
		t.Fatalf("read spineCommon.js: %v", err)
	}
	src := string(data)
	if !strings.Contains(src, "import { withAt } from '/lib/timeContext.js'") {
		t.Errorf("spineCommon.js must import withAt from /lib/timeContext.js")
	}
	// every READ inherits the at-coordinate; a governed submission never does (infrix-core item 2c part 28aa: the governed-submit contract is decoded
	// strictly and refuses a view-time "at"), which web/test/submitNoAt.test.mjs drives through the real module
	if !strings.Contains(src, "const merged = { ...DISCLOSURE, ...params };") || !strings.Contains(src, "SUBMIT_METHODS.has(method) ? merged : withAt(merged)") {
		t.Errorf("rpcWithDisclosure must wrap every read's params in withAt so it inherits the at-coordinate, and only the governed submissions in SUBMIT_METHODS go without it")
	}
	for _, m := range []string{"'governed.submit'", "'intent.submit'", "'nexus.previewDossier'"} {
		if !strings.Contains(src, m) {
			t.Errorf("SUBMIT_METHODS must name %s: a submission the node decodes strictly must never carry the view-time at-coordinate", m)
		}
	}
}

func TestTimeE3C4_AppInitialisesContext(t *testing.T) {
	data, err := os.ReadFile("web/app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	src := string(data)
	if !strings.Contains(src, "import { initTimeContext } from '/lib/timeContext.js'") {
		t.Errorf("app.js must import initTimeContext")
	}
	if !strings.Contains(src, "initTimeContext()") {
		t.Errorf("app.js must call initTimeContext() on DOMContentLoaded")
	}
}
