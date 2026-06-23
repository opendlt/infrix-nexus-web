// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

// Cinema-Inbox-Time E3C8 — structural fences for views/verifyBatch.js.

package nexusweb

import (
	"os"
	"strings"
	"testing"
)

func TestTimeE3C8_ViewModuleShape(t *testing.T) {
	data, err := os.ReadFile("web/views/verifyBatch.js")
	if err != nil {
		t.Fatalf("read verifyBatch.js: %v", err)
	}
	src := string(data)
	for _, tok := range []string{
		"export const verifyBatchView",
		"nexus.verifyBatch",
		"async: true",
		"jobId",
		"timeContext.js",
		"isAtLive",
		"exportReport",
		"exportReportCSV",
		"application/json",
		"text/csv",
	} {
		if !strings.Contains(src, tok) {
			t.Errorf("verifyBatch.js must contain %q", tok)
		}
	}
	// Both export buttons must surface for the operator.
	if !strings.Contains(src, "Export report (JSON)") {
		t.Errorf("verifyBatch.js must offer JSON export button")
	}
	if !strings.Contains(src, "Export report (CSV)") {
		t.Errorf("verifyBatch.js must offer CSV export button")
	}
}

func TestTimeE3C8_RouteRegistered(t *testing.T) {
	data, err := os.ReadFile("web/app.js")
	if err != nil {
		t.Fatalf("read app.js: %v", err)
	}
	src := string(data)
	if !strings.Contains(src, "verifyBatch: verifyBatchView") {
		t.Errorf("app.js must register the verifyBatch route")
	}
	if !strings.Contains(src, `import { verifyBatchView } from '/views/verifyBatch.js'`) {
		t.Errorf("app.js must import verifyBatchView")
	}
}
