// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

// Cinema-Inbox-Time E3C5 — structural fences for lib/timeSelector.js
// + the header wiring + the non-live banner slot in index.html.

package nexusweb

import (
	"os"
	"strings"
	"testing"
)

func TestTimeE3C5_SelectorExports(t *testing.T) {
	data, err := os.ReadFile("web/lib/timeSelector.js")
	if err != nil {
		t.Fatalf("read timeSelector.js: %v", err)
	}
	src := string(data)
	for _, tok := range []string{
		"export function mountTimeSelector",
		"export function mountTimeBanner",
		"onAtChange",
		"setAt(null)",
		"Back to live",
		"datetime-local",
		"time-travel-banner",
	} {
		if !strings.Contains(src, tok) {
			t.Errorf("timeSelector.js must contain %q", tok)
		}
	}
}

func TestTimeE3C5_HeaderMountsSelector(t *testing.T) {
	data, err := os.ReadFile("web/lib/header.js")
	if err != nil {
		t.Fatalf("read header.js: %v", err)
	}
	src := string(data)
	if !strings.Contains(src, "mountTimeSelector") || !strings.Contains(src, "mountTimeBanner") {
		t.Errorf("header.js must import + invoke mountTimeSelector and mountTimeBanner")
	}
}

func TestTimeE3C5_IndexReservesSelectorSlot(t *testing.T) {
	data, err := os.ReadFile("web/index.html")
	if err != nil {
		t.Fatalf("read index.html: %v", err)
	}
	src := string(data)
	if !strings.Contains(src, `id="headerTimeSelector"`) {
		t.Errorf("index.html must reserve a div#headerTimeSelector for the time-travel selector")
	}
}
