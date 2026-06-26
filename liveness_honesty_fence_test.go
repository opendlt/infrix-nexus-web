// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

// RUNBOOK-03 — Liveness honesty fence.
//
// Encodes the "no surface may claim a liveness it does not have" invariants so
// they survive future refactors: the status light is real (not hardcoded
// "Connected"), the store exposes a health signal + time-cursor invalidation +
// guarded polling, RPC errors are translated, and the dead Activity/pulse
// costume (Task 6 Option B) stays removed. See
// docs/runbooks/RUNBOOK-03-liveness-honesty.md.

package nexusweb

import (
	"os"
	"strings"
	"testing"
)

func mustReadLiveness(t *testing.T, p string) string {
	t.Helper()
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatalf("read %s: %v", p, err)
	}
	return string(b)
}

func TestLiveness_StatusNotHardcodedConnected(t *testing.T) {
	src := mustReadLiveness(t, "web/index.html")
	if strings.Contains(src, ">Connected<") {
		t.Errorf("index.html must not hardcode the status text to Connected (it must reflect real fetch health)")
	}
	if !strings.Contains(src, `aria-live="polite"`) {
		t.Errorf("the status-indicator must be an aria-live polite region")
	}
}

func TestLiveness_StoreExposesHealthAndAtInvalidation(t *testing.T) {
	src := mustReadLiveness(t, "web/lib/store.js")
	for _, tok := range []string{
		"export function subscribeHealth", // real connection status (Task 1)
		"export function subscribeTick",   // heartbeat on arrival (Task 3)
		"export function sliceFreshness",  // staleness reader (Task 2)
		"timeContext.js",                  // imports the time cursor
		"onAtChange(",                     // invalidates on cursor change (Task 4)
		"narrative:",                      // … including open narratives (P3)
		"isAtLive",                        // poll guard (Task 5)
		"nextBackoff",                     // exponential backoff (Task 5)
	} {
		if !strings.Contains(src, tok) {
			t.Errorf("store.js must contain %q", tok)
		}
	}
	if strings.Contains(src, "setInterval(() => refreshSlice") {
		t.Errorf("store.js must not use a bare setInterval poller (use the backoff scheduler)")
	}
}

func TestLiveness_RpcParsesUserError(t *testing.T) {
	src := mustReadLiveness(t, "web/lib/rpc.js")
	if !strings.Contains(src, "parseUserError") {
		t.Errorf("rpc.js must route errors through parseUserError (Task 7)")
	}
}

// Task 6 Option B — the dead bus costume stays removed. RUNBOOK-01 deleted the
// only publisher (connectLive/liveEvents.js), so the Activity feed + header
// pulse were permanently-empty "live" panels; they must not return.
func TestLiveness_DeadBusCostumeRemoved(t *testing.T) {
	if _, err := os.Stat("web/lib/liveEvents.js"); err == nil {
		t.Errorf("web/lib/liveEvents.js must not exist (no publisher; would only re-create a costume)")
	}
	// The telemetry rail must not build the empty Activity feed.
	tele := mustReadLiveness(t, "web/lib/telemetry.js")
	if strings.Contains(tele, "'tele-card tele-activity'") || strings.Contains(tele, "function addRow") {
		t.Errorf("telemetry.js must not build the empty Activity feed")
	}
	// index.html must not render the dead header pulse element (a comment that
	// merely mentions it is fine — match the actual element markup).
	html := mustReadLiveness(t, "web/index.html")
	if strings.Contains(html, `id="headerPulse"`) || strings.Contains(html, `class="header-pulse"`) {
		t.Errorf("index.html must not render the dead #headerPulse element")
	}
}

func TestLiveness_HeartbeatNotInfinite(t *testing.T) {
	src := mustReadLiveness(t, "web/styles.css")
	if strings.Contains(src, "animation: heartbeat ") {
		t.Errorf("styles.css must not run the heartbeat on a fixed infinite timer (it beats on real data arrival)")
	}
}
