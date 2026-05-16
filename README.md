[![Build Camera Dataset](https://github.com/stevenkozeniesky02/flock-avoid/actions/workflows/build-camera-dataset.yml/badge.svg)](https://github.com/stevenkozeniesky02/flock-avoid/actions/workflows/build-camera-dataset.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](./LICENSE)

# Flock-Avoid — Phase 0a (Routing Validation Spike)

Privacy-first map + routing app that helps users avoid mass-surveillance infrastructure.

This is the **Phase 0a spike**: validates that surveillance-aware routing produces sane routes. Not yet a real product — see [`docs/superpowers/specs/2026-05-15-flock-avoid-design.md`](docs/superpowers/specs/2026-05-15-flock-avoid-design.md) for the full design and [`docs/superpowers/plans/2026-05-15-flock-avoid-phase-0a-routing-validation.md`](docs/superpowers/plans/2026-05-15-flock-avoid-phase-0a-routing-validation.md) for this spike's plan.

## Run locally

Prereqs: Docker (with `docker compose`), Node 20+, npm.

```bash
npm install

# Bring up Valhalla — downloads ~250MB Georgia OSM PBF and builds tiles on first run
# (~10-20 min the first time; subsequent runs start in seconds).
# The script polls /status and exits when Valhalla is ready.
./scripts/build-valhalla-tiles.sh

# Start the Vite dev server
npm run dev
```

Open http://localhost:5173. Pick a profile (Commuter / Vulnerable). Click **Set Start on map**, then click the map. Click **Set End on map**, then click somewhere else. Click **Plan route**. You'll see two routes (red dashed = shortest, green = private) and a comparison panel showing extra time and cameras avoided.

To stop Valhalla: `npm run valhalla:down`.

## Tests

```bash
npm test                  # unit + integration (integration tests early-return + warn if Valhalla is down)
npx playwright test       # privacy invariants + benchmark (skipped if Valhalla is down)
```

To run only the fast unit tests:
```bash
npx vitest run tests/unit
```

**Behavior when Valhalla isn't reachable:** integration tests and Playwright tests detect the unhealthy server in `beforeAll` and skip / early-return with a clear console message. The unit tests still run, so CI stays green even if Valhalla is down. To get full coverage, get Valhalla healthy and re-run.

## If `build-valhalla-tiles.sh` fails with `502`/`503` from Geofabrik

This means [download.geofabrik.de](https://download.geofabrik.de) is having an outage. Wait a few minutes and re-run `./scripts/build-valhalla-tiles.sh` — most outages clear quickly. If it stays down, alternatives:

- Edit `docker-compose.yml` and change `tile_urls` to a working mirror, e.g.
  - `https://download.openstreetmap.fr/extracts/north-america/us/georgia.osm.pbf`
  - or any other OSM PBF extract that covers Atlanta
- After editing, run `npm run valhalla:down && ./scripts/build-valhalla-tiles.sh` again

## Scope of this spike

What's in:
- Server-side routing via local Valhalla (no on-device WASM yet)
- Hand-curated 12-camera Atlanta seed dataset
- Two threat profiles: **Commuter** + **Vulnerable**
- MapLibre + OSM raster tiles
- Privacy-invariant network allowlist enforced by Playwright
- One routing-quality benchmark case for Atlanta

What's deferred (not v0a):
- DeFlock + OSM data pipeline (Phase 0b)
- Self-hosted vector tiles (Phase 0b)
- Activist + Custom threat profiles (Phase 0b)
- PWA install + service worker + offline (Phase 0b)
- Public deployment (Phase 0b)
- On-device routing via Valhalla WASM (Phase 1)
- Submissions + live community pings (Phase 1)
- Android + iOS shells via Capacitor (Phase 1, Phase 2)

## Layout

```
src/
├── domain/         # Camera, ThreatProfile, Route types
├── data/           # CameraStore + spatial queries
├── routing/        # Valhalla client, exclusion polygons, route scorer, orchestrator
├── privacy/        # Network host allowlist
└── ui/             # MapView, ProfilePicker, RoutePlanner
tests/
├── unit/           # Vitest, pure-logic tests
├── integration/    # Vitest hits live Valhalla
├── privacy/        # Playwright network-allowlist invariants
└── benchmark/      # Playwright routing-quality benchmark
```

## Privacy notes

This spike runs routing against a locally-hosted Valhalla — your trip endpoints are sent to `localhost:8002` only. No data leaves your machine other than:
- Map tiles fetched from `*.tile.openstreetmap.org`
- The first-run download of the Georgia OSM PBF when building Valhalla tiles

The privacy-invariant test (`tests/privacy/networkInvariants.spec.ts`) enforces that the app makes no other network requests.
