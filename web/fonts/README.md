# Brand fonts (RUNBOOK-05 Task 1)

Self-hosted variable `woff2` builds, shipped via `assets.go` (`//go:embed all:web`)
and served as `font/woff2` (`contentTypeFor`). No CDN, no runtime network fetch —
keeps the SPA offline/portable-proof-safe.

| File | Family | Axis | License |
|------|--------|------|---------|
| `Inter-Variable.woff2` | Inter | wght 100–900 | OFL-1.1 (`Inter-OFL.txt`) |
| `Inter-Variable-Italic.woff2` | Inter (italic) | wght 100–900 | OFL-1.1 |
| `JetBrainsMono-Variable.woff2` | JetBrains Mono | wght 100–800 | OFL-1.1 (`JetBrainsMono-OFL.txt`) |
| `JetBrainsMono-Variable-Italic.woff2` | JetBrains Mono (italic) | wght 100–800 | OFL-1.1 |

Provenance: latin-subset variable builds from Fontsource (jsDelivr), which repackages
the upstream rsms/inter and JetBrains/JetBrainsMono OFL releases. The OFL requires the
license to ship with the binaries — it does (embedded with the tree).

`@font-face` declarations live at the top of `web/styles.css`; the two upright faces are
preloaded in `web/index.html`. To refresh, re-fetch the same files from
`@fontsource-variable/{inter,jetbrains-mono}` and keep the filenames.
