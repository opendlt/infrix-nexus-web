# infrix-nexus-web

> **Infrix — governed, verifiable execution on Accumulate.** New here? Start at
> [infrix.opendlt.org](https://infrix.opendlt.org) · try it live at
> [play.infrix.opendlt.org](https://play.infrix.opendlt.org).

The **Nexus SPA** for [Infrix](https://github.com/opendlt) — the
governance-first explorer/cockpit — packaged as a stdlib-only Go module that
**owns the `//go:embed` of the SPA** and serves it over HTTP. The Infrix core
imports this module so its binary stays self-contained (the assets are embedded
transitively); the Go RPC handlers that drive the SPA live in the core's `pkg/nexus`.

## Go API (`package nexusweb`)

```go
import nexusweb "github.com/opendlt/infrix-nexus-web"

mux.Handle("/", nexusweb.StaticHandler())        // serve the SPA at the server root
data, err := nexusweb.Asset("lib/portableVerifier.js") // read one embedded asset
fsys := nexusweb.Root()                          // the embedded web/ tree as an fs.FS
```

The SPA imports its modules by absolute path (`/lib/...`), so it must be mounted
at the server root.

## Layout

```
assets.go              //go:embed all:web + StaticHandler/Asset/Root
web/                   the SPA: index.html, app.js, styles.css, lib/, views/,
                       components/, cinema-core/, testdata/, test/
*_fence_test.go        structural fences on the shipped SPA (Go)
web/test/*.mjs         the in-browser portable-evidence verifier suite (node --test)
```

## Test

```bash
go test ./...                  # structural fences over the embedded assets
node --test web/test/*.mjs     # the browser verifier + UI smokes (92 tests)
```

The Go↔browser verifier parity gate + the portable-fixture generator live in the
Infrix core (they depend on Go evidence primitives) and resolve this module via
`go list -m`. The Cinema renderer is the canonical `@infrix/cinema-core` (currently
vendored in-tree under `web/cinema-core/`; a repoint to the published package is a
planned follow-on).

## Provenance

Extracted from the Infrix monorepo with full `web/` history preserved
(`git filter-repo`); the tree is content-identical to the in-repo module.
