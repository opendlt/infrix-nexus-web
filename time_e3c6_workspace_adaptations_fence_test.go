// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

// Cinema-Inbox-Time E3C6 — workspace adaptations to the time cursor.
// Every workspace that polls should:
//   1. import onAtChange + isAtLive from /lib/timeContext.js
//   2. skip its periodic poll when isAtLive() is false (the snapshot
//      is frozen; saving the round-trip is the whole point)
//   3. re-fetch on every onAtChange transition so the lens stays
//      coherent with the cursor

package nexusweb

import (
	"os"
	"strings"
	"testing"
)

type atAwarenessCase struct {
	file     string
	mustHave []string
}

func TestTimeE3C6_WorkspacesHonourAtCursor(t *testing.T) {
	cases := []atAwarenessCase{
		{file: "web/views/inbox.js",
			mustHave: []string{"timeContext.js", "isAtLive()", "onAtChange"}},
		{file: "web/views/approve.js",
			mustHave: []string{"timeContext.js", "isAtLive()", "onAtChange"}},
		{file: "web/lib/cockpitRails.js",
			mustHave: []string{"timeContext.js", "isAtLive()", "onAtChange"}},
	}
	for _, c := range cases {
		data, err := os.ReadFile(c.file)
		if err != nil {
			t.Errorf("[%s] read: %v", c.file, err)
			continue
		}
		src := string(data)
		for _, tok := range c.mustHave {
			if !strings.Contains(src, tok) {
				t.Errorf("[%s] must contain %q (time-cursor awareness)", c.file, tok)
			}
		}
	}
}
