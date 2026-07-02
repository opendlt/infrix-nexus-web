# syntax=docker/dockerfile:1
#
# Hosted read-only Nexus (DX P3-4). The SPA (web/) is go:embed'd into the
# cmd/serve binary, so the final image is just the static binary on distroless —
# no node, no build step at runtime.
#
# This serves the UI only. The SPA's governed reads call an Infrix node's /rpc
# endpoint; point the deployment's reverse proxy at a live node (or run this
# behind the node) so learn/guided/tutor/cinema are live. Without /rpc the data
# panels render their honest "unavailable" states but every route stays navigable.

FROM golang:1.25-bookworm AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" \
    -o /out/nexus-serve ./cmd/serve

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/nexus-serve /usr/local/bin/nexus-serve
EXPOSE 8099
USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/nexus-serve", "-addr", ":8099"]
