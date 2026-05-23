# Valhalla operator guide

> Operator-facing reference for the local Valhalla routing container. For design
> rationale and decision history see
> [`docs/superpowers/specs/2026-05-22-flock-avoid-phase-0b-3b-full-us-valhalla.md`](superpowers/specs/2026-05-22-flock-avoid-phase-0b-3b-full-us-valhalla.md).

## TL;DR

- **Default:** `./scripts/build-valhalla-tiles.sh` — Atlanta-area routing via a Georgia OSM extract. ~250 MB download, 10–20 min first run, 1.4 GB on disk. Right for almost all development.
- **Nationwide:** `./scripts/build-valhalla-tiles-us.sh` — continental US routing via the Geofabrik `us-latest` extract. ~9 GB download, 4–10 hours first run, ~30–40 GB tile graph plus ~80 GB working space during the build. Right for end-to-end verification, cross-city tests, and production-shaped local work.

Both modes run in the same Vite proxy slot (`/valhalla` → `localhost:8002`). Only one Valhalla can hold port 8002 at a time. Bring one down before bringing the other up.

---

## Modes

| | Default (Atlanta) | Full continental US |
|---|---|---|
| Bring-up command | `npm run valhalla:up` (or `./scripts/build-valhalla-tiles.sh`) | `./scripts/build-valhalla-tiles-us.sh` (or `npm run valhalla:build-tiles:us`) |
| Teardown | `npm run valhalla:down` | `npm run valhalla:down:full-us` |
| OSM extract | `download.geofabrik.de/north-america/us/georgia-latest.osm.pbf` (~250 MB) | `download.geofabrik.de/north-america/us-latest.osm.pbf` (~9 GB) |
| Tile directory | `./valhalla_tiles/` | `./valhalla_tiles_us/` |
| Container name | `flock-avoid-valhalla` | `flock-avoid-valhalla-us` |
| Bound port | `127.0.0.1:8002` | `127.0.0.1:8002` (same — only one mode at a time) |
| First-run wall clock | 10–20 min | 4–10 hours |
| Subsequent boots | seconds | minutes |
| Disk: peak during build | ~2 GB | 80–120 GB |
| Disk: steady state | ~1.4 GB | ~30–40 GB |
| Docker memory: recommended | 2 GB | 8–16 GB |
| Routing coverage | Atlanta metro only | All of CONUS |

The "peak during build" figures account for the unpacked PBF, intermediate graph files, and the final tile tar. Plan for ~100 GB free disk and an 8 GB Docker memory limit before starting the full-US build.

---

## Prerequisites for the full-US build

Run these checks before kicking off `./scripts/build-valhalla-tiles-us.sh`:

```bash
# At least 120 GB free in the partition that holds ./valhalla_tiles_us/
df -h .

# Docker has 8 GB+ memory and 4+ CPUs available
docker info | grep -iE 'memory|cpus'

# Nothing else is bound to 127.0.0.1:8002
docker ps --filter "publish=8002" --format '{{.Names}} ({{.Image}})'
```

If `docker ps` lists `flock-avoid-valhalla`, stop it first:

```bash
npm run valhalla:down
```

The Georgia tiles in `./valhalla_tiles/` stay where they are — switching back later is fast.

---

## Workflow: starting the default (Atlanta) container

```bash
./scripts/build-valhalla-tiles.sh
```

First run downloads the Georgia PBF and builds tiles in `./valhalla_tiles/`. Subsequent runs detect the existing tile tar and boot the server in seconds. The script waits up to 30 minutes for `/status` to return 200 and then exits with the server's status payload.

When you're done:

```bash
npm run valhalla:down
```

---

## Workflow: starting the full-US container

```bash
# Stop the Atlanta container if it's running
npm run valhalla:down

# Start the full-US build (prints the resource warning, sleeps 10 seconds, then exec's the main script)
./scripts/build-valhalla-tiles-us.sh
```

Tail logs from another terminal:

```bash
docker logs -f flock-avoid-valhalla-us
```

The script waits up to 3 hours for `/status` to return 200. If your machine is slower than that, leave the container running and watch `docker logs` until you see `serving tiles on port 8002`; the wrapper script timing out does not stop the container.

When you're done:

```bash
npm run valhalla:down:full-us
```

The tiles stay in `./valhalla_tiles_us/`, so the next boot is fast.

---

## Verifying

Once the container reports ready, sanity-check a route inside the area your tiles cover.

**Atlanta tiles (Georgia mode):** any pair of points within Atlanta metro works. The README example is fine.

**Full-US tiles:** confirm coverage outside Georgia with a Memphis → Nashville request:

```bash
curl -s http://localhost:8002/route \
  -H 'Content-Type: application/json' \
  -d '{
    "locations": [
      {"lat": 35.1495, "lon": -90.0490},
      {"lat": 36.1627, "lon": -86.7816}
    ],
    "costing": "auto",
    "units": "kilometers"
  }' | python3 -m json.tool | head -30
```

A successful response includes `trip.legs[].maneuvers` and a non-empty `summary`. A failed response (`{"error_code": 442, "error": "No path could be found..."}`) means the requested points are outside the loaded tile graph — most likely the build hasn't finished or you started the Georgia container by mistake. Re-check `docker ps` and the container name.

---

## Switching back to Atlanta

```bash
npm run valhalla:down:full-us
npm run valhalla:up
```

The Georgia tile dir is preserved across the switch, so this comes up in seconds rather than re-running the 10–20 minute build.

---

## Running both containers at the same time

You can't. The proxy URL the rest of the app speaks (`/valhalla` → `localhost:8002`) is the contract; both modes bind the same host port. This is intentional — a single, well-known endpoint means the app does not need to know which extract is loaded, and the privacy posture stays uniform (`isAllowedUrl('http://localhost:8002')` is the only host the routing path cares about).

If you genuinely need both at once on the same machine, the right move is to clone the worktree, run a second copy on a different port (edit `docker-compose.yml`'s port binding under that worktree), and run a second Vite dev server pointed at it. That's out of scope for the default setup.

---

## If the build fails

| Symptom | Cause | Recovery |
|---|---|---|
| `curl: (7) Failed to connect to localhost port 8002` after the wait window | Container failed before binding (often OOM) | `docker logs flock-avoid-valhalla-us` — look for `Killed` near the end. Raise Docker's memory limit (Docker Desktop → Settings → Resources) and re-run. |
| `No space left on device` mid-build | Working space exhausted | `df -h .` while the build runs; the working set is much larger than the final tar. Move `./valhalla_tiles_us/` to a partition with more room (point `VALHALLA_TILES_DIR` at the new location) and rebuild. |
| `502 Bad Gateway` or `503 Service Unavailable` during the PBF download | Geofabrik outage | Wait a few minutes; if it stays down, see [Mirrors](#mirrors) below. |
| Container reports ready but every `/route` returns `error_code: 442` | Tiles built for the wrong extract, or partial state | `docker compose down` and `rm -rf valhalla_tiles_us/` (irreversible — verify you mean it), then rebuild. |
| Build completes but takes 24+ hours | Slow disk or single-core throttling | Move the tile dir to an SSD; raise Docker's CPU allocation. The build is I/O- and CPU-bound during the graph phase. |

If `docker logs` is too noisy to read, the relevant lines are the last 100:

```bash
docker logs --tail 100 flock-avoid-valhalla-us
```

---

## Mirrors

If `download.geofabrik.de` is down, the following mirrors host the same extracts:

- `https://download.openstreetmap.fr/extracts/north-america/us-latest.osm.pbf` — OpenStreetMap France mirror.
- BBBike (`extract.bbbike.org`) offers custom bounding-box extracts; for a true `us-latest` substitute use one of the above.

Override the URL by exporting `VALHALLA_TILE_URLS` before running the build script (or by editing `.env`):

```bash
VALHALLA_TILE_URLS=https://download.openstreetmap.fr/extracts/north-america/us-latest.osm.pbf \
VALHALLA_TILES_DIR=./valhalla_tiles_us \
VALHALLA_CONTAINER_NAME=flock-avoid-valhalla-us \
./scripts/build-valhalla-tiles.sh
```

---

## What this doesn't cover

- **Alaska, Hawaii, US territories** are excluded from Geofabrik's `us-latest`. To include them, comma-separate additional URLs in `VALHALLA_TILE_URLS` (the gisops image accepts a list) and rebuild from scratch.
- **Canada and Mexico** are likewise excluded. Cross-border routing requires adding those countries' extracts.
- **Tile rebuild scheduling.** Geofabrik refreshes extracts daily upstream, but the local container does not auto-rebuild. Operator concern.
- **Production hosting.** This doc covers the local dev workflow only. Sub-project E (deployment) owns the production-side reverse proxy, TLS, and tile distribution story.

---

## Cross-city benchmarks

The Playwright spec files at `tests/benchmark/routes/{memphis,detroit,dallas,sanfrancisco}.spec.ts` will continue to **skip** even after a successful full-US build. The remaining blocker is the benchmark harness itself: it currently hard-codes pixel-coordinate map clicks against the default (Atlanta-centered) viewport, so without a search-and-flyTo step it would simply route inside Atlanta regardless of which city's spec file is running. Wiring centering through the harness is a separate sub-project; Sub-project C (this doc) delivers the tile-coverage half of the prerequisite.
