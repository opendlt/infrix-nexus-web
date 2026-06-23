// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

// Cinema-Inbox-Time E2C4 — structural fence for views/inbox.js.
//
// The inbox view is shipped as ESM that the explorer router lazy-loads.
// To keep Go from accidentally breaking it (RPCs renamed, route removed,
// keyboard shortcut dropped) we encode the expected structure as a
// build-time fence that fails CI whenever the contract drifts.

package nexusweb

import (
	"os"
	"strings"
	"testing"
)

func TestInboxE2C4_ViewModulePresent(t *testing.T) {
	const viewPath = "web/views/inbox.js"
	data, err := os.ReadFile(viewPath)
	if err != nil {
		t.Fatalf("read %s: %v", viewPath, err)
	}
	src := string(data)

	// Required RPC method names — if these are renamed without updating
	// the view, the inbox silently stops working.
	requiredRPCs := []string{
		"nexus.inbox",
		"governed.approve",
		"governed.reject",
		"nexus.handoffCreate",
		"nexus.noteAdd",
	}
	for _, m := range requiredRPCs {
		if !strings.Contains(src, m) {
			t.Errorf("inbox view must reference RPC %q", m)
		}
	}

	// Required tab keys — these match the lanes returned by nexus.inbox.
	requiredTabs := []string{
		"approvals", "assigned", "mentions", "handoffs", "drafts",
	}
	for _, k := range requiredTabs {
		if !strings.Contains(src, k) {
			t.Errorf("inbox view must declare tab key %q", k)
		}
	}

	// Required bulk-action button labels.
	for _, lbl := range []string{"Approve", "Reject", "Handoff"} {
		if !strings.Contains(src, lbl) {
			t.Errorf("inbox toolbar must offer the %s bulk-action button", lbl)
		}
	}

	// Mandatory rationale floor must match the backend constant.
	if !strings.Contains(src, "10") {
		t.Errorf("inbox view must enforce the min rationale length (10 chars)")
	}

	// Keyboard navigation shortcuts — required for spec parity.
	for _, key := range []string{
		"'j'", "'k'", "'x'", "'s'", "'r'", "'f'", "'Enter'", "'a'", "'d'", "'/'",
	} {
		if !strings.Contains(src, "case "+key) {
			t.Errorf("inbox view must handle keyboard shortcut %s", key)
		}
	}

	// Polling against nexus.inbox so the inbox refreshes itself.
	if !strings.Contains(src, "setInterval") {
		t.Errorf("inbox view must poll nexus.inbox")
	}
}

func TestInboxE2C4_RouteRegistered(t *testing.T) {
	data, err := os.ReadFile("web/app.js")
	if err != nil {
		t.Fatalf("read web/app.js: %v", err)
	}
	src := string(data)
	if !strings.Contains(src, "inbox: inboxView") {
		t.Errorf("app.js must register the inbox route → inboxView")
	}
	if !strings.Contains(src, `import { inboxView } from '/views/inbox.js'`) {
		t.Errorf("app.js must import inboxView from /views/inbox.js")
	}
}

func TestInboxE2C4_HeaderNavLink(t *testing.T) {
	data, err := os.ReadFile("web/index.html")
	if err != nil {
		t.Fatalf("read web/index.html: %v", err)
	}
	src := string(data)
	if !strings.Contains(src, `data-workspace="inbox"`) {
		t.Errorf("index.html must render a workspace link with data-workspace=\"inbox\"")
	}
	if !strings.Contains(src, `id="headerInboxBadge"`) {
		t.Errorf("index.html must reserve a span#headerInboxBadge for the unread count")
	}
}
