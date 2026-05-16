# DeFlock Data Architecture (build-time)

**Researched:** 2026-05-16 (Task 1 of Phase 0b-2)
**Classification:** C — Periodic data dump (tiled GeoJSON-like JSON files hosted on Cloudflare R2 CDN)

## Findings

- URL probed: `https://deflock.me/` → HTTP 301 redirect to `https://deflock.org/` (domain migrated)
- URL probed: `https://deflock.org/` → HTTP 403 Forbidden (Cloudflare blocking direct fetch; web app loads in browser via JS)
- URL probed: `https://deflock.me/about` → HTTP 301 redirect to `https://deflock.org/about` → HTTP 403 Forbidden
- URL probed: `https://deflock.me/api/` → HTTP 301 redirect to `https://deflock.org/api/` → HTTP 403 Forbidden
- URL probed: `https://wiki.openstreetmap.org/wiki/Surveillance_under_man_made%3Dsurveillance` → HTTP 404 (page moved)
- URL probed: `https://wiki.openstreetmap.org/wiki/Tag:man_made%3Dsurveillance` → HTTP 200; confirms DeFlock is listed as a rendering application for `surveillance:type=ALPR` tagged OSM nodes; OSM data license is ODbL
- URL probed: `https://github.com/deflock` (gh search) → Wrong org; `deflock` on GitHub is an unrelated PHP/Node developer
- URL probed: `https://github.com/FoggedLens/deflock` (found via `gh search code "deflock.me"`) → HTTP 200; this is the real DeFlock source repo; LICENSE: MIT (code only); data license separate (see below)
- URL probed: `https://cdn.deflock.me/regions/index.json` → HTTP 200; returns JSON index of all available region tiles + URL template + expiration timestamp
- URL probed: `https://cdn.deflock.me/regions/20/-100.json` → HTTP 200; returns JSON array of camera records for that 20°×20° tile (1,000+ records)
- URL probed: `https://cdn.deflock.me/regions/40/-80.json` → HTTP 200; returns JSON array of camera records (1,042 records observed)

### Key source discovery
Found via `gh search code "deflock.me"`:
- Real repo: `FoggedLens/deflock` — open source, MIT license for code
- CDN URL pattern confirmed by `bmeares/bikewalkgreenville` plugin and by DeFlock's own `webapp/src/stores/tiles.ts`
- Fastify API at `api.deflock.me` only exposes geocoding, sponsors, and contact endpoints — **no camera data endpoint**; all camera data is served statically from the CDN

## Confirmed architecture

DeFlock is **Architecture C**: all camera data is pre-built and published as static JSON tile files on Cloudflare R2, served via `cdn.deflock.me`. There is no live camera query API. The pipeline works as follows: (1) fetch `https://cdn.deflock.me/regions/index.json` to get the list of available 20°×20° tile coordinates and the URL template; (2) for each tile that intersects the US bounding box, fetch `https://cdn.deflock.me/regions/{lat}/{lon}.json` (using the versioned `?v=` parameter from the index for cache coherency); (3) parse each tile's JSON array of camera records. The underlying data originates from OpenStreetMap (contributors tag cameras with `man_made=surveillance` + `surveillance:type=ALPR` and DeFlock-specific tags like `manufacturer`), then DeFlock builds and publishes the tile CDN on a regular cadence. The Fastify API server (`api.deflock.me`) handles geocoding and contact forms only — it serves no camera data.

## Endpoint(s) used by fetch-deflock.ts

- **Step 1 — Index:** `https://cdn.deflock.me/regions/index.json`
  - Method: GET
  - Auth required: none
  - Response shape:
    ```json
    {
      "expiration_utc": 1778949469,
      "tile_size_degrees": 20,
      "tile_url": "https://cdn.deflock.me/regions/{lat}/{lon}.json?v=1778945749",
      "regions": ["40/-80", "20/-100", "20/-120", "40/-100", "40/-120", "20/-80", ...]
    }
    ```
  - The `tile_url` field is the authoritative URL template (includes the versioned `?v=` param); use it directly rather than constructing URLs manually.

- **Step 2 — Per-tile fetch:** URL from `tile_url` with `{lat}` and `{lon}` substituted from entries in `regions`
  - Method: GET
  - Auth required: none
  - Response shape: JSON array of camera records (see field mapping below)
  - Pagination: none — each tile file is a complete array

- **US tile filter:** The index lists ~49 global tiles. For a US-only dataset, filter to tiles where the tile's bounding box intersects the US bounding box (`minLat: 18, minLon: -130, maxLat: 72, maxLon: -60`). As of research date, the US-relevant tiles include at minimum: `20/-120`, `20/-100`, `20/-80`, `40/-120`, `40/-100`, `40/-80`. Always derive this list from the index at runtime rather than hardcoding, as DeFlock may add tiles.

- **Rate limits:** None documented; CDN-served static files. The `bmeares` integration fetches all tiles sequentially with no throttle and reports no issues. Use modest concurrency (≤5 parallel tile fetches) as good citizenship.

- **Expiration:** The `expiration_utc` field in the index is a Unix timestamp. The tile `?v=` query param in `tile_url` is a cache-bust version tied to the same build. Re-fetch the index on every pipeline run; do not cache across runs.

## Field mapping to our Camera schema

Each tile returns an array of records with this shape:

```json
{
  "id": 51968727,
  "lat": 30.275521,
  "lon": -87.683105,
  "tags": {
    "manufacturer": "Flock Safety",
    "direction": "180",
    "camera:direction": "90",
    "operator": "Atlanta Police Department",
    "brand": "Motorola Solutions"
  }
}
```

| Source field | Our Camera field | Notes |
|---|---|---|
| `id` (number) | `id` (stable hash input) | Use as part of stable hash: `hash(lat_r5, lon_r5, type)` per merge spec; DeFlock OSM IDs shift when contributors re-tag, so do NOT use `id` directly as our stable ID |
| `lat` | `lat` | Direct mapping |
| `lon` | `lon` | Direct mapping |
| `tags.manufacturer` | input to `type` | Map via vendor table below; primary signal for `CameraType` |
| `tags.operator` | input to `type` | Secondary signal when `manufacturer` absent or `"Unknown"` |
| `tags.brand` | input to `type` | Tertiary signal; sometimes present instead of `manufacturer` |
| `tags.direction` | `direction` (degrees) | Prefer `tags.direction` over `tags["camera:direction"]` when both present (DeFlock-tagged field); parse as float; set `directionConfidence: 'known'` |
| `tags["camera:direction"]` | `direction` (degrees) | Fallback when `tags.direction` absent; same parse logic |
| (absence of direction tags) | `direction: undefined`, `directionConfidence: 'unknown'` | Many records have no direction |
| (all records from DeFlock) | `source: 'deflock'`, `sources: ['deflock']` | Before merge step |

### Vendor → CameraType mapping

| `tags.manufacturer` value | Our `CameraType` |
|---|---|
| `"Flock Safety"` | `alpr_private` if `operator` absent or is HOA/commercial; `alpr_government` if `operator` is a government/law-enforcement entity |
| `"Motorola Solutions"` / `"motorola"` | `alpr_government` |
| `"Rekor"` | `alpr_government` |
| `"Genetec"` | `alpr_government` |
| `"Axon"` | `alpr_government` |
| `"Leonardo"` | `alpr_government` |
| `"Unknown"` | `alpr_government` (conservative default) |
| absent / other | `alpr_government` (conservative default) |

**Implementation note:** The `manufacturer` value is a free-text OSM tag set by crowdsource contributors — expect capitalization variants and typos. Normalize to lowercase before matching. The full vendor list is managed in DeFlock's CMS (`cms.deflock.me/items/lprVendors`) but is not publicly enumerated via the CDN. Use a case-insensitive substring match (e.g., `"flock"` → Flock Safety) rather than exact equality.

### Confidence mapping

DeFlock has no numeric confidence field. All DeFlock records should be assigned a fixed `confidence: 0.7` (high confidence crowdsourced, but unverified by us). The merge step will use `max(deflock.confidence, osm.confidence)` per the merge spec.

### Range / FOV

DeFlock records carry no range or FOV data. Leave `rangeMeters` and `fovDegrees` as `undefined`; the merge step may inherit these from a co-located OSM record if one exists.

## License status

- **DeFlock code license:** MIT (per `FoggedLens/deflock` repo `LICENSE` file)
- **DeFlock data license:** The camera data originates from **OpenStreetMap** (DeFlock is a rendering layer over OSM contributor data). OSM data is licensed under **ODbL 1.0** (Open Database License). DeFlock's CDN re-publishes this OSM-derived data; no separate DeFlock data license was found in the repo or on the website. The CDN itself has no terms-of-service page accessible via crawl.
- **Compatible with our AGPL-3.0 + ODbL-data stance:** Yes. Our code is AGPL-3.0; the camera data inherits ODbL from OSM (same as the Overpass fetcher), which is already documented in `LICENSE-DATA.md`. No additional license concern.
- **Concern to monitor:** DeFlock's CDN ToS is unspecified (no robots.txt restriction observed, no API key required, publicly accessible). If DeFlock explicitly restricts bulk download in future ToS, we would need to fall back to direct Overpass queries with DeFlock-specific OSM tags (`surveillance:type=ALPR` + `man_made=surveillance`). The data is the same — DeFlock is an OSM view, not an independent database.

## If architecture changes after launch

- **If CDN URL structure changes:** `fetch-deflock.ts` will throw at the index parse step (the `tile_url` field or `regions` array shape changed). Pipeline fails closed, no new release published. Fix: update the index parser in `fetch-deflock.ts` and update the fixture in `fixtures/deflock-sample.json`.
- **If DeFlock shuts down or blocks bulk access:** Replace `fetch-deflock.ts` with a direct Overpass query using `surveillance:type=ALPR` + `man_made=surveillance` tags. The `normalize-deflock.ts` field mapping (manufacturer → CameraType) would be replaced with OSM tag-based classification. This is already partially covered by `fetch-osm.ts`.
- **Re-research cadence:** Probe `https://cdn.deflock.me/regions/index.json` in every pipeline run (current approach); re-review architecture if the index returns a new shape not matching the `tile_url` template pattern.
