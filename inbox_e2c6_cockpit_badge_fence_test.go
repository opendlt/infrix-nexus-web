// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

// Cinema-Inbox-Time E2C6 — cockpit drafts rail + header inbox badge.

package nexusweb

import (
	"os"
	"strings"
	"testing"
)

func TestInboxE2C6_DraftsRailExports(t *testing.T) {
	data, err := os.ReadFile("web/lib/cockpitRails.js")
	if err != nil {
		t.Fatalf("read cockpitRails.js: %v", err)
	}
	src := string(data)
	for _, tok := range []string{
		"export function createDraftsRail",
		"export function startHeaderInboxBadge",
		"nexus.draftList",
		"nexus.inbox",
		"#/compose/' + encodeURIComponent(d.goalType || '') + '/draft/'",
		"headerInboxBadge",
	} {
		if !strings.Contains(src, tok) {
			t.Errorf("cockpitRails.js must contain %q", tok)
		}
	}
}

func TestInboxE2C6_SpineMountsDraftsRail(t *testing.T) {
	data, err := os.ReadFile("web/views/spine.js")
	if err != nil {
		t.Fatalf("read spine.js: %v", err)
	}
	src := string(data)
	if !strings.Contains(src, "createDraftsRail") {
		t.Errorf("spine.js must import and mount createDraftsRail")
	}
}

func TestInboxE2C6_HeaderStartsInboxBadge(t *testing.T) {
	data, err := os.ReadFile("web/lib/header.js")
	if err != nil {
		t.Fatalf("read header.js: %v", err)
	}
	src := string(data)
	if !strings.Contains(src, "startHeaderInboxBadge") {
		t.Errorf("header.js must call startHeaderInboxBadge from initHeader")
	}
	if !strings.Contains(src, "inbox:    'inbox'") {
		t.Errorf("header.js workspace-nav map must include inbox → inbox so the route paints active")
	}
}
