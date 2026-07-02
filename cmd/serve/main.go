// Command serve runs the embedded Nexus SPA on a local HTTP port for
// development / preview. It mounts nexusweb.StaticHandler() at the root (the SPA
// imports modules by absolute path, so it must live at "/").
//
// Note: this serves the UI only. The SPA's governed reads call the Infrix core's
// /rpc endpoint, which lives in the Infrix binary — without it the data panels
// render their honest loading/unavailable states, but every surface, route, and
// the new RUNBOOK-07 superpower controls are fully navigable.
//
//	go run ./cmd/serve            # serves on :8099
//	go run ./cmd/serve -addr :9000
package main

import (
	"flag"
	"log"
	"net/http"

	nexusweb "github.com/opendlt/infrix-nexus-web"
)

func main() {
	addr := flag.String("addr", ":8099", "address to listen on")
	flag.Parse()

	mux := http.NewServeMux()
	mux.Handle("/", nexusweb.StaticHandler())

	log.Printf("Nexus SPA serving on http://localhost%s  (UI only — /rpc backend not included)", *addr)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatalf("serve: %v", err)
	}
}
