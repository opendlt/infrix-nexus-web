// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

// Cinema-Inbox-Time E2C5 — Studio drafts + rationale modals + comment
// thread structural fences. The view files live in web/ as ESM
// modules; these tests encode the contract so accidental renames
// break the build instead of silently regressing the UI.

package nexusweb

import (
	"os"
	"strings"
	"testing"
)

func TestInboxE2C5_RationaleModalShape(t *testing.T) {
	data, err := os.ReadFile("web/lib/rationaleModal.js")
	if err != nil {
		t.Fatalf("read rationaleModal.js: %v", err)
	}
	src := string(data)
	for _, tok := range []string{
		"openRationaleModal",
		"MIN_RATIONALE_CHARS",
		"Confirm sign",
		"Confirm reject",
		"Escape",
		"return new Promise",
	} {
		if !strings.Contains(src, tok) {
			t.Errorf("rationaleModal.js must contain %q", tok)
		}
	}
	if !strings.Contains(src, "MIN_RATIONALE_CHARS = 10") {
		t.Errorf("rationaleModal.js must enforce 10-char floor matching the backend")
	}
}

func TestInboxE2C5_CommentThreadShape(t *testing.T) {
	data, err := os.ReadFile("web/lib/commentThread.js")
	if err != nil {
		t.Fatalf("read commentThread.js: %v", err)
	}
	src := string(data)
	for _, tok := range []string{
		"mountCommentThread",
		"nexus.noteAdd",
		"nexus.noteList",
		"@acc://",
		"mentions",
	} {
		if !strings.Contains(src, tok) {
			t.Errorf("commentThread.js must contain %q", tok)
		}
	}
}

func TestInboxE2C5_ApproveViewUsesRationaleModal(t *testing.T) {
	data, err := os.ReadFile("web/views/approve.js")
	if err != nil {
		t.Fatalf("read approve.js: %v", err)
	}
	src := string(data)
	if !strings.Contains(src, "openRationaleModal") {
		t.Errorf("approve.js must use openRationaleModal for sign + reject")
	}
	if !strings.Contains(src, "governed.reject") {
		t.Errorf("approve.js must call governed.reject — the old confirm-and-noop is gone")
	}
	if !strings.Contains(src, "mountCommentThread") {
		t.Errorf("approve.js must mount a comment thread on the dossier so reviewers can discuss before signing")
	}
	if !strings.Contains(src, "rationale,") {
		t.Errorf("approve.js must include the rationale field in the governed.approve params")
	}
}

func TestInboxE2C5_ComposeAutosavesDrafts(t *testing.T) {
	data, err := os.ReadFile("web/views/compose.js")
	if err != nil {
		t.Fatalf("read compose.js: %v", err)
	}
	src := string(data)
	for _, tok := range []string{
		"nexus.draftCreate",
		"nexus.draftList",
		"DRAFT_AUTOSAVE_MS",
		"30000",
		"prepareDraftContext",
		"startDraftAutosave",
		"draftClientId",
	} {
		if !strings.Contains(src, tok) {
			t.Errorf("compose.js must contain %q", tok)
		}
	}
	if !strings.Contains(src, "Save draft now") {
		t.Errorf("compose.js must expose a manual Save draft now button alongside the 30s autosave")
	}
}
