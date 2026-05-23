[![Build Camera Dataset](https://github.com/stevenkozeniesky02/flock-avoid/actions/workflows/build-camera-dataset.yml/badge.svg)](https://github.com/stevenkozeniesky02/flock-avoid/actions/workflows/build-camera-dataset.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](./LICENSE)

# Flock-Avoid

Privacy-first map + routing app that helps users avoid mass-surveillance infrastructure (ALPRs, Flock cameras, CCTV).

Currently shipping: directional-cone surveillance-aware routing (Phase 0b-1) + nightly-refreshed all-US camera dataset (Phase 0b-2). Real map product UI (search, directions, mobile, branded design) is Phase 0b-3 — see [`docs/superpowers/specs/`](docs/superpowers/specs/) for design history.

## Run locally

Prereqs: Docker (with `docker compose`), Node 20+, npm.

```bash
npm install

# Bring up Valhalla — downloads ~250MB Georgia OSM PBF and builds tiles on first run
# (~10-20 min the first time; subsequent runs start in seconds).
./scripts/build-valhalla-tiles.sh

# Start the Vite dev server
npm run dev
```

For nationwide routing instead of Atlanta-only, see [docs/VALHALLA.md](docs/VALHALLA.md) — the full-US build is a multi-hour, ~100 GB working-disk operation behind one extra npm script.

Open http://localhost:5173. The app fetches the latest published camera dataset from this repo's GitHub Releases by default. Pick a profile (Commuter / Activist / Vulnerable / Custom). Click **Set Start on map**, then click the map. Click **Set End on map**, then click somewhere else. Click **Plan route** — see Shortest vs Private routes with the "N cameras avoided" diff line.

To stop Valhalla: `npm run valhalla:down`.

### Offline development (no internet for dataset)

Set the local-seed flag to use the bundled 12-camera Atlanta seed instead of fetching the live dataset:
```bash
VITE_USE_LOCAL_SEED=true npm run dev
```

## Data

Camera data is built nightly by a [GitHub Action](.github/workflows/build-camera-dataset.yml) from two sources:
- **DeFlock** (deflock.me) — ALPR-focused dataset, published as static JSON tiles on Cloudflare CDN. See [`scripts/build-dataset/DEFLOCK-ARCHITECTURE.md`](scripts/build-dataset/DEFLOCK-ARCHITECTURE.md) for upstream details.
- **OpenStreetMap** — broader surveillance camera coverage via Overpass API.

Output: `cameras-us.json` + `cameras-us.json.meta.json` (manifest) + per-city subsets, published as GitHub Release assets at [releases/latest](https://github.com/stevenkozeniesky02/flock-avoid/releases/latest). Free CDN-fronted by GitHub.

The merge applies a 10m proximity dedup with per-field source-preference rules (DeFlock wins ALPR conflicts; OSM wins non-ALPR conflicts). The resulting `Camera` records carry a `sources` array showing every contributing source as a trust signal.

### Building the dataset locally

```bash
# Against the committed fixtures (no network)
npm run build:dataset:fixture

# Live build (hits DeFlock CDN + Overpass — what the nightly Action does)
npm run build:dataset
```

Output lands in `./dist-dataset/` (gitignored).

### Licensing

- **Code:** [AGPL-3.0](./LICENSE) — prevents commercial enclosure; aligns with civil-liberties posture.
- **Data:** ODbL — see [LICENSE-DATA.md](./LICENSE-DATA.md) for upstream attribution and downstream obligations.

## Tests

```bash
npm test                  # unit + integration (integration tests skip-warn if Valhalla is down)
npx playwright test       # privacy invariants + Atlanta benchmark (skip if Valhalla is down)
```

Fast unit-only run:
```bash
npx vitest run tests/unit
```

**Behavior when Valhalla isn't reachable:** integration tests and Playwright tests detect the unhealthy server in `beforeAll` and skip / early-return with a clear console message. The unit tests still run, so CI stays green even if Valhalla is down.

## If `build-valhalla-tiles.sh` fails with `502`/`503` from Geofabrik

[download.geofabrik.de](https://download.geofabrik.de) is having an outage. Wait a few minutes and re-run. If it stays down, edit `docker-compose.yml` and change `tile_urls` to a working mirror (e.g. `https://download.openstreetmap.fr/extracts/north-america/us/georgia.osm.pbf`), then `npm run valhalla:down && ./scripts/build-valhalla-tiles.sh`. The same mirror trick applies to the full-US build — see [docs/VALHALLA.md](docs/VALHALLA.md#mirrors) for the maintained list.

## Layout

```
src/
├── domain/         # Camera (v3), ThreatProfile, Route, CameraTypeDefaults
├── data/           # CameraStore, ResolvedCamera, DatasetManifest
├── routing/        # ConePolygon, coneFromProfile, Valhalla client, Router, RouteScorer
├── privacy/        # Network host allowlist
└── ui/             # MapView, ProfilePicker, CustomProfileEditor, RoutePlanner, DatasetFreshness
scripts/
└── build-dataset/  # GH Action pipeline (fetchers, normalizer, merge, validate, publish)
tests/
├── unit/           # Vitest, pure-logic tests (jsdom for ui/)
├── integration/    # Vitest hits live Valhalla / fixture-mode pipeline
├── privacy/        # Playwright network-allowlist invariants
└── benchmark/      # Playwright per-city + aggregate routing-quality benchmark
```

## Privacy

This app's privacy stance is enforced by structure, not just policy:
- Routing computation runs server-side via locally-hosted Valhalla; trip endpoints go to `localhost:8002` only (routed through the Vite dev proxy at `/valhalla` for same-origin compliance)
- Browser → camera dataset fetches go to GitHub Release CDN (`github.com` + `objects.githubusercontent.com`)
- Map tiles fetched from `*.tile.openstreetmap.org`
- No analytics, no telemetry, no third-party scripts

The privacy-invariant Playwright tests (`tests/privacy/networkInvariants.spec.ts`) enforce that the running app makes no requests to any host outside this allowlist, and that the route request body carries no user/session identifiers.
