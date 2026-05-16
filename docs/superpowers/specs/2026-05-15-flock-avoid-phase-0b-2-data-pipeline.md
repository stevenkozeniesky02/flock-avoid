# Flock-Avoid — Phase 0b-2: DeFlock + OSM Data Pipeline

**Status:** Draft for review
**Author:** Steven (with Claude as AI cofounder)
**Date:** 2026-05-15
**Parent spec:** [`2026-05-15-flock-avoid-design.md`](./2026-05-15-flock-avoid-design.md)
**Prior phase:** Phase 0b-1 (merged to master; routing quality validated end-to-end with 76 tests + 4 Playwright)

---

## 1. Why this exists

Phase 0a + 0b-1 shipped a working surveillance-aware router with the right costing math and graceful degradation. But it consumes a **12-camera hand-curated Atlanta seed**. That's enough to validate the math; it's not enough to be a product. Phase 0b-2 replaces the seed with a **nightly-refreshed, deduplicated, all-US dataset** combining the two real US camera databases (DeFlock + OSM), distributed via a free GitHub Releases CDN.

This phase is data-only. It does NOT touch the routing math, costing model, UI, or product shape. Its single deliverable is: the app boots against thousands of real cameras across multiple US cities, refreshed daily, with no operational overhead beyond a GitHub Action running on cron.

The reframed Phase 0b-3 ("Real Map Product") comes AFTER this — designing search, directions, cone visualization, and brand UI against real data density (not 12 toys).

## 2. Scope

**In:**
- GitHub Action that runs nightly + on manual trigger
- Two source fetchers: DeFlock public API + OSM Overpass (`man_made=surveillance` within US bounding box)
- Normalizer per source → our `Camera` schema
- 10m proximity dedup merge with deterministic source-preference rules
- Schema validator + sanity bounds (lat/lon in valid US range, etc.)
- Output: `cameras-us.json` + `cameras-us.json.meta.json` (manifest) + per-city subsets
- Published as GitHub Release assets on each successful run
- Public GitHub repo setup (required for free CDN access)
- Camera schema bump to v3 with new `sources: string[]` field
- CameraStore back-compat with v2 schema (existing seed JSON still loads)
- Small "Data: X hours old · refresh" indicator in the sidebar
- Benchmark corpus expanded to 5 cities × 3 routes = 15 routes
- Aggregate benchmark spec asserting spec's property targets

**Out (deferred):**
- Reframed Phase 0b-3 (Real Map Product — search, directions, cones-on-map, brand UI, mobile)
- Real-time data updates / live-ping relay (Phase 1)
- Contribute-back to OSM (Phase 1, with user submissions)
- ML camera-orientation detection (Phase 1+)
- Per-region progressive loading on mobile (Phase 0b-3 / Phase 1)
- International data (Phase 1+)
- Self-hosted vector map tiles (Phase 0b-3)

## 3. Architecture

```
┌─────────────────────────────────────────────────────┐
│ GitHub Action (nightly cron + workflow_dispatch)    │
│                                                     │
│  fetch DeFlock API ──┐                              │
│                      ├─► normalize ─► merge ─► validate ─► publish
│  fetch OSM Overpass ─┘    (per-type)  (10m dedup)
└───────────────────────────────────────────┬─────────┘
                                            ▼
                          GitHub Release: cameras-us.json
                                          + cameras-us.json.meta.json
                                          + cameras-by-city/<slug>.json
                                            │
                                            ▼
                          App fetches latest release URL via GitHub CDN
                                            │
                                            ▼
                          CameraStore.loadFromUrl handles v3 schema
```

### 3.1 Pipeline runtime

- **Where:** `ubuntu-latest` GitHub Actions runner, Node 20
- **When:** `schedule: cron '0 7 * * *'` (07:00 UTC ≈ 02:00 ET, low US traffic) + `workflow_dispatch` for on-demand reruns
- **Time budget:** target < 5 minutes per run (free-tier limits are 6 hours; we're well within)
- **Failure handling:** if EITHER source fetch fails or merge validation fails, the Action exits non-zero and does NOT publish a new Release. The previous Release stays the latest, so clients keep working against the last good dataset.
- **Observability:** Action run history + a status badge in the repo README + a Slack/Discord/email notification on N consecutive failures (use GH Actions' built-in failure notifications)

### 3.2 Distribution

- **Free path (v1):** GitHub Releases. URL pattern:
  `https://github.com/<owner>/flock-avoid/releases/download/dataset-<YYYYMMDD>/cameras-us.json`
  and the stable "latest" URL:
  `https://github.com/<owner>/flock-avoid/releases/latest/download/cameras-us.json`
- **Future (Phase 0b-3 or beyond):** Cloudflare R2 + custom domain (e.g., `data.flock-avoid.org/cameras-us.json`). Migration is a one-URL change in `app.ts`; the Action keeps publishing to both endpoints during transition.

## 4. File Structure (new + modified)

```
.github/workflows/
  build-camera-dataset.yml      # NEW: nightly cron + manual workflow_dispatch
scripts/
  build-dataset/
    fetch-deflock.ts            # NEW: pages DeFlock's public API
    fetch-osm.ts                # NEW: Overpass QL query for US bbox
    normalize.ts                # NEW: maps each source's schema → our Camera type
    merge.ts                    # NEW: 10m dedup + source-preference rules
    validate.ts                 # NEW: schema validation, sanity bounds
    publish.ts                  # NEW: emits JSON + manifest + per-city subsets
    run.ts                      # NEW: pipeline entry point
    cities.ts                   # NEW: city slug → bounding box (5 cities for now)
    fixtures/                   # NEW: committed fixture API responses for tests
      deflock-sample.json
      osm-sample.json
src/domain/
  camera.ts                     # MODIFY: add `sources: readonly string[]`
src/data/
  cameraStore.ts                # MODIFY: parse v3 + v2 schemas
  datasetManifest.ts            # NEW: parses + exposes manifest
src/ui/
  datasetFreshness.ts           # NEW: small "Data: X hours old" indicator
public/data/
  cameras-atlanta-seed.json     # KEEP for offline dev (FLOCKAVOID_USE_LOCAL_SEED=true)
tests/
  unit/
    build-dataset/
      normalize-deflock.test.ts # NEW
      normalize-osm.test.ts     # NEW
      merge.test.ts             # NEW
      validate.test.ts          # NEW
    data/
      cameraStore.test.ts       # MODIFY: cover v3 schema + back-compat
      datasetManifest.test.ts   # NEW
  integration/
    build-dataset/
      pipeline.test.ts          # NEW: e2e against fixtures
  benchmark/
    helpers/
      benchmarkHarness.ts       # NEW: programmatic API
    routes/
      atlanta.spec.ts           # NEW: 3 routes
      memphis.spec.ts           # NEW: 3 routes
      detroit.spec.ts           # NEW: 3 routes
      dallas.spec.ts            # NEW: 3 routes
      sanfrancisco.spec.ts      # NEW: 3 routes
    aggregate.spec.ts           # NEW: asserts spec property targets
README.md                       # MODIFY: GH Actions status badge, dataset link
```

## 5. Data Sources

### 5.1 DeFlock

- **Architecture (confirmed 2026-05-16):** DeFlock publishes all camera data as static JSON tile files on Cloudflare R2 CDN — there is no live camera query API. The Fastify API at `api.deflock.me` handles only geocoding and contact forms.
- **Fetch flow (two steps):**
  1. GET `https://cdn.deflock.me/regions/index.json` → returns `{ tile_url, tile_size_degrees: 20, regions: ["lat/lon", ...], expiration_utc }`. Filter `regions` to tiles intersecting the US bounding box.
  2. For each US tile: GET the URL from `tile_url` with `{lat}/{lon}` substituted → returns a JSON array of camera records.
- **Record shape:** `{ id: number, lat: number, lon: number, tags: { manufacturer?: string, direction?: string, "camera:direction"?: string, operator?: string, brand?: string } }`. No top-level `type` field exists — type is inferred from `tags.manufacturer` / `tags.operator`.
- **Fields used:** `lat`, `lon`, `tags.manufacturer` (mapped to our `CameraType` via vendor table in `normalize-deflock.ts`), `tags.direction` or `tags["camera:direction"]` (when present)
- **Confidence:** DeFlock carries no numeric confidence field; assign fixed `confidence: 0.7` to all DeFlock records.
- **Pagination:** None — each tile file is a self-contained array. Fetch all US tiles in parallel (≤5 concurrent requests as CDN courtesy).
- **Auth required:** None. No API key, no rate-limit documentation found.
- **License:** Camera data originates from OpenStreetMap (DeFlock is an OSM rendering layer); data license is **ODbL 1.0**. Compatible with our AGPL-3.0 + ODbL-data stance. Documented in `LICENSE-DATA.md`.
- **Full details:** `scripts/build-dataset/DEFLOCK-ARCHITECTURE.md`

### 5.2 OSM Overpass

- **Endpoint:** `https://overpass-api.de/api/interpreter` (public instance; consider rotation across multiple Overpass mirrors to avoid rate limits)
- **Query:**
  ```overpass
  [out:json][timeout:120];
  (
    node["man_made"="surveillance"](bbox-of-US);
    way["man_made"="surveillance"](bbox-of-US);
  );
  out center;
  ```
- **Fields used:** OSM tags `man_made=surveillance`, `surveillance:type`, `camera:type`, `camera:mount`, `direction`, `surveillance:zone`. Mapping to our `CameraType` per `scripts/build-dataset/normalize.ts` (committed table; reviewable).

### 5.3 Mapping tables

Each source has its own normalizer that maps raw fields → `Camera`:

**DeFlock `tags.manufacturer` → our `CameraType`:**

The actual DeFlock field is `tags.manufacturer` (free-text OSM tag, case-insensitive). Match by case-insensitive substring.

| `tags.manufacturer` value | Our type |
|---|---|
| `"Flock Safety"` | `alpr_private` if `tags.operator` absent or is HOA/commercial entity; `alpr_government` if `tags.operator` is a government/law-enforcement entity |
| `"Motorola Solutions"` / `"motorola"` | `alpr_government` |
| `"Rekor"` | `alpr_government` |
| `"Genetec"` | `alpr_government` |
| `"Axon"` | `alpr_government` |
| `"Leonardo"` | `alpr_government` |
| `"Unknown"` / absent | `alpr_government` (conservative default) |

**OSM tag combination → our `CameraType`:**
| OSM tags | Our type |
|---|---|
| `surveillance:type=ALPR` or `surveillance=ALPR` | `alpr_government` |
| `surveillance:type=public` + `camera:type=fixed` | `cctv_municipal` |
| `highway=traffic_signals` near node, `surveillance=traffic_enforcement` | `cctv_dot_traffic` |
| `surveillance=public` + `surveillance:type=red_light` | `red_light_camera` |
| `surveillance=public` + `surveillance:type=speed` | `speed_camera` |
| `surveillance=*` + no specific subtype | `cctv_municipal` (default fallback) |

The mapping table is versioned in `scripts/build-dataset/normalize.ts` so changes are reviewable in PRs.

## 6. Merge Logic (locked)

| Rule | Value |
|---|---|
| **Match radius** | 10m (smaller than typical inter-camera spacing but accounts for ~5m GPS jitter; user-confirmed against real "multiple cameras in same parking lot" cases) |
| **Type preference (ALPR)** | DeFlock wins |
| **Type preference (non-ALPR)** | OSM wins |
| **Direction conflict** | Prefer `directionConfidence: 'known'`; if both, prefer DeFlock |
| **Range / FOV conflict** | Prefer explicit value over default; if both, prefer DeFlock |
| **Confidence** | `max(deflock.confidence, osm.confidence)` |
| **Primary `source` field** | The source that "won" the type resolution |
| **`sources` array** (new) | All contributing sources, sorted alphabetically |
| **ID generation** | Stable hash of `(lat_rounded_5, lon_rounded_5, type)` so the same physical camera keeps the same ID across daily refreshes (matters for browser cache + future favorites) |

**Per-field winner clarification:** The merge produces a single `Camera` record per match-cluster. For each field (type, direction, range, fov, confidence), the winner is chosen independently per the rules above — so a merged record might take `type` from DeFlock, `direction` from OSM (if DeFlock didn't provide one), and `confidence` as the max of both. The `sources` array lists every source that contributed ANY field to the merged record.

## 7. Data Shape (Schema v3)

### 7.1 Camera type extension

```ts
export interface Camera {
  // ...existing v2 fields (id, type, lat, lon, confidence, source, direction?, rangeMeters?, fovDegrees?, directionConfidence?)
  readonly sources: readonly ('deflock' | 'osm' | 'seed' | 'submission' | 'foia')[];
}
```

The existing `source` field becomes "primary source" (the source that won the type resolution). The new `sources` array shows EVERY contributing source — surfaced in UI as a trust signal ("Confirmed by: DeFlock + OSM").

### 7.2 Dataset manifest

```ts
export interface DatasetManifest {
  readonly schemaVersion: 3;
  readonly generatedAt: string; // ISO 8601 timestamp
  readonly totalCameras: number;
  readonly sourceCounts: {
    readonly deflock: number;
    readonly osm: number;
    readonly merged: number; // count of records where sources.length > 1
  };
  readonly dedupStats: {
    readonly duplicatesCollapsed: number;
    readonly matchRadiusMeters: 10;
  };
  readonly buildRunUrl: string; // GitHub Action run URL for traceability
}
```

### 7.3 Back-compat with v2

`CameraStore.loadFromUrl` accepts both v2 (no `sources`) and v3 (with `sources`). When v2 is loaded, `sources` is synthesized as `[source]`. This lets the local Atlanta seed (v2) keep working during dev without forcing a rewrite.

## 8. Client Integration

- App constant `CAMERA_DATASET_URL` switches from `/data/cameras-atlanta-seed.json` to:
  `https://github.com/<owner>/flock-avoid/releases/latest/download/cameras-us.json`
- Env flag `VITE_USE_LOCAL_SEED=true` reverts to the local 12-camera seed for offline development
- A new `src/ui/datasetFreshness.ts` mounts a small indicator in the sidebar:
  > Data: 14 hours old · [refresh]
  The "refresh" button forces a `?cb=<timestamp>` cache-busting fetch
- Camera detail tooltip (hover) extends to show `sources` as text:
  > ALPR (atl-001) · Confirmed by: DeFlock + OSM

## 9. Cities (for per-city subsets + benchmark)

```ts
// scripts/build-dataset/cities.ts
export const BENCHMARK_CITIES = [
  { slug: 'atlanta',      bbox: { minLat: 33.62, minLon: -84.55, maxLat: 33.89, maxLon: -84.28 } },
  { slug: 'memphis',      bbox: { minLat: 35.00, minLon: -90.20, maxLat: 35.25, maxLon: -89.85 } },
  { slug: 'detroit',      bbox: { minLat: 42.25, minLon: -83.30, maxLat: 42.45, maxLon: -82.91 } },
  { slug: 'dallas',       bbox: { minLat: 32.62, minLon: -97.00, maxLat: 33.02, maxLon: -96.55 } },
  { slug: 'sanfrancisco', bbox: { minLat: 37.70, minLon: -122.52, maxLat: 37.83, maxLon: -122.36 } },
];
```

Per-city subsets are bbox-clipped from the merged dataset and published as separate Release assets (`cameras-by-city/atlanta.json` etc.) for future per-region loading.

## 10. Testing Strategy

| Layer | New coverage |
|---|---|
| **Unit — `normalize-deflock`** | DeFlock vendor → CameraType mapping; null/missing fields handled; lat/lon validity bounds |
| **Unit — `normalize-osm`** | OSM tag combinations → CameraType mapping; ways resolved to centroids; missing direction stays `directionConfidence: 'unknown'` |
| **Unit — `merge`** | 10m dedup boundary (entries at 9m merge, at 11m stay separate); type preference rules; direction conflict resolution; `sources` array correctness |
| **Unit — `validate`** | Catches obviously bad data (lat out of US range, nonsense type, missing required fields); doesn't reject valid edge cases |
| **Unit — `datasetManifest`** | Parses + exposes timestamp, source counts |
| **Unit — `cameraStore`** | v3 schema loads; v2 schema also loads with synthesized `sources` |
| **Integration — `pipeline`** | End-to-end run against committed fixtures (`fetch-*` mocked); asserts output JSON + manifest + per-city subset counts |
| **Operational — Action smoke test on every PR** | Run pipeline against fixtures (NOT live APIs) on every PR; fail PR if pipeline regresses |
| **Benchmark** | 5 cities × 3 routes; aggregate spec asserts spec's property targets |

### Benchmark constraint

Full all-US Valhalla tiles are ~10GB to build. Three-mode solution:
- **Local dev:** still uses Georgia-only Valhalla (works for Atlanta benchmark only)
- **CI nightly:** runs against a separate Valhalla container with full-US tiles, cached between runs
- **CI per-PR:** runs only the Atlanta benchmark (fast feedback on routing regressions)

`tests/benchmark/helpers/benchmarkHarness.ts` reads `VALHALLA_URL` env var to support both. Cities tests skip via the same pattern as Phase 0b-1's "Valhalla not reachable" guard, but with a city-specific message ("Memphis benchmark skipped — full-US Valhalla not available").

## 11. Public Repo Setup

Required prerequisites (handled in plan Task 0):
- Create public GitHub repo `<owner>/flock-avoid`
- Push current `master` (Phase 0a + 0b-1 work)
- Configure repo secrets if any (none required for v1 — DeFlock + OSM are public APIs)
- Configure branch protection on `main` (require status checks, no direct push)
- Add LICENSE file — **AGPL-3.0** (code). Aligns with civil-liberties + open-source posture and prevents commercial enclosure. Note: source data inherits its upstream licenses (DeFlock + OSM are both ODbL); document this separately in `LICENSE-DATA.md`.
- Add basic CONTRIBUTING.md pointing to design docs

## 12. Operational Concerns

| Concern | Mitigation |
|---|---|
| **DeFlock API breaks / changes shape** | Schema validation in `normalize-deflock`; pipeline fails closed (no new release); fixture tests catch breaking changes during PR |
| **Overpass rate-limits** | Use multiple Overpass mirror endpoints with fallback; exponential backoff; if all fail, exit non-zero (don't publish stale-source dataset) |
| **License revocation** (DeFlock changes terms) | Action checks for a `LICENSE-OK` flag in DeFlock's API docs at run time; exits if changed; surfaces via repo Issue |
| **Coordinate-poisoning attack** (malicious DeFlock contributor) | Validator caps cameras-per-square-km at a sane density; outliers logged for review (not auto-blocked) |
| **GitHub Releases storage limit** | Each release ~50MB max; we keep last 30 releases (~1.5GB); old releases auto-deleted by a cleanup step in the Action |
| **CDN cache invalidation** | "latest" URL is GitHub-managed; cache TTL is short. Clients can bust cache with `?cb=` query param |

## 13. Open Questions / Deferred Decisions

- Exact DeFlock API endpoint shape — pipeline implementation should probe at write-time and may need adjustment after first real fetch
- Whether to ship per-state subsets in addition to per-city (probably not for v1 — file count grows quickly)
- Whether to add a community-edits log file (Phase 1 / submission feature concern)

**Decisions locked during review:**
- **License: AGPL-3.0** for code; data inherits ODbL from DeFlock + OSM (documented in `LICENSE-DATA.md`)
- **Failure notifications:** GitHub Actions' built-in email to repo owner + status badge in README. Swap to Slack/Discord/uptime-page later if team grows or public status is needed.

## 14. Success Criteria

Phase 0b-2 is done when:
- A nightly Action runs and successfully publishes a new GitHub Release for ≥ 5 days in a row
- Merged dataset contains ≥ 5,000 cameras (sanity check that we're not silently dropping most of the data)
- Manifest is published alongside the dataset and is parseable by the client
- App boots against the live GitHub Release URL in production
- `VITE_USE_LOCAL_SEED=true` falls back to the 12-camera Atlanta seed for offline dev
- The 15 city benchmarks pass the spec's property assertions:
  - **Commuter** median: ≤10% extra time, ≥50% ALPRs avoided on the shortest path
  - **Activist** median: ≤20% extra time, ≥75% ALPRs avoided
  - **Vulnerable** median: ≥90% ALPRs avoided (extra time may be unbounded)
- No regression in Phase 0a / 0b-1 tests (76 vitest + 4 Playwright all still pass)
- Repository is public on GitHub with the GH Actions status badge on README
