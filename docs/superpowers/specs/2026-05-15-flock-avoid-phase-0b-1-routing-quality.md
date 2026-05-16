# Flock-Avoid — Phase 0b-1: Routing Quality

**Status:** Draft for review
**Author:** Steven (with Claude as AI cofounder)
**Date:** 2026-05-15
**Parent spec:** [`2026-05-15-flock-avoid-design.md`](./2026-05-15-flock-avoid-design.md)
**Prior phase:** Phase 0a (merged to master; routing validated end-to-end)

---

## 1. Why this exists

Phase 0a shipped the routing infrastructure but hands-on testing in downtown Atlanta revealed two failures of the v0 costing model:

1. **Vulnerable creates walls.** Omnidirectional 120m exclusion radii around clustered ALPRs overlap into impenetrable barriers. Common downtown trips return *"no path could be found."*
2. **Commuter is a no-op.** 12m exclusion radii are smaller than road widths, so Valhalla routes through them as if they weren't there. Shortest and Private routes are identical. The +0 cameras avoided result is cosmetically broken.

Both failures share a root cause: a single fixed-radius circle is the wrong abstraction. Real cameras face one direction, see a cone-shaped area, and have known effective ranges that vary by hardware. Phase 0b-1 replaces the costing model with one based on actual camera geometry, fills out the profile system (adds Activist + Custom), and adds graceful degradation when the user's settings still produce no path.

Phase 0b-1 does **not** include: new data sources, real public deployment, PWA polish, or more cities in the benchmark. Those are Phase 0b-2 and 0b-3.

## 2. Scope

**In:**
- Directional-cone costing model (replaces omnidirectional circles)
- Camera type extended with `direction`, `rangeMeters`, `fovDegrees`, `directionConfidence`
- Per-type research-backed default geometry
- Missing-direction fallback: 180° cone toward nearest road + "?" badge in UI
- Wall-prevention cap (cone never bridges to parallel road)
- No-op floor (cone always blocks ≥ 8m so it covers the camera's lane)
- Activist preset (the missing middle between Commuter and Vulnerable)
- Custom profile with three sliders + per-camera-type weight sliders, behind an "Advanced" toggle
- Graceful degradation when private route fails: show shortest with a panel offering profile swap, including "would avoid N cameras" preview
- Seed dataset updated with realistic direction/range for the 12 Atlanta cameras

**Out (deferred):**
- DeFlock + OSM data pipeline (Phase 0b-2)
- Self-hosted Protomaps tiles, PWA, deployment (Phase 0b-3)
- Auto-relaxing tolerance / iterative re-routing (Phase 1 if needed)
- ML-detected camera direction from photos (Phase 1+)
- Cone math accounting for terrain/buildings/line-of-sight (Phase 1+)
- Activist + Custom + advanced sliders test coverage at 100% — the user-facing details can iterate

## 3. Data Model Changes

### 3.1 Camera type

Extend `src/domain/camera.ts`:

```ts
export interface Camera {
  readonly id: string;
  readonly type: CameraType;
  readonly lat: number;
  readonly lon: number;
  readonly confidence: number;
  readonly source: 'seed' | 'deflock' | 'osm' | 'submission' | 'foia';
  readonly direction?: number;                 // bearing 0–360°, north = 0
  readonly rangeMeters?: number;               // intrinsic effective visibility
  readonly fovDegrees?: number;                // field-of-view angle
  readonly directionConfidence?: 'known' | 'inferred' | 'unknown';
}
```

All new fields are optional; absence means "use per-type defaults" with `directionConfidence` resolved at load time (see §3.3).

### 3.2 Per-type default geometry

A new constant `CAMERA_TYPE_DEFAULTS` in `src/domain/cameraTypeDefaults.ts`:

| `type` | `rangeMeters` | `fovDegrees` | Rationale |
|---|---|---|---|
| `alpr_government` | 35 | 30 | Flock spec sheet plate-read range/angle |
| `alpr_private` | 35 | 30 | Same hardware class |
| `cctv_municipal` | 50 | 70 | Wider municipal coverage, lower res |
| `cctv_dot_traffic` | 80 | 60 | DOT zoom cameras, narrower FOV |
| `speed_camera` | 30 | 25 | Specific lane targeting |
| `red_light_camera` | 25 | 35 | Intersection corner mount |

These defaults are versioned in code and reviewable in PRs — they encode our published research and are part of the product's defensibility.

### 3.3 Camera dataset loading

`CameraStore.loadFromUrl` resolves each loaded camera into a `ResolvedCamera`:

```ts
export interface ResolvedCamera extends Camera {
  readonly effectiveRangeMeters: number;       // declared OR default
  readonly effectiveFovDegrees: number;
  readonly effectiveDirection: number;         // declared, inferred, or 0
  readonly directionConfidence: 'known' | 'inferred' | 'unknown';
}
```

Resolution rules at load time:
- `effectiveRangeMeters = camera.rangeMeters ?? CAMERA_TYPE_DEFAULTS[type].rangeMeters`
- `effectiveFovDegrees = camera.fovDegrees ?? CAMERA_TYPE_DEFAULTS[type].fovDegrees`
- If `camera.direction != null` → `directionConfidence = 'known'`, `effectiveDirection = camera.direction`
- Else, attempt to infer direction from nearest road (using a lazy lookup — deferred until first routing call to avoid coupling load-time to Valhalla being up). Until inferred, `effectiveDirection = 0` and `directionConfidence = 'unknown'`.
- Direction inference uses `nearestRoadBearing(lat, lon)` — a one-shot Valhalla `locate` call that returns the bearing of the road edge closest to the point. If Valhalla returns no road within 50m, fall back to omnidirectional treatment (effectiveFovDegrees = 360, confidence still `unknown`).

### 3.4 Updated seed dataset

`public/data/cameras-atlanta-seed.json` updated so the 12 hand-curated cameras carry realistic `direction` + `rangeMeters` based on Google Street View inspection. This is a one-time update; downstream Phase 0b-2 pipeline produces direction from DeFlock data automatically.

## 4. Costing Model: Directional Cones

### 4.1 Cone polygon construction

A new module `src/routing/conePolygon.ts` exports:

```ts
export interface ConeParams {
  readonly lat: number;
  readonly lon: number;
  readonly bearingDegrees: number;     // center direction
  readonly fovDegrees: number;         // total angular width
  readonly rangeMeters: number;        // arc radius
}

export function buildConePolygon(p: ConeParams): ExclusionPolygon;
```

Output is a closed ring of ≈16 vertices: apex (camera) + 14 arc points + apex (closing). FOV ≥ 350° collapses to a full circle (efficient short-circuit for omnidirectional / fully unknown cones).

### 4.2 Per-camera exclusion sizing

Replaces `exclusionRadiusForCamera`. New module: `src/routing/coneFromProfile.ts`:

```ts
export function coneForCamera(
  camera: ResolvedCamera,
  profile: ThreatProfile,
  routingGraphDistanceToParallelRoad: (lat: number, lon: number, bearing: number) => number,
): ConeParams | null;
```

Returns `null` when `profile.weights[camera.type] === 0` (camera type ignored by this profile).

Sizing formula:
```
intrinsicRange = camera.effectiveRangeMeters
expandedRange  = intrinsicRange * profile.toleranceMultiplier
parallelLimit  = routingGraphDistanceToParallelRoad(...) * 0.7
finalRange     = clamp(expandedRange, 8, min(45, parallelLimit))

intrinsicFov   = camera.effectiveFovDegrees
expandedFov    = clamp(intrinsicFov * profile.visibilityExpansionMultiplier, 0, 360)
```

The 8m floor solves no-op; the 45m / parallelLimit cap solves walls.

### 4.3 Parallel-road distance lookup

`routingGraphDistanceToParallelRoad(lat, lon, bearing)` calls Valhalla's `locate` endpoint and inspects neighbor edges to find the minimum perpendicular distance from this point to a road that runs roughly parallel to `bearing`. If Valhalla returns no useful data, returns `Infinity` (the clamp falls back to the 45m hard cap).

This is the only Valhalla call that happens at cone-construction time. It's cached per `(lat, lon, bearing)` tuple for the session.

### 4.4 Updated route scorer

`routeScorer.ts` updated to use cone visibility: a polyline point is "visible" to a camera only if (a) it's within the cone's range AND (b) it falls within the cone's angular span as seen from the camera. The existing max-factor logic per camera remains unchanged.

## 5. Profile System

### 5.1 Three presets + Custom

`src/domain/threatProfile.ts` ships four exports:

| Preset | ALPR | CCTV mun | CCTV DOT | Speed | Red-light | ALPR-private | Tolerance | Visibility expansion |
|---|---|---|---|---|---|---|---|---|
| `COMMUTER_PROFILE` | 50 | 15 | 5 | 20 | 20 | 50 | 0.6× | 1.0× |
| `ACTIVIST_PROFILE` *(new)* | 80 | 75 | 30 | 40 | 40 | 80 | 1.0× | 1.0× |
| `VULNERABLE_PROFILE` | 100 | 60 | 30 | 40 | 40 | 100 | 1.4× | 1.1× |
| `CUSTOM_PROFILE_DEFAULT` *(new)* | 50 | 30 | 15 | 25 | 25 | 50 | 1.0× | 1.0× |

`ThreatProfile` interface extends to carry `visibilityExpansionMultiplier` and the tolerance is renamed `toleranceMultiplier` (a float, not the prior `'low'|'medium'|'high'|'unlimited'` string). This is a breaking schema change; consumers are updated in one commit.

### 5.2 Onboarding picker

`src/ui/profilePicker.ts` now renders four cards: Commuter, Activist, Vulnerable, Custom. Selecting Custom mounts the Custom Editor (next section) instead of going straight to the planner.

### 5.3 Custom Editor (new component)

`src/ui/customProfileEditor.ts` — a sidebar component that opens when the user picks Custom. Three top-level sliders + collapsible "Per-camera-type weights" section:

| Control | Range | Default |
|---|---|---|
| Detour tolerance | 0.3× → 3.0× | 1.0× |
| Visibility expansion | 0.8× → 2.0× | 1.0× |
| Six per-camera-type weight sliders | 0 → 100 | preset baseline |

The advanced section is collapsed by default (expandable via a "Per-camera-type weights" disclosure). Most users will move the two top sliders and never open advanced. Power users (activists, journalists) get full control without UI clutter for everyone else.

A "Save as my default" checkbox persists the Custom profile to `localStorage` so the user doesn't reconfigure every session. Storage key: `flockavoid.customProfile.v1`.

### 5.4 Visible scaling consequences

The profile picker cards now show a small subtitle line indicating expected behavior, derived from the profile's tolerance:

- Commuter: "Routes stay close to the shortest path"
- Activist: "Routes detour around sensitive areas (~10–20% extra time typical)"
- Vulnerable: "Routes accept large detours to avoid surveillance"
- Custom: "Configure exactly how aggressively to avoid which cameras"

## 6. Graceful Degradation

When `Router.compareRoutes` fails on the private call because no path exists, instead of throwing an error to the UI, return a `RouteComparison` with a new `degradation` field:

```ts
export interface RouteComparison {
  // ...existing fields
  readonly degradation?: {
    readonly reason: 'no_private_path';
    readonly alternativePreviews: readonly AlternativePreview[];
  };
}

export interface AlternativePreview {
  readonly profile: ThreatProfile;
  readonly camerasAvoidedEstimate: number;   // rough — based on dataset scan, not full route
  readonly extraTimeEstimate: 'small' | 'medium' | 'large' | 'unknown';
}
```

The router builds alternative previews by:
- For each preset OTHER than the user's current → quickly enumerate cones that profile would use
- For each, estimate "would route around N cameras" by counting cones that exist for that profile within a bounding box around the shortest route (cheap, no route call)
- Skip `extraTimeEstimate` calculation for v0 (label as `'unknown'`); Phase 1 can add real route previews if needed

### 6.1 UI behavior

`RoutePlanner.renderComparison` checks for `degradation`. When present:
- Shows only the Shortest route on the map (Private polyline omitted)
- Comparison panel becomes a degradation panel:

  > **No private route possible with your current profile** in this area.
  > Try a different profile:
  > - **Activist** *(would avoid ~8 cameras)* [Use Activist →]
  > - **Commuter** *(would avoid ~3 cameras)* [Use Commuter →]

- Clicking [Use X →] swaps the profile and re-runs `compareRoutes` for the same endpoints

This replaces the Phase 0a "raw error message" UX. The Phase 0a error helper is still kept for unexpected errors (network, malformed responses, etc.).

## 7. Testing Strategy

| Layer | New coverage |
|---|---|
| **Unit — `conePolygon`** | Cone with 0°/90°/180°/270° bearings produces correct vertex coordinates; full-circle short-circuit for FOV ≥ 350°; vertex count = 16. |
| **Unit — `coneFromProfile`** | Per-camera-type defaults applied when fields missing; 8m floor enforced; 45m hard cap enforced; parallelLimit cap respected when supplied. |
| **Unit — `routeScorer`** | A camera facing AWAY from the polyline is NOT counted; a camera facing TOWARD is counted; cone span correctly limits visibility. |
| **Unit — `ThreatProfile`** | All four presets exported, all weights in [0,100], tolerance multipliers in range. |
| **Unit — `customProfileEditor`** | localStorage round-trip persists Custom profile. |
| **Integration — `Router`** | Returns `degradation` field instead of throwing when private path impossible (use the Vulnerable + dense-cluster repro from Phase 0a as the test case). Alternative previews reference the OTHER presets. |
| **Privacy** | All new endpoints (Valhalla `locate` calls) are still localhost:8002 — already covered by existing allowlist. |
| **Benchmark** | One new test case asserting the cone model produces non-trivial avoidance for Activist profile across downtown Atlanta. |

Coverage target: maintain 80% overall; unchanged from Phase 0a.

## 8. Open Questions / Deferred

- Exact angular vertex count for cone polygons (16 is a reasonable v0; tune if Valhalla performance suffers)
- Whether per-camera-type defaults should be configurable per-deployment (probably yes, but not in 0b-1)
- Caching strategy for `routingGraphDistanceToParallelRoad` (in-memory Map for now, persist later if needed)
- Whether `directionConfidence: 'unknown'` cameras get a different cone color on the map (proposed: yellow ring around the pin instead of red — but defer until UX feedback)

## 9. Success Criteria

Phase 0b-1 is done when:
- The Phase 0a Atlanta failure case (Vulnerable downtown crossing) now produces a usable route OR a degradation panel with valid profile-swap suggestions, not a raw error
- The Phase 0a Commuter no-op case (same shortest and private routes) now produces a measurable diff (≥ 1 camera avoided when cameras lie along the shortest path)
- Activist profile produces routes intermediate between Commuter and Vulnerable on the same trip
- Custom slider state persists across reloads via localStorage
- All Phase 0a tests still pass; new tests added per §7
- No regression in privacy invariants (Playwright suite still green)
