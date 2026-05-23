# Flock-Avoid — Phase 0b-3b · Sub-project C: Full-US Valhalla setup

**Status:** Draft for review
**Author:** Steven (with Claude as AI cofounder)
**Date:** 2026-05-22
**Parent spec:** [`2026-05-15-flock-avoid-design.md`](./2026-05-15-flock-avoid-design.md)
**Prior sub-projects:**
- Sub-project A — Wayfinding UX (PR #3 / PR #4 stacked, branch `feat/phase-0b-3b-wayfinding`)
- Sub-project B — Turn-by-turn directions (PR #5 stacked on A, branch `feat/phase-0b-3b-directions`)
**Stacks on:** `feat/phase-0b-3b-directions`
**Branch:** `feat/phase-0b-3b-full-us-valhalla`

---

## 1. Why this exists

The app has a working route planner, a v0.2 wayfinding UI with Photon search, live device location, a route comparison summary, and a directions panel that lists per-maneuver instructions. The camera dataset already covers the entire continental United States (92k sensors as of the first nightly Action run). The dataset can answer "where are the cameras in Memphis?"; the wayfinding UI can find Memphis on the map and place waypoints there; the directions panel knows how to format whatever Valhalla returns.

But routing itself only works in the Atlanta metro. The Valhalla container loads a Georgia OSM extract (`georgia-latest.osm.pbf`, ~250 MB), which means any `/route` request whose endpoints fall outside the Georgia tile graph returns a `no_route_found` (Valhalla error 442) or "out of bounds" failure. A user in Memphis who types their address into the planner gets a polite degradation panel and zero utility from the product.

Sub-project C makes routing work nationwide. It is infrastructure work — no new UI, no new domain types, no new browser-facing endpoints. The deliverable is a switchable container configuration that can serve tiles for the entire continental US, the operator documentation needed to actually run that build (disk, RAM, time, gotchas), and the tests left in a state that re-enables themselves once the tiles are present.

This is also the **smallest discrete unit** of "make the app work outside Atlanta." Cross-city benchmark accuracy and offline tile bundling are bigger questions that depend on this landing first.

## 2. Scope

**In:**

- A parameterized `docker-compose.yml` whose default behavior is **identical to today** (Georgia tiles, `./valhalla_tiles`, container name `flock-avoid-valhalla`) and that can be switched to a full continental US build via two env vars (`VALHALLA_TILE_URLS`, `VALHALLA_TILES_DIR`).
- An npm script (`npm run valhalla:up:full-us`) that boots the full-US variant in a sibling tile directory (`./valhalla_tiles_us/`) without disturbing the Georgia container or its tiles.
- A dedicated build wrapper (`scripts/build-valhalla-tiles-us.sh`) that orchestrates the full-US download + build with an honest, multi-hour readiness timeout and operator-friendly progress hints.
- An operator-facing doc (`docs/VALHALLA.md`) covering: when to pick which mode, exact disk / RAM / time requirements, how to start, how to verify, how to switch, and how to clean up.
- A `.env.example` at the repo root that documents the toggle.
- Updated `.gitignore` patterns to cover both the Georgia and full-US tile directories (the existing `valhalla_tiles/` pattern broadens to `valhalla_tiles*/`).
- Skip-message refresh on the four cross-city benchmark spec files (`memphis`, `detroit`, `dallas`, `sanfrancisco`) to reference the new operator doc instead of the abstract "full-US Valhalla container".
- Brief README update pointing at `docs/VALHALLA.md` for the full-US path.

**Out (this sub-project):**

- **Actually running the full-US tile build inside this PR.** Building US tiles is a multi-hour, multi-tens-of-gigabytes operation. We ship the configuration and the docs; the operator decides when to spend the disk and clock time. The PR body honestly reports whether the author ran the build in their environment.
- Refactoring the benchmark harness to support cross-city centering. The cross-city specs still depend on a separate prerequisite — the harness today hard-codes pixel-coordinate map clicks against the default (Atlanta-centered) viewport, so even with full-US tiles loaded, those specs would currently route inside Atlanta. Fixing that is a small but distinct refactor (search-and-flyTo first, then click) and lives in a follow-up sub-project so this PR stays purely about Valhalla.
- Adding a tile-coverage probe helper to the harness. We could write a `probeRouteableAt(lat, lon)` helper now and wire it into the city specs, but until the centering refactor lands the helper would be dead code. Deferred to the same follow-up.
- Production hosting / managed Valhalla. Sub-project E is the public-deployment sub-project and owns that question.
- Tile-update automation (cron, scheduled rebuilds). The default Geofabrik dataset is daily-rebuilt upstream; nightly local rebuild scheduling is a separate operations concern.
- Multi-region or per-state extract optimization. We treat the US as one indivisible region for v1; per-state or per-metro tile slicing is a possible future optimization once we observe real disk/time pain.
- Routing for Alaska, Hawaii, US territories. Geofabrik's `us-latest` excludes these; bringing them in would require adding their separate extracts to `tile_urls` (Valhalla accepts a comma-separated list). Documented as a follow-up; not enabled by default.

## 3. Decisions captured during design

| Question | Decision | Why |
|---|---|---|
| Single compose file vs two? | One `docker-compose.yml`, parameterized with env defaults. | Zero migration for existing dev setups; one file to read; the existing `valhalla:up` script keeps working unchanged. Two compose files would double the surface area for a single-line behavioral diff. |
| Share tile directory between Georgia + US modes? | No — separate dirs (`./valhalla_tiles/`, `./valhalla_tiles_us/`). | The gisops/docker-valhalla image detects existing tiles and tries to reuse them; mixing Georgia + US tiles in one mount is the kind of "looks fine, returns wrong routes" silent-failure mode this project must not ship. Separation also lets a developer keep Atlanta routing usable while a multi-hour US build is in flight (on a different machine, or after destroying the US container). |
| Container name collision when switching? | The full-US mode runs in a differently-named container (`flock-avoid-valhalla-us`). | Same reason: the two configs are not interchangeable. Different names mean the operator can have both present (one of the two is "up" at a time, since they share port 8002 — see below). |
| Both containers up simultaneously? | No — port `127.0.0.1:8002` is the contract the rest of the app depends on. Only one Valhalla can bind it at a time. | The Vite proxy at `/valhalla` is hard-coded to `localhost:8002`. Adding a second port would require app changes and is out of scope. The docs make this explicit: bring one down before bringing the other up. |
| OSM extract source | Geofabrik `north-america/us-latest.osm.pbf`. | Same provider as the existing Georgia URL (consistent operational story, same outage modes, the existing 502/503 README note generalizes). Daily-refreshed by Geofabrik; ~9 GB at time of writing. |
| Alternative extracts (BBBike, OSM planet, regional mirrors) | Documented as fallbacks in `VALHALLA.md`; not the default. | Geofabrik is the path of least surprise. The fallback list mirrors the existing README guidance for Georgia. |
| Build inside this PR? | Configuration only; build is the operator's call. | Honest: a full-US build needs ~80–100 GB working disk and 8–16 GB RAM and 4–10 hours. The author's environment for this PR has 16 GB free disk and 7.67 GB Docker RAM — too small. A correctly-configured, well-documented build is the contract; running it is a separate operational step. The PR body discloses this. |
| Network allowlist changes | None. | Valhalla is browser-reachable only via the same-origin Vite `/valhalla` proxy → `localhost:8002`. The OSM PBF download happens inside the container during `docker compose up`, not from the browser. `download.geofabrik.de` therefore stays out of the browser-facing allowlist. |
| Benchmark cross-city specs | Keep the skip; refresh the message to reference `docs/VALHALLA.md`. | The specs are blocked on TWO prereqs: (a) full-US tiles available, (b) harness supports cross-city centering. This PR delivers (a) as configuration; (b) is a separate refactor. A still-skipped test that explains *exactly* what's missing is more useful than an un-skipped test that silently passes by routing in Atlanta. |
| `force_rebuild` semantics | Stays `False` in both configs. | Mirrors current behavior. The image detects existing tiles by presence of `valhalla_tiles.tar` and avoids rebuilding. Operator can force a rebuild manually by emptying the tile dir or setting the env var, documented in VALHALLA.md. |
| `serve_tiles`, `build_admins`, `build_time_zones` | `True`, `True`, `False` — same as Georgia today. | No reason to change. Time zones are off because Flock-Avoid does not compute schedules; admin boundaries are on because Valhalla's costing uses them for some country-specific rules and the cost is negligible at build time. |

## 4. Architecture

### 4.1 What changes

```
docker-compose.yml                  PARAMETERIZE · env-driven tile_urls / mount / container_name
                                                 · defaults preserve Georgia behavior verbatim
scripts/build-valhalla-tiles.sh     MODIFY · respects VALHALLA_* env vars; keeps Georgia defaults
                                            · readiness wait loop extended to allow long builds
scripts/build-valhalla-tiles-us.sh  NEW    · wrapper that exports the full-US env vars and execs the above
package.json                        MODIFY · add valhalla:up:full-us, valhalla:build-tiles:us scripts
.env.example                        NEW    · documents the toggle env vars; copy to .env to opt in
.gitignore                          MODIFY · valhalla_tiles/ → valhalla_tiles*/
docs/VALHALLA.md                    NEW    · operator-facing build + ops doc (single source of truth)
README.md                           MODIFY · brief link to docs/VALHALLA.md
tests/benchmark/routes/dallas.spec.ts        MODIFY · skip message points at docs/VALHALLA.md
tests/benchmark/routes/detroit.spec.ts       MODIFY · same
tests/benchmark/routes/memphis.spec.ts       MODIFY · same
tests/benchmark/routes/sanfrancisco.spec.ts  MODIFY · same
```

### 4.2 What does NOT change

- `src/privacy/networkAllowlist.ts` — unchanged. No new browser-facing host.
- `vite.config.ts` — unchanged. `/valhalla` proxy still targets `localhost:8002`.
- `src/routing/valhallaClient.ts` and the rest of `src/` — unchanged. The client only knows the proxied endpoint; tile coverage is transparent at the API layer.
- The existing Georgia-mode flow: `npm run valhalla:up` and `./scripts/build-valhalla-tiles.sh` produce byte-for-byte the same container state they do today.
- `tests/benchmark/routes/atlanta.spec.ts` and `tests/benchmark/aggregate.spec.ts` — unchanged. Both still rely on Atlanta tiles and continue to use the existing `skipIfNoValhalla` guard.
- `tests/benchmark/helpers/benchmarkHarness.ts` — unchanged. (Tile-coverage probe is the follow-up sub-project's deliverable.)

### 4.3 docker-compose.yml — before / after

**Before (current):**
```yaml
services:
  valhalla:
    image: ghcr.io/gis-ops/docker-valhalla/valhalla:latest
    container_name: flock-avoid-valhalla
    ports:
      - "127.0.0.1:8002:8002"
    volumes:
      - ./valhalla_tiles:/custom_files
    environment:
      - tile_urls=https://download.geofabrik.de/north-america/us/georgia-latest.osm.pbf
      - server_threads=2
      - serve_tiles=True
      - build_admins=True
      - build_time_zones=False
      - force_rebuild=False
      - use_tiles_ignore_pbf=False
    restart: unless-stopped
```

**After:**
```yaml
services:
  valhalla:
    image: ghcr.io/gis-ops/docker-valhalla/valhalla:latest
    container_name: ${VALHALLA_CONTAINER_NAME:-flock-avoid-valhalla}
    ports:
      - "127.0.0.1:8002:8002"
    volumes:
      - ${VALHALLA_TILES_DIR:-./valhalla_tiles}:/custom_files
    environment:
      - tile_urls=${VALHALLA_TILE_URLS:-https://download.geofabrik.de/north-america/us/georgia-latest.osm.pbf}
      - server_threads=${VALHALLA_SERVER_THREADS:-2}
      - serve_tiles=True
      - build_admins=True
      - build_time_zones=False
      - force_rebuild=False
      - use_tiles_ignore_pbf=False
    restart: unless-stopped
```

Behavior with no env file: unchanged from today. Behavior with the documented `.env` (or with the env vars exported by `valhalla:up:full-us`): full-US container in a sibling tile dir, sibling container name, same port.

### 4.4 npm scripts — additions

```jsonc
{
  "scripts": {
    "valhalla:up": "docker compose up -d",
    "valhalla:up:full-us": "VALHALLA_TILE_URLS=https://download.geofabrik.de/north-america/us-latest.osm.pbf VALHALLA_TILES_DIR=./valhalla_tiles_us VALHALLA_CONTAINER_NAME=flock-avoid-valhalla-us docker compose up -d",
    "valhalla:down": "docker compose down",
    "valhalla:down:full-us": "VALHALLA_CONTAINER_NAME=flock-avoid-valhalla-us docker compose down",
    "valhalla:build-tiles": "./scripts/build-valhalla-tiles.sh",
    "valhalla:build-tiles:us": "./scripts/build-valhalla-tiles-us.sh"
  }
}
```

The two new scripts compose with the existing ones; nothing existing is renamed or replaced.

### 4.5 Operator workflow

**Dev path (default, Georgia):**
```
./scripts/build-valhalla-tiles.sh          # ~10–20 min first run, seconds thereafter
npm run dev                                # routing works in Atlanta
```

**Nationwide path:**
```
npm run valhalla:down                      # only if Georgia container is running
./scripts/build-valhalla-tiles-us.sh       # 4–10 hours first run on a beefy box; minutes thereafter
npm run dev                                # routing works anywhere in CONUS
```

**Switch back to Georgia:**
```
npm run valhalla:down:full-us
npm run valhalla:up                        # tiles already built in ./valhalla_tiles/
```

## 5. Resource budget (honest)

For the full-US Valhalla tile build via Geofabrik's `us-latest.osm.pbf`, observed in community reports and recorded in `docs/VALHALLA.md`:

| Resource | Minimum | Recommended | Notes |
|---|---:|---:|---|
| Free disk during build | 80 GB | 120 GB | Working space for the unpacked PBF, intermediate graph files, and the final tile tar. Tile tar alone is ~30–40 GB. |
| Docker memory limit | 8 GB | 16 GB | The graph-tiles step is memory-hungry; OOM kills late in the build are the most common failure mode on under-provisioned machines. |
| CPU cores | 4 | 8+ | The `build_admins` step in particular benefits from parallelism. |
| Wall clock | 4 hours | — | On 8 cores + SSD + 16 GB RAM. Slower CPUs or HDDs can easily stretch this past 10 hours. |
| Network | — | gigabit | The PBF download alone is ~9 GB. |

This table is verbatim in `docs/VALHALLA.md`. The PR body discloses whether the author's environment was capable of running the build in this PR's session.

## 6. Privacy posture

This sub-project is privacy-neutral. Specifically:

- No new browser-facing endpoint. All browser traffic continues to route via the same-origin Vite proxies. The full-US Valhalla container binds the same `127.0.0.1:8002` port; the proxy URL is unchanged.
- No new browser-facing host in `src/privacy/networkAllowlist.ts`.
- The `download.geofabrik.de` URL is reached **by the Docker container, during build**, never by the browser. The privacy invariant tests do not exercise this path because no browser request touches it.
- No new tracking, telemetry, or identifiers. The `tile_urls` env var is set in the operator's shell or .env file; nothing in the runtime app reads it.
- The route request body shape is unchanged. Existing privacy tests (`tests/privacy/networkInvariants.spec.ts`) continue to enforce that the body carries no user/session identifiers.

## 7. Testing approach

**No new tests.** The existing test surface adequately covers the contract:

- Unit + integration tests are routing-API-shape tests; they pass against either Georgia or full-US tiles transparently.
- `tests/privacy/networkInvariants.spec.ts` continues to pass — no new browser-facing host, no new request shape.
- `tests/benchmark/routes/atlanta.spec.ts` and `tests/benchmark/aggregate.spec.ts` continue to pass against either tile set; they exercise routes inside the Georgia bounding box that are present in both.
- `tests/benchmark/routes/{memphis,detroit,dallas,sanfrancisco}.spec.ts` stay skipped (this PR refreshes the skip message). They will be un-skipped in the follow-up sub-project that adds cross-city centering to the harness.
- `tests/e2e/` planner tests are Atlanta-centered and continue to pass.

What this PR explicitly does **not** add:

- A tile-coverage probe helper. Premature without the centering refactor.
- A docker-compose smoke test (`docker compose config -q`). The compose file is small and YAML-only; we trust standard parsing. If a syntax bug ships, every script in §4.4 fails immediately on first run with a clear error.

## 8. Acceptance criteria

This sub-project is "done" when:

1. `npm run valhalla:up` (no args, no env) produces the same container, same tile mount, same container name, same `/status` response as before this PR.
2. `./scripts/build-valhalla-tiles.sh` continues to work end-to-end against the existing Georgia tiles with no behavioral change.
3. `npm run valhalla:up:full-us` is defined in `package.json` and (when invoked on a sufficiently-provisioned machine, per `docs/VALHALLA.md`) starts a `flock-avoid-valhalla-us` container against `./valhalla_tiles_us/` on port 8002.
4. `./scripts/build-valhalla-tiles-us.sh` exists, is executable, downloads `us-latest.osm.pbf` into the container, and (eventually) yields a `/status` 200 with a non-empty tile graph.
5. `docs/VALHALLA.md` documents the operator workflow, the resource budget, verification commands (a sample `/route` request that should succeed against full-US tiles), and the fallback Geofabrik mirror procedure.
6. `.env.example` exists and shows the four toggle env vars with comments.
7. `src/privacy/networkAllowlist.ts` is unchanged.
8. `vite.config.ts` is unchanged.
9. The four cross-city benchmark specs continue to skip cleanly (no error), with a message pointing at `docs/VALHALLA.md`.
10. `npx tsc --noEmit` clean. `npm run lint` clean. `npm test` passes. `npx playwright test tests/privacy/ tests/e2e/` passes against the existing Atlanta container.
11. PR body discloses whether the author ran the full-US build in this session and, if not, why.

## 9. Out of scope explicitly

These are **not** part of Sub-project C:

- **Running the full-US build in CI.** CI runners have small disks and no patience for multi-hour jobs. The full-US build is an operator step.
- **Cross-city benchmark refactor.** Distinct follow-up sub-project (call it 0b-3b-D-cross-city-benchmarks or fold into Sub-project E). It needs: harness supports search-then-click for city centering; a tile-coverage probe helper; per-city un-skipping.
- **Routing outside CONUS** (Alaska, Hawaii, territories, Canada, Mexico). Documented as a possible future extension; not enabled by default.
- **Tile sharding / per-region builds.** A possible later optimization if disk pain is observed.
- **PMTiles / Protomaps migration for the basemap.** That's Sub-project D's deliverable.
- **Tile rebuild scheduling / cron.** An ops concern, not a sub-project deliverable.
- **Authentication or rate limiting on the local Valhalla.** It binds `127.0.0.1` only; reachable only from the same machine. Public deployment with appropriate controls is Sub-project E.

## 10. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Operator runs `npm run valhalla:up:full-us` while Georgia container is up; port 8002 collision. | Medium | `docs/VALHALLA.md` puts "stop the other one first" in the first three lines of the switching section. Docker's error message is also clear ("port already in use"). |
| Operator's machine doesn't have the disk/RAM headroom and the build fails mid-way, leaving partial state in `./valhalla_tiles_us/`. | Medium | `docs/VALHALLA.md` has a "if the build fails" section: how to inspect logs, how to clean up (`rm -rf valhalla_tiles_us/` + `docker compose down --volumes`), and the prerequisite checklist (`df -h`, `docker info`) before starting. |
| Geofabrik changes the URL or returns 5xx for an extended period. | Low | Mirrors documented (download.openstreetmap.fr, BBBike). The existing Georgia README note already covers this and generalizes verbatim. |
| Switching modes corrupts the existing Georgia tile dir. | Very low | The full-US mode uses a different mount (`./valhalla_tiles_us/`), so the Georgia tiles are physically unreachable from the US container. |
| A future PR accidentally hard-codes `flock-avoid-valhalla` as the container name in a script and breaks the full-US mode. | Low | `docs/VALHALLA.md` warns. The `valhalla:down:full-us` script demonstrates the env-var pattern. |
| Operator forgets to run `npm run valhalla:down` before switching, ends up with two `docker compose` projects pointing at the same compose file with conflicting state. | Low | Docs are explicit. Container-name parameterization keeps the two projects logically separate. |
| Full-US tile graph routes through low-quality OSM segments that produce odd maneuvers (very rural roads, missing speed limits). | Low (cosmetic) | This is an existing condition of OSM data; not a Flock-Avoid bug. If a user reports it, the report goes upstream to OSM. The directions panel from Sub-project B displays Valhalla's text verbatim and does not need to know whether the underlying road is well-mapped. |
| OSM extract size grows faster than expected; the resource budget in §5 goes stale. | Low | The budget table is in one place (`docs/VALHALLA.md`); a future PR updates it. |

## 11. Open questions

| Q | Default unless told otherwise |
|---|---|
| Should `valhalla:up:full-us` refuse to start if `valhalla:up` (Georgia) is already bound to port 8002? | No — let Docker's port-bind error speak for itself, documented in `docs/VALHALLA.md`. Adding pre-flight checks in npm scripts is the kind of clever helper that goes wrong six months from now when someone changes the port. |
| Should the build script add `force_rebuild=True` as an opt-in flag? | No. The image's default detection logic is good enough; operators who want to rebuild can `rm -rf` the tile dir. Documented. |
| Should the docs include an estimated S3/B2 storage cost for caching the built tiles? | Not yet. That decision belongs to Sub-project E (deployment). |
| Should we publish a pre-built full-US tile tar as a GitHub Release asset so contributors can skip the build? | Tempting; defer. Distribution license of an OSM-derived tile set is ODbL-compliant, but uploading 30+ GB to GitHub Releases needs a separate review. Out of scope here. |
| Should the resource budget table be a CI-asserted thing? | No. It's operator guidance; CI can't reliably simulate a slow disk. |
| Should Atlanta/aggregate benchmark specs detect tile coverage mismatch (e.g. running with the full-US container) and adapt? | No — the click coordinates work in both. If a future change makes them tile-coverage-sensitive, that's the moment to add a probe. |

---

**Next step after spec approval:** implement task-by-task per the companion plan (`docs/superpowers/plans/2026-05-22-flock-avoid-phase-0b-3b-full-us-valhalla.md`).
