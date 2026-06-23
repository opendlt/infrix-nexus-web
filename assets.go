// Copyright 2024 The Infrix Authors
//
// Use of this source code is governed by an MIT-style
// license that can be found in the LICENSE file or at
// https://opensource.org/licenses/MIT.

// Package nexusweb is the embedded Nexus SPA. It owns the //go:embed of the
// web/ tree and serves it over HTTP, so the Infrix binary stays self-contained
// (the assets are embedded transitively when this module is compiled in). The
// Go RPC handlers that drive the SPA live in the core module's pkg/nexus.
package nexusweb

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// webFS embeds the full Nexus SPA tree (index.html + styles.css + app.js +
// lib/*.js + views/*.js + cinema-core/* + the client-side portable-evidence
// verifier). The all: prefix keeps dotfiles and the node smoke tests under
// web/test so the embed mirrors the on-disk tree exactly.
//
//go:embed all:web
var webFS embed.FS

// webRoot is the embedded subtree rooted at web/, so request paths map directly
// to asset paths ("/" -> index.html, "/lib/x.js" -> lib/x.js).
var webRoot fs.FS = mustSubFS(webFS, "web")

func mustSubFS(f embed.FS, dir string) fs.FS {
	sub, err := fs.Sub(f, dir)
	if err != nil {
		panic("nexusweb: fs.Sub: " + err.Error())
	}
	return sub
}

// StaticHandler returns an http.Handler that serves the Nexus SPA from the
// embedded asset tree. It is self-contained (no node coupling) so any HTTP
// server — devnet or production — can mount it at "/".
//
// The root path returns index.html; every other GET returns the matching
// embedded asset. Unknown paths fall through to index.html so client-side hash
// routing (#/intents, #/anchors, ...) survives a hard refresh. Because the SPA
// imports modules by absolute path (e.g. import from "/lib/canonicalJson.js"),
// it must be mounted at the server root, not a sub-path.
func StaticHandler() http.Handler {
	return http.HandlerFunc(serve)
}

func serve(w http.ResponseWriter, r *http.Request) {
	urlPath := strings.TrimPrefix(r.URL.Path, "/")
	if urlPath == "" {
		urlPath = "index.html"
	}

	// Reject path traversal.
	if strings.Contains(urlPath, "..") {
		http.NotFound(w, r)
		return
	}

	// Look up the asset. Missing files fall back to index.html so the SPA's
	// hash router takes over.
	clean := path.Clean(urlPath)
	data, err := fs.ReadFile(webRoot, clean)
	if err != nil {
		index, ierr := fs.ReadFile(webRoot, "index.html")
		if ierr != nil {
			http.Error(w, "nexus: SPA not embedded", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = w.Write(index)
		return
	}

	w.Header().Set("Content-Type", contentTypeFor(clean))
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(data)
}

// Asset reads one embedded asset by its web-relative path (e.g.
// "lib/portableVerifier.js"). Exposed so fence/parity tests can assert the
// hosted product ships the client-side verifier and its dependencies.
func Asset(p string) ([]byte, error) {
	return fs.ReadFile(webRoot, path.Clean(p))
}

// Root exposes the embedded web/ subtree as an fs.FS, for callers that need to
// walk the asset bundle (e.g. parity tests enumerating shipped files).
func Root() fs.FS { return webRoot }

// contentTypeFor returns the MIME type for an embedded asset path. The asset
// tree only ships .html / .css / .js / .json / .svg / images, so a short
// whitelist is sufficient and avoids http.DetectContentType returning
// "text/plain" for ES modules.
func contentTypeFor(p string) string {
	switch {
	case strings.HasSuffix(p, ".html"):
		return "text/html; charset=utf-8"
	case strings.HasSuffix(p, ".css"):
		return "text/css; charset=utf-8"
	case strings.HasSuffix(p, ".js"), strings.HasSuffix(p, ".mjs"):
		return "application/javascript; charset=utf-8"
	case strings.HasSuffix(p, ".json"):
		return "application/json; charset=utf-8"
	case strings.HasSuffix(p, ".svg"):
		return "image/svg+xml"
	case strings.HasSuffix(p, ".png"):
		return "image/png"
	case strings.HasSuffix(p, ".woff2"):
		return "font/woff2"
	}
	return "application/octet-stream"
}
