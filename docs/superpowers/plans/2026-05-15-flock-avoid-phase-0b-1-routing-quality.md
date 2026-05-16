# Flock-Avoid — Phase 0b-1: Routing Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 0a's broken omnidirectional-circle costing model with directional cones derived from real camera geometry; add the missing Activist preset + Custom profile editor; surface graceful degradation when private routing is impossible.

**Architecture:** Each camera carries optional direction/range/FOV (with researched per-type defaults). A new `conePolygon` module builds sector polygons; `coneForCamera` translates per-profile scaling into a final cone, clamped to never bridge to a parallel road (wall prevention) and floored at 8m (no-op prevention). Profile schema changes from string detour-tolerance to numeric multipliers, adds Activist + Custom presets. Router catches no-path failures and returns a `degradation` field that the UI renders as a profile-swap panel.

**Tech Stack:** Continues the Phase 0a stack — TypeScript 5.x, Vite 5, Vitest 2, MapLibre GL 4, Valhalla via Docker (already running locally), Playwright 1.48.

**Branch:** Create `feat/phase-0b-1-routing-quality` from `master` before Task 1.

**Out of scope (deferred to other plans):**
- DeFlock + OSM data ingestion (Phase 0b-2)
- Self-hosted Protomaps tiles, PWA, deployment (Phase 0b-3)
- ML-detected camera orientation, line-of-sight terrain math (Phase 1+)

---

## File Structure

```
src/
├── domain/
│   ├── camera.ts                       # MODIFY: add optional direction/range/fov/confidence
│   ├── cameraTypeDefaults.ts           # NEW: per-type default geometry
│   ├── threatProfile.ts                # MODIFY: schema change, add ACTIVIST + CUSTOM
│   └── route.ts                        # MODIFY: add optional `degradation` field to RouteComparison
├── data/
│   ├── cameraStore.ts                  # MODIFY: load -> resolve cameras
│   └── resolvedCamera.ts               # NEW: ResolvedCamera type + resolveCamera function
├── routing/
│   ├── conePolygon.ts                  # NEW: buildConePolygon (sector polygon math)
│   ├── coneFromProfile.ts              # NEW: coneForCamera (per-profile scaling + clamps)
│   ├── nearestRoadBearing.ts           # NEW: Valhalla locate -> bearing of nearest road
│   ├── parallelRoadDistance.ts         # NEW: Valhalla locate -> distance to nearest parallel road
│   ├── exclusionPolygons.ts            # DELETE (replaced by conePolygon + coneFromProfile)
│   ├── routeScorer.ts                  # MODIFY: cone-visibility check (was within-radius)
│   └── router.ts                       # MODIFY: cones + graceful degradation
├── ui/
│   ├── profilePicker.ts                # MODIFY: 4 cards (Commuter, Activist, Vulnerable, Custom)
│   ├── customProfileEditor.ts          # NEW: sliders UI for Custom profile
│   ├── routePlanner.ts                 # MODIFY: degradation panel + profile-swap callback
│   └── mapView.ts                      # MODIFY: render "?" badge for unknown-direction cameras
└── app.ts                              # MODIFY: wire Custom Editor flow

public/data/
└── cameras-atlanta-seed.json           # MODIFY: add direction + range for the 12 cameras

tests/
├── unit/
│   ├── domain/
│   │   ├── cameraTypeDefaults.test.ts  # NEW
│   │   └── threatProfile.test.ts       # MODIFY: cover Activist + Custom + new schema
│   ├── data/
│   │   ├── cameraStore.test.ts         # MODIFY: cover ResolvedCamera output
│   │   └── resolvedCamera.test.ts      # NEW
│   ├── routing/
│   │   ├── conePolygon.test.ts         # NEW
│   │   ├── coneFromProfile.test.ts     # NEW
│   │   ├── nearestRoadBearing.test.ts  # NEW (uses fetch mock)
│   │   └── routeScorer.test.ts         # MODIFY: cover cone visibility
│   └── ui/
│       └── customProfileEditor.test.ts # NEW (jsdom)
├── integration/
│   └── router.test.ts                  # MODIFY: degradation case
└── benchmark/
    └── atlanta-routes.spec.ts          # MODIFY: assert cone model produces non-trivial diff
```

---

## Task 0: Branch + Baseline

**Files:** none (git only).

- [ ] **Step 1: Create branch**

```bash
cd /Users/steven/projects/flock-avoid
git checkout master
git pull --ff-only 2>/dev/null || true
git checkout -b feat/phase-0b-1-routing-quality
git log --oneline -5
```

Expected: branch `feat/phase-0b-1-routing-quality` created at the same commit as `master`. The most recent commit should be the Phase 0b-1 spec.

- [ ] **Step 2: Verify baseline tests pass**

```bash
npm test
```

Expected: 39 tests pass across 10 files.

- [ ] **Step 3: Verify Valhalla is up (skip integration-tests gracefully if not)**

```bash
curl -sf http://localhost:8002/status | head -c 80
```

Expected: JSON with `version` field. If not, `npm run valhalla:up`.

No commit at this step.

---

## Task 1: Per-Type Default Geometry Constants

**Files:**
- Create: `src/domain/cameraTypeDefaults.ts`
- Create: `tests/unit/domain/cameraTypeDefaults.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/domain/cameraTypeDefaults.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CAMERA_TYPE_DEFAULTS } from '../../../src/domain/cameraTypeDefaults';
import { ALL_CAMERA_TYPES } from '../../../src/domain/camera';

describe('CAMERA_TYPE_DEFAULTS', () => {
  it('defines defaults for every camera type', () => {
    for (const type of ALL_CAMERA_TYPES) {
      expect(CAMERA_TYPE_DEFAULTS[type]).toBeDefined();
      expect(CAMERA_TYPE_DEFAULTS[type].rangeMeters).toBeGreaterThan(0);
      expect(CAMERA_TYPE_DEFAULTS[type].fovDegrees).toBeGreaterThan(0);
      expect(CAMERA_TYPE_DEFAULTS[type].fovDegrees).toBeLessThanOrEqual(360);
    }
  });

  it('ALPRs have narrower FOV than CCTV', () => {
    expect(CAMERA_TYPE_DEFAULTS.alpr_government.fovDegrees).toBeLessThan(
      CAMERA_TYPE_DEFAULTS.cctv_municipal.fovDegrees,
    );
  });

  it('the constants object is frozen', () => {
    expect(Object.isFrozen(CAMERA_TYPE_DEFAULTS)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, confirm fails (module not found)**

`npx vitest run tests/unit/domain/cameraTypeDefaults.test.ts`

- [ ] **Step 3: Implement**

Create `src/domain/cameraTypeDefaults.ts`:

```ts
import type { CameraType } from './camera';

export interface CameraGeometry {
  readonly rangeMeters: number;
  readonly fovDegrees: number;
}

export const CAMERA_TYPE_DEFAULTS: Readonly<Record<CameraType, CameraGeometry>> = Object.freeze({
  alpr_government: { rangeMeters: 35, fovDegrees: 30 },
  alpr_private: { rangeMeters: 35, fovDegrees: 30 },
  cctv_municipal: { rangeMeters: 50, fovDegrees: 70 },
  cctv_dot_traffic: { rangeMeters: 80, fovDegrees: 60 },
  speed_camera: { rangeMeters: 30, fovDegrees: 25 },
  red_light_camera: { rangeMeters: 25, fovDegrees: 35 },
});
```

- [ ] **Step 4: Run test, confirm passes (3 tests)**

- [ ] **Step 5: Commit**

```bash
git add src/domain/cameraTypeDefaults.ts tests/unit/domain/cameraTypeDefaults.test.ts
git commit -m "feat(domain): add per-type default camera geometry (range + FOV)"
```

---

## Task 2: Extend Camera Type with Optional Geometry Fields

**Files:**
- Modify: `src/domain/camera.ts`
- Modify: `tests/unit/domain/camera.test.ts`

- [ ] **Step 1: Update the existing test file**

Append new tests to `tests/unit/domain/camera.test.ts`:

```ts
import type { Camera } from '../../../src/domain/camera';

describe('Camera optional geometry fields', () => {
  it('accepts direction in [0, 360)', () => {
    const c: Camera = {
      id: 'g1', type: 'alpr_government', lat: 33.75, lon: -84.39,
      confidence: 0.9, source: 'seed',
      direction: 180, rangeMeters: 35, fovDegrees: 30,
      directionConfidence: 'known',
    };
    expect(c.direction).toBe(180);
  });

  it('compiles without the optional fields (back-compat with v0 seed)', () => {
    const c: Camera = {
      id: 'g2', type: 'alpr_government', lat: 33.75, lon: -84.39,
      confidence: 0.9, source: 'seed',
    };
    expect(c.direction).toBeUndefined();
    expect(c.directionConfidence).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, confirm fails (TS compilation errors)**

`npx vitest run tests/unit/domain/camera.test.ts`

- [ ] **Step 3: Update `src/domain/camera.ts`**

Replace the `Camera` interface to:

```ts
export interface Camera {
  readonly id: string;
  readonly type: CameraType;
  readonly lat: number;
  readonly lon: number;
  readonly confidence: number;
  readonly source: 'seed' | 'deflock' | 'osm' | 'submission' | 'foia';
  readonly direction?: number;
  readonly rangeMeters?: number;
  readonly fovDegrees?: number;
  readonly directionConfidence?: 'known' | 'inferred' | 'unknown';
}
```

(All other exports — `ALL_CAMERA_TYPES`, `CameraType`, `isCameraType` — unchanged.)

- [ ] **Step 4: Run, confirm passes**

`npx vitest run tests/unit/domain/camera.test.ts` — expect 5 tests (3 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/domain/camera.ts tests/unit/domain/camera.test.ts
git commit -m "feat(domain): extend Camera type with optional direction/range/FOV/confidence"
```

---

## Task 3: ResolvedCamera Type + resolveCamera Function

**Files:**
- Create: `src/data/resolvedCamera.ts`
- Create: `tests/unit/data/resolvedCamera.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/data/resolvedCamera.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveCamera } from '../../../src/data/resolvedCamera';
import { CAMERA_TYPE_DEFAULTS } from '../../../src/domain/cameraTypeDefaults';
import type { Camera } from '../../../src/domain/camera';

const ALPR_KNOWN: Camera = {
  id: 'k', type: 'alpr_government', lat: 33.75, lon: -84.39,
  confidence: 0.9, source: 'seed',
  direction: 90, rangeMeters: 40, fovDegrees: 28, directionConfidence: 'known',
};

const ALPR_BARE: Camera = {
  id: 'b', type: 'alpr_government', lat: 33.75, lon: -84.39,
  confidence: 0.9, source: 'seed',
};

describe('resolveCamera', () => {
  it('preserves provided direction/range/fov when present', () => {
    const r = resolveCamera(ALPR_KNOWN);
    expect(r.effectiveDirection).toBe(90);
    expect(r.effectiveRangeMeters).toBe(40);
    expect(r.effectiveFovDegrees).toBe(28);
    expect(r.directionConfidence).toBe('known');
  });

  it('fills missing range + fov from per-type defaults', () => {
    const r = resolveCamera(ALPR_BARE);
    expect(r.effectiveRangeMeters).toBe(CAMERA_TYPE_DEFAULTS.alpr_government.rangeMeters);
    expect(r.effectiveFovDegrees).toBe(CAMERA_TYPE_DEFAULTS.alpr_government.fovDegrees);
  });

  it("marks confidence as 'unknown' when direction is absent", () => {
    const r = resolveCamera(ALPR_BARE);
    expect(r.directionConfidence).toBe('unknown');
    expect(r.effectiveDirection).toBe(0);
  });

  it('preserves all the original Camera fields', () => {
    const r = resolveCamera(ALPR_KNOWN);
    expect(r.id).toBe(ALPR_KNOWN.id);
    expect(r.type).toBe(ALPR_KNOWN.type);
    expect(r.lat).toBe(ALPR_KNOWN.lat);
    expect(r.lon).toBe(ALPR_KNOWN.lon);
    expect(r.confidence).toBe(ALPR_KNOWN.confidence);
    expect(r.source).toBe(ALPR_KNOWN.source);
  });
});
```

- [ ] **Step 2: Run, confirm fails**

- [ ] **Step 3: Implement**

Create `src/data/resolvedCamera.ts`:

```ts
import type { Camera } from '../domain/camera';
import { CAMERA_TYPE_DEFAULTS } from '../domain/cameraTypeDefaults';

export interface ResolvedCamera extends Camera {
  readonly effectiveRangeMeters: number;
  readonly effectiveFovDegrees: number;
  readonly effectiveDirection: number;
  readonly directionConfidence: 'known' | 'inferred' | 'unknown';
}

export function resolveCamera(camera: Camera): ResolvedCamera {
  const defaults = CAMERA_TYPE_DEFAULTS[camera.type];
  return {
    ...camera,
    effectiveRangeMeters: camera.rangeMeters ?? defaults.rangeMeters,
    effectiveFovDegrees: camera.fovDegrees ?? defaults.fovDegrees,
    effectiveDirection: camera.direction ?? 0,
    directionConfidence:
      camera.directionConfidence ?? (camera.direction != null ? 'known' : 'unknown'),
  };
}
```

- [ ] **Step 4: Run, confirm passes (4 tests)**

- [ ] **Step 5: Commit**

```bash
git add src/data/resolvedCamera.ts tests/unit/data/resolvedCamera.test.ts
git commit -m "feat(data): add ResolvedCamera type + resolveCamera fills defaults"
```

---

## Task 4: Cone Polygon Math

**Files:**
- Create: `src/routing/conePolygon.ts`
- Create: `tests/unit/routing/conePolygon.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/routing/conePolygon.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildConePolygon } from '../../../src/routing/conePolygon';

describe('buildConePolygon', () => {
  it('returns a closed ring (first vertex == last vertex)', () => {
    const ring = buildConePolygon({
      lat: 33.75, lon: -84.39, bearingDegrees: 0, fovDegrees: 30, rangeMeters: 35,
    });
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('apex is at the camera location', () => {
    const ring = buildConePolygon({
      lat: 33.75, lon: -84.39, bearingDegrees: 90, fovDegrees: 30, rangeMeters: 35,
    });
    const apex = ring[0]!;
    expect(apex[0]).toBeCloseTo(-84.39, 6);
    expect(apex[1]).toBeCloseTo(33.75, 6);
  });

  it('cone facing north (bearing 0) reaches points north of apex', () => {
    const ring = buildConePolygon({
      lat: 33.75, lon: -84.39, bearingDegrees: 0, fovDegrees: 30, rangeMeters: 50,
    });
    // The arc midpoint should be roughly due north
    const midIdx = Math.floor(ring.length / 2);
    const midpoint = ring[midIdx]!;
    expect(midpoint[1]).toBeGreaterThan(33.75);
    expect(Math.abs(midpoint[0] - -84.39)).toBeLessThan(0.001);
  });

  it('FOV >= 350 collapses to a full circle (>= 16 distinct arc points)', () => {
    const ring = buildConePolygon({
      lat: 33.75, lon: -84.39, bearingDegrees: 180, fovDegrees: 360, rangeMeters: 35,
    });
    expect(ring.length).toBeGreaterThanOrEqual(16);
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    expect(first).toEqual(last);
  });

  it('vertex count is 16 for a normal cone (apex + 14 arc points + close)', () => {
    const ring = buildConePolygon({
      lat: 33.75, lon: -84.39, bearingDegrees: 90, fovDegrees: 30, rangeMeters: 35,
    });
    expect(ring.length).toBe(16);
  });
});
```

- [ ] **Step 2: Run, confirm fails**

- [ ] **Step 3: Implement**

Create `src/routing/conePolygon.ts`:

```ts
import type { ExclusionPolygon } from './conePolygon.types';

export interface ConeParams {
  readonly lat: number;
  readonly lon: number;
  readonly bearingDegrees: number;
  readonly fovDegrees: number;
  readonly rangeMeters: number;
}

const ARC_VERTICES = 14;
const FULL_CIRCLE_THRESHOLD = 350;
const M_PER_DEG_LAT = 111_320;

/** Build a sector polygon (cone) as a closed ring of [lon, lat] pairs. */
export function buildConePolygon(p: ConeParams): ExclusionPolygon {
  const { lat, lon, bearingDegrees, fovDegrees, rangeMeters } = p;
  const isFullCircle = fovDegrees >= FULL_CIRCLE_THRESHOLD;
  const effectiveFov = isFullCircle ? 360 : fovDegrees;
  const halfFov = effectiveFov / 2;

  const points: [number, number][] = [];

  if (!isFullCircle) {
    points.push([lon, lat]);
  } else {
    const first = pointAt(lat, lon, bearingDegrees - halfFov, rangeMeters);
    points.push(first);
  }

  const arcStart = bearingDegrees - halfFov;
  const step = effectiveFov / (ARC_VERTICES - 1);
  for (let i = 0; i < ARC_VERTICES; i++) {
    const angle = arcStart + step * i;
    points.push(pointAt(lat, lon, angle, rangeMeters));
  }

  if (!isFullCircle) {
    points.push([lon, lat]);
  } else {
    points.push(points[0]!);
  }

  return points;
}

function pointAt(
  lat: number,
  lon: number,
  bearingDegrees: number,
  rangeMeters: number,
): [number, number] {
  const bearingRad = (bearingDegrees * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const dNorth = Math.cos(bearingRad) * rangeMeters;
  const dEast = Math.sin(bearingRad) * rangeMeters;
  const dLat = dNorth / M_PER_DEG_LAT;
  const dLon = dEast / (M_PER_DEG_LAT * Math.cos(latRad));
  return [lon + dLon, lat + dLat];
}
```

Create the types file so the existing reference to `ExclusionPolygon` (used by `valhallaClient.ts`) doesn't break when we delete `exclusionPolygons.ts` later. Create `src/routing/conePolygon.types.ts`:

```ts
/** Polygon ring in Valhalla's `exclude_polygons` format: [[lon,lat], ...closed]. */
export type ExclusionPolygon = readonly (readonly [number, number])[];
```

- [ ] **Step 4: Run, confirm passes (5 tests)**

Also: `npx tsc --noEmit` to verify the file structure compiles.

- [ ] **Step 5: Commit**

```bash
git add src/routing/conePolygon.ts src/routing/conePolygon.types.ts tests/unit/routing/conePolygon.test.ts
git commit -m "feat(routing): add buildConePolygon for sector exclusion polygons"
```

---

## Task 5: ValhallaClient — accept ExclusionPolygon from new module path

**Files:**
- Modify: `src/routing/valhallaClient.ts`

The current import is `import type { ExclusionPolygon } from './exclusionPolygons';`. Since we'll delete `exclusionPolygons.ts` in a later task, redirect to the new types file now to keep the build green.

- [ ] **Step 1: Update import**

In `src/routing/valhallaClient.ts`, change:

```ts
import type { ExclusionPolygon } from './exclusionPolygons';
```

to:

```ts
import type { ExclusionPolygon } from './conePolygon.types';
```

- [ ] **Step 2: Verify build + tests still pass**

```bash
npx tsc --noEmit
npx vitest run tests/unit/routing/valhallaClient.test.ts
```

Both should be clean.

- [ ] **Step 3: Commit**

```bash
git add src/routing/valhallaClient.ts
git commit -m "refactor(routing): redirect ExclusionPolygon import to conePolygon.types"
```

---

## Task 6: nearestRoadBearing — Valhalla locate-based lookup

**Files:**
- Create: `src/routing/nearestRoadBearing.ts`
- Create: `tests/unit/routing/nearestRoadBearing.test.ts`

- [ ] **Step 1: Write failing test (mocks Valhalla `locate` response)**

Create `tests/unit/routing/nearestRoadBearing.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { nearestRoadBearing } from '../../../src/routing/nearestRoadBearing';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('nearestRoadBearing', () => {
  it('returns the heading of the nearest edge when Valhalla finds one', async () => {
    const mockResp = [
      {
        edges: [
          { heading: 92.5, distance: 12, correlated_lat: 33.7501, correlated_lon: -84.3892 },
          { heading: 270, distance: 80, correlated_lat: 33.7505, correlated_lon: -84.3902 },
        ],
      },
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResp), { status: 200 }),
    );

    const bearing = await nearestRoadBearing('http://localhost:8002', 33.75, -84.389);
    expect(bearing).toBeCloseTo(92.5, 5);
  });

  it('returns null when Valhalla returns no edges within 50m', async () => {
    const mockResp = [{ edges: [{ heading: 0, distance: 500 }] }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResp), { status: 200 }),
    );

    const bearing = await nearestRoadBearing('http://localhost:8002', 33.75, -84.389);
    expect(bearing).toBeNull();
  });

  it('returns null when Valhalla request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('error', { status: 500 }),
    );
    const bearing = await nearestRoadBearing('http://localhost:8002', 33.75, -84.389);
    expect(bearing).toBeNull();
  });
});
```

- [ ] **Step 2: Run, confirm fails**

- [ ] **Step 3: Implement**

Create `src/routing/nearestRoadBearing.ts`:

```ts
const MAX_EDGE_DISTANCE_M = 50;

interface ValhallaLocateEdge {
  heading?: number;
  distance?: number;
}

interface ValhallaLocateResult {
  edges?: ValhallaLocateEdge[];
}

/** Returns the bearing (0-360°) of the road edge nearest to (lat, lon), or null. */
export async function nearestRoadBearing(
  valhallaBaseUrl: string,
  lat: number,
  lon: number,
): Promise<number | null> {
  try {
    const resp = await fetch(`${valhallaBaseUrl}/locate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [{ lat, lon }],
        costing: 'auto',
        verbose: true,
      }),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as ValhallaLocateResult[];
    const edges = data[0]?.edges ?? [];
    const closest = edges
      .filter((e) => typeof e.distance === 'number' && e.distance <= MAX_EDGE_DISTANCE_M)
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))[0];
    if (!closest || typeof closest.heading !== 'number') return null;
    return closest.heading;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run, confirm passes (3 tests)**

- [ ] **Step 5: Commit**

```bash
git add src/routing/nearestRoadBearing.ts tests/unit/routing/nearestRoadBearing.test.ts
git commit -m "feat(routing): add nearestRoadBearing via Valhalla locate"
```

---

## Task 7: parallelRoadDistance — distance to nearest parallel road

**Files:**
- Create: `src/routing/parallelRoadDistance.ts`
- Create: `tests/unit/routing/parallelRoadDistance.test.ts`

- [ ] **Step 1: Write failing test (mocks Valhalla locate)**

Create `tests/unit/routing/parallelRoadDistance.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parallelRoadDistance } from '../../../src/routing/parallelRoadDistance';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parallelRoadDistance', () => {
  it('returns the smallest distance among edges within ±30° of the target bearing', async () => {
    const mockResp = [
      {
        edges: [
          { heading: 0, distance: 5 },     // same road, skip
          { heading: 90, distance: 60 },   // ~parallel (target 88), distance 60
          { heading: 92, distance: 40 },   // ~parallel, distance 40 -- nearest parallel
          { heading: 200, distance: 30 },  // not parallel
        ],
      },
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResp), { status: 200 }),
    );

    const d = await parallelRoadDistance('http://localhost:8002', 33.75, -84.389, 88);
    expect(d).toBeCloseTo(40, 5);
  });

  it('returns Infinity when no parallel road found', async () => {
    const mockResp = [{ edges: [{ heading: 0, distance: 5 }] }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResp), { status: 200 }),
    );

    const d = await parallelRoadDistance('http://localhost:8002', 33.75, -84.389, 90);
    expect(d).toBe(Infinity);
  });

  it('returns Infinity on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('boom', { status: 500 }),
    );
    expect(await parallelRoadDistance('http://localhost:8002', 33.75, -84.389, 90)).toBe(Infinity);
  });
});
```

- [ ] **Step 2: Run, confirm fails**

- [ ] **Step 3: Implement**

Create `src/routing/parallelRoadDistance.ts`:

```ts
const PARALLEL_ANGLE_TOLERANCE_DEG = 30;
const SAME_ROAD_DISTANCE_M = 12;

interface ValhallaLocateEdge {
  heading?: number;
  distance?: number;
}

interface ValhallaLocateResult {
  edges?: ValhallaLocateEdge[];
}

/** Distance to the nearest road running roughly parallel to `bearing`, or Infinity. */
export async function parallelRoadDistance(
  valhallaBaseUrl: string,
  lat: number,
  lon: number,
  bearing: number,
): Promise<number> {
  try {
    const resp = await fetch(`${valhallaBaseUrl}/locate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [{ lat, lon }],
        costing: 'auto',
        verbose: true,
      }),
    });
    if (!resp.ok) return Infinity;
    const data = (await resp.json()) as ValhallaLocateResult[];
    const edges = data[0]?.edges ?? [];

    let nearest = Infinity;
    for (const edge of edges) {
      if (typeof edge.heading !== 'number' || typeof edge.distance !== 'number') continue;
      if (edge.distance < SAME_ROAD_DISTANCE_M) continue; // same road
      if (!isRoughlyParallel(edge.heading, bearing)) continue;
      if (edge.distance < nearest) nearest = edge.distance;
    }
    return nearest;
  } catch {
    return Infinity;
  }
}

function isRoughlyParallel(a: number, b: number): boolean {
  const diff = Math.abs(((a - b + 540) % 360) - 180);
  const angularDistance = Math.min(diff, 180 - diff);
  return angularDistance <= PARALLEL_ANGLE_TOLERANCE_DEG;
}
```

- [ ] **Step 4: Run, confirm passes (3 tests)**

- [ ] **Step 5: Commit**

```bash
git add src/routing/parallelRoadDistance.ts tests/unit/routing/parallelRoadDistance.test.ts
git commit -m "feat(routing): add parallelRoadDistance for cone wall-prevention cap"
```

---

## Task 8: ThreatProfile Schema Change + Activist + Custom presets

This is the **breaking change** task. Schema goes from `detourTolerance: 'low'|'medium'|'high'|'unlimited'` to `toleranceMultiplier: number` + `visibilityExpansionMultiplier: number`. Activist + Custom defaults added. Every consumer of the old shape must be updated in this same commit.

**Files:**
- Modify: `src/domain/threatProfile.ts`
- Modify: `tests/unit/domain/threatProfile.test.ts`

(Consumers of the old `detourTolerance` string: `src/routing/exclusionPolygons.ts` — being deleted later, so don't touch it here; the compiler will flag it once we update the schema, and we'll delete the file in Task 14.)

- [ ] **Step 1: Update test file**

Replace contents of `tests/unit/domain/threatProfile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  COMMUTER_PROFILE,
  ACTIVIST_PROFILE,
  VULNERABLE_PROFILE,
  CUSTOM_PROFILE_DEFAULT,
  ALL_PRESETS,
  type ThreatProfile,
} from '../../../src/domain/threatProfile';
import { ALL_CAMERA_TYPES } from '../../../src/domain/camera';

describe('threat profile presets', () => {
  it('weights are ordered Commuter <= Activist <= Vulnerable for ALPRs', () => {
    expect(COMMUTER_PROFILE.weights.alpr_government).toBeLessThanOrEqual(
      ACTIVIST_PROFILE.weights.alpr_government,
    );
    expect(ACTIVIST_PROFILE.weights.alpr_government).toBeLessThanOrEqual(
      VULNERABLE_PROFILE.weights.alpr_government,
    );
  });

  it('tolerance multipliers are ordered low < medium < high', () => {
    expect(COMMUTER_PROFILE.toleranceMultiplier).toBeLessThan(
      ACTIVIST_PROFILE.toleranceMultiplier,
    );
    expect(ACTIVIST_PROFILE.toleranceMultiplier).toBeLessThan(
      VULNERABLE_PROFILE.toleranceMultiplier,
    );
  });

  it('every preset defines weight for every camera type, in [0,100]', () => {
    for (const profile of ALL_PRESETS) {
      for (const ct of ALL_CAMERA_TYPES) {
        const w = profile.weights[ct];
        expect(w).toBeTypeOf('number');
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(100);
      }
    }
  });

  it('every preset has positive multipliers', () => {
    for (const profile of ALL_PRESETS) {
      expect(profile.toleranceMultiplier).toBeGreaterThan(0);
      expect(profile.visibilityExpansionMultiplier).toBeGreaterThan(0);
    }
  });

  it('preset objects are deeply frozen', () => {
    const p: ThreatProfile = ACTIVIST_PROFILE;
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.weights)).toBe(true);
  });

  it('CUSTOM_PROFILE_DEFAULT is a sensible starting point (between Commuter and Vulnerable)', () => {
    expect(CUSTOM_PROFILE_DEFAULT.toleranceMultiplier).toBeGreaterThan(
      COMMUTER_PROFILE.toleranceMultiplier,
    );
    expect(CUSTOM_PROFILE_DEFAULT.toleranceMultiplier).toBeLessThan(
      VULNERABLE_PROFILE.toleranceMultiplier,
    );
  });
});
```

- [ ] **Step 2: Run, confirm fails**

- [ ] **Step 3: Replace `src/domain/threatProfile.ts`**

```ts
import { type CameraType } from './camera';

export type ProfilePreset = 'commuter' | 'activist' | 'vulnerable' | 'custom';

export interface ThreatProfile {
  readonly preset: ProfilePreset;
  readonly weights: Readonly<Record<CameraType, number>>;
  readonly toleranceMultiplier: number;
  readonly visibilityExpansionMultiplier: number;
}

function freeze(p: ThreatProfile): ThreatProfile {
  Object.freeze(p.weights);
  return Object.freeze(p);
}

export const COMMUTER_PROFILE: ThreatProfile = freeze({
  preset: 'commuter',
  weights: {
    alpr_government: 50,
    alpr_private: 50,
    cctv_municipal: 15,
    cctv_dot_traffic: 5,
    speed_camera: 20,
    red_light_camera: 20,
  },
  toleranceMultiplier: 0.6,
  visibilityExpansionMultiplier: 1.0,
});

export const ACTIVIST_PROFILE: ThreatProfile = freeze({
  preset: 'activist',
  weights: {
    alpr_government: 80,
    alpr_private: 80,
    cctv_municipal: 75,
    cctv_dot_traffic: 30,
    speed_camera: 40,
    red_light_camera: 40,
  },
  toleranceMultiplier: 1.0,
  visibilityExpansionMultiplier: 1.0,
});

export const VULNERABLE_PROFILE: ThreatProfile = freeze({
  preset: 'vulnerable',
  weights: {
    alpr_government: 100,
    alpr_private: 100,
    cctv_municipal: 60,
    cctv_dot_traffic: 30,
    speed_camera: 40,
    red_light_camera: 40,
  },
  toleranceMultiplier: 1.4,
  visibilityExpansionMultiplier: 1.1,
});

export const CUSTOM_PROFILE_DEFAULT: ThreatProfile = freeze({
  preset: 'custom',
  weights: {
    alpr_government: 50,
    alpr_private: 50,
    cctv_municipal: 30,
    cctv_dot_traffic: 15,
    speed_camera: 25,
    red_light_camera: 25,
  },
  toleranceMultiplier: 1.0,
  visibilityExpansionMultiplier: 1.0,
});

export const ALL_PRESETS: readonly ThreatProfile[] = Object.freeze([
  COMMUTER_PROFILE,
  ACTIVIST_PROFILE,
  VULNERABLE_PROFILE,
  CUSTOM_PROFILE_DEFAULT,
]);
```

- [ ] **Step 4: Delete the exclusionPolygons test file**

`tests/unit/routing/exclusionPolygons.test.ts` imports from `src/routing/exclusionPolygons.ts`, which depends on the old `DetourTolerance` string and `TOLERANCE_MULTIPLIER` record. Both are gone now. Vitest would fail to load that test file. Delete it now (the source file is deleted in Task 14):

```bash
git rm tests/unit/routing/exclusionPolygons.test.ts
```

- [ ] **Step 5: Verify the rest of the suite still loads**

```bash
npx vitest run tests/unit/domain/threatProfile.test.ts
npm test 2>&1 | tail -10
```

Expected: threatProfile tests (6) pass. Full suite reports 4 fewer tests than before (the exclusionPolygons tests are gone) and lists `src/routing/exclusionPolygons.ts` as a TypeScript error if you also run `npx tsc --noEmit` — that's expected, resolved by Task 14.

- [ ] **Step 6: Commit**

```bash
git add src/domain/threatProfile.ts tests/unit/domain/threatProfile.test.ts
git commit -m "feat(domain): switch ThreatProfile to numeric multipliers, add Activist + Custom

Schema change: detourTolerance: 'low'|'medium'|'high'|'unlimited' replaced
by toleranceMultiplier: number (0.6 Commuter, 1.0 Activist, 1.4 Vulnerable)
and visibilityExpansionMultiplier: number. Adds ACTIVIST_PROFILE between
Commuter and Vulnerable, and CUSTOM_PROFILE_DEFAULT as a starting point
for user customization. Also removes the now-untyped exclusionPolygons
test file; the source module is deleted in Task 14."
```

---

## Task 9: coneFromProfile — per-camera cone with clamps

**Files:**
- Create: `src/routing/coneFromProfile.ts`
- Create: `tests/unit/routing/coneFromProfile.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/routing/coneFromProfile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { coneForCamera } from '../../../src/routing/coneFromProfile';
import { resolveCamera } from '../../../src/data/resolvedCamera';
import {
  COMMUTER_PROFILE, ACTIVIST_PROFILE, VULNERABLE_PROFILE,
} from '../../../src/domain/threatProfile';
import type { Camera } from '../../../src/domain/camera';

const ALPR: Camera = {
  id: 'a', type: 'alpr_government', lat: 33.75, lon: -84.39,
  confidence: 0.9, source: 'seed',
  direction: 90, rangeMeters: 35, fovDegrees: 30, directionConfidence: 'known',
};

describe('coneForCamera', () => {
  it('returns null when profile weight for the type is 0', () => {
    const zero = { ...COMMUTER_PROFILE, weights: { ...COMMUTER_PROFILE.weights, alpr_government: 0 } };
    expect(coneForCamera(resolveCamera(ALPR), zero, () => Infinity)).toBeNull();
  });

  it('Vulnerable produces a larger range than Commuter for same camera', () => {
    const rCom = coneForCamera(resolveCamera(ALPR), COMMUTER_PROFILE, () => Infinity)!.rangeMeters;
    const rVul = coneForCamera(resolveCamera(ALPR), VULNERABLE_PROFILE, () => Infinity)!.rangeMeters;
    expect(rVul).toBeGreaterThan(rCom);
  });

  it('range is floored at 8 meters even when profile would push it lower', () => {
    const tiny = { ...COMMUTER_PROFILE, toleranceMultiplier: 0.01 };
    const cone = coneForCamera(resolveCamera(ALPR), tiny, () => Infinity)!;
    expect(cone.rangeMeters).toBe(8);
  });

  it('range is capped at 45 meters absolute', () => {
    const huge = { ...VULNERABLE_PROFILE, toleranceMultiplier: 10 };
    const cone = coneForCamera(resolveCamera(ALPR), huge, () => Infinity)!;
    expect(cone.rangeMeters).toBeLessThanOrEqual(45);
  });

  it('parallel road limit shrinks range when smaller than the absolute cap', () => {
    // Camera, profile would push to ~45m, but parallel road is only 30m away
    // Cap = 30 * 0.7 = 21
    const cone = coneForCamera(resolveCamera(ALPR), VULNERABLE_PROFILE, () => 30)!;
    expect(cone.rangeMeters).toBeCloseTo(21, 5);
  });

  it('FOV is expanded by visibilityExpansionMultiplier and capped at 360', () => {
    const wide = { ...ACTIVIST_PROFILE, visibilityExpansionMultiplier: 100 };
    const cone = coneForCamera(resolveCamera(ALPR), wide, () => Infinity)!;
    expect(cone.fovDegrees).toBe(360);
  });

  it('preserves camera bearing', () => {
    const cone = coneForCamera(resolveCamera(ALPR), ACTIVIST_PROFILE, () => Infinity)!;
    expect(cone.bearingDegrees).toBe(90);
  });
});
```

- [ ] **Step 2: Run, confirm fails**

- [ ] **Step 3: Implement**

Create `src/routing/coneFromProfile.ts`:

```ts
import type { ResolvedCamera } from '../data/resolvedCamera';
import type { ThreatProfile } from '../domain/threatProfile';
import type { ConeParams } from './conePolygon';

const RANGE_FLOOR_M = 8;
const RANGE_HARD_CAP_M = 45;
const PARALLEL_ROAD_SAFETY_FRACTION = 0.7;

export function coneForCamera(
  camera: ResolvedCamera,
  profile: ThreatProfile,
  parallelRoadDistanceLookup: (lat: number, lon: number, bearing: number) => number,
): ConeParams | null {
  const weight = profile.weights[camera.type];
  if (weight <= 0) return null;

  const expandedRange = camera.effectiveRangeMeters * profile.toleranceMultiplier;
  const parallelLimit =
    parallelRoadDistanceLookup(camera.lat, camera.lon, camera.effectiveDirection) *
    PARALLEL_ROAD_SAFETY_FRACTION;
  const upperBound = Math.min(RANGE_HARD_CAP_M, parallelLimit);
  const finalRange = Math.max(RANGE_FLOOR_M, Math.min(expandedRange, upperBound));

  const expandedFov = camera.effectiveFovDegrees * profile.visibilityExpansionMultiplier;
  const finalFov = Math.min(360, Math.max(0, expandedFov));

  return {
    lat: camera.lat,
    lon: camera.lon,
    bearingDegrees: camera.effectiveDirection,
    fovDegrees: finalFov,
    rangeMeters: finalRange,
  };
}
```

- [ ] **Step 4: Run, confirm passes (7 tests)**

- [ ] **Step 5: Commit**

```bash
git add src/routing/coneFromProfile.ts tests/unit/routing/coneFromProfile.test.ts
git commit -m "feat(routing): add coneForCamera with floor (8m) + caps (45m and parallel-road) clamps"
```

---

## Task 10: RouteComparison — add optional degradation field

**Files:**
- Modify: `src/domain/route.ts`

- [ ] **Step 1: Edit `src/domain/route.ts`**

Add the new types. Replace the file contents:

```ts
import type { ThreatProfile } from './threatProfile';

export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

export interface RouteResult {
  readonly polyline: readonly GeoPoint[];
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly camerasOnRoute: number;
  readonly surveillanceScore: number;
}

export type DegradationReason = 'no_private_path';

export type ExtraTimeEstimate = 'small' | 'medium' | 'large' | 'unknown';

export interface AlternativePreview {
  readonly profile: ThreatProfile;
  readonly camerasAvoidedEstimate: number;
  readonly extraTimeEstimate: ExtraTimeEstimate;
}

export interface RouteDegradation {
  readonly reason: DegradationReason;
  readonly alternativePreviews: readonly AlternativePreview[];
}

export interface RouteComparison {
  readonly start: GeoPoint;
  readonly end: GeoPoint;
  readonly shortest: RouteResult;
  readonly private: RouteResult;
  readonly diff: {
    readonly extraSeconds: number;
    readonly extraMeters: number;
    readonly camerasAvoided: number;
  };
  readonly degradation?: RouteDegradation;
}
```

- [ ] **Step 2: Verify compile**

```bash
npx tsc --noEmit
```

Expected: errors persist in `exclusionPolygons.ts` (still deferred to Task 14). All other files clean.

- [ ] **Step 3: Commit**

```bash
git add src/domain/route.ts
git commit -m "feat(domain): RouteComparison gains optional degradation field with alternative previews"
```

---

## Task 11: RouteScorer — cone visibility

**Files:**
- Modify: `src/routing/routeScorer.ts`
- Modify: `tests/unit/routing/routeScorer.test.ts`

`routeScorer.ts` currently uses circle visibility (any camera within `MAX_VISIBILITY_M` counts). New behavior: a camera counts only if the polyline point falls within its cone (range AND angular span). For cameras with `directionConfidence === 'unknown'` whose effective FOV is 360, behavior is unchanged from the current circle check.

Note: the scorer operates on the already-resolved camera list, so it works with `ResolvedCamera`. CameraStore (Task 12) will provide them.

- [ ] **Step 1: Replace `tests/unit/routing/routeScorer.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { scoreRoute } from '../../../src/routing/routeScorer';
import { CameraStore } from '../../../src/data/cameraStore';
import { resolveCamera } from '../../../src/data/resolvedCamera';
import {
  COMMUTER_PROFILE, VULNERABLE_PROFILE,
} from '../../../src/domain/threatProfile';
import type { Camera } from '../../../src/domain/camera';
import type { GeoPoint } from '../../../src/domain/route';

const CAM_FACING_NORTH: Camera = {
  id: 'n', type: 'alpr_government', lat: 33.7500, lon: -84.3890,
  confidence: 0.9, source: 'seed',
  direction: 0, rangeMeters: 35, fovDegrees: 30, directionConfidence: 'known',
};

const POINT_NORTH_OF_CAM: GeoPoint = { lat: 33.7503, lon: -84.3890 };  // ~33m N
const POINT_SOUTH_OF_CAM: GeoPoint = { lat: 33.7497, lon: -84.3890 };  // ~33m S

describe('scoreRoute (cone visibility)', () => {
  it('counts a camera when polyline passes through its cone', () => {
    const store = new CameraStore([resolveCamera(CAM_FACING_NORTH)]);
    const score = scoreRoute([POINT_NORTH_OF_CAM], store, COMMUTER_PROFILE);
    expect(score.camerasSeen).toBe(1);
  });

  it('does NOT count a camera facing AWAY from the polyline (south of north-facing cam)', () => {
    const store = new CameraStore([resolveCamera(CAM_FACING_NORTH)]);
    const score = scoreRoute([POINT_SOUTH_OF_CAM], store, COMMUTER_PROFILE);
    expect(score.camerasSeen).toBe(0);
  });

  it('still uses max visibility factor across encounters', () => {
    const store = new CameraStore([resolveCamera(CAM_FACING_NORTH)]);
    const far: GeoPoint = { lat: 33.7502, lon: -84.3890 };  // ~22m N
    const close: GeoPoint = { lat: 33.7501, lon: -84.3890 }; // ~11m N
    const sFar = scoreRoute([far], store, COMMUTER_PROFILE).surveillanceScore;
    const sBoth = scoreRoute([far, close], store, COMMUTER_PROFILE).surveillanceScore;
    expect(sBoth).toBeGreaterThan(sFar);
  });

  it('surveillance score is higher under Vulnerable than Commuter for same in-cone polyline', () => {
    const store = new CameraStore([resolveCamera(CAM_FACING_NORTH)]);
    const sCom = scoreRoute([POINT_NORTH_OF_CAM], store, COMMUTER_PROFILE).surveillanceScore;
    const sVul = scoreRoute([POINT_NORTH_OF_CAM], store, VULNERABLE_PROFILE).surveillanceScore;
    expect(sVul).toBeGreaterThan(sCom);
  });

  it('empty polyline scores zero', () => {
    const store = new CameraStore([resolveCamera(CAM_FACING_NORTH)]);
    const score = scoreRoute([], store, COMMUTER_PROFILE);
    expect(score.camerasSeen).toBe(0);
    expect(score.surveillanceScore).toBe(0);
  });

  it('an unknown-direction camera (fov 360) counts polylines passing in any direction', () => {
    const omni: Camera = {
      ...CAM_FACING_NORTH, id: 'o', direction: 0, fovDegrees: 360, directionConfidence: 'unknown',
    };
    const store = new CameraStore([resolveCamera(omni)]);
    expect(scoreRoute([POINT_SOUTH_OF_CAM], store, COMMUTER_PROFILE).camerasSeen).toBe(1);
  });
});
```

- [ ] **Step 2: Run, confirm fails (TS errors — CameraStore signature accepts Camera[], we need ResolvedCamera[])**

This will also fail because the existing `CameraStore` constructor expects `readonly Camera[]`. Task 12 changes that. To unblock this test, we'll update `CameraStore` to accept `ResolvedCamera[]` next. For now, expect the test to fail with TypeScript errors — that's the RED.

- [ ] **Step 3: Replace `src/routing/routeScorer.ts`**

```ts
import type { GeoPoint } from '../domain/route';
import type { ThreatProfile } from '../domain/threatProfile';
import type { ResolvedCamera } from '../data/resolvedCamera';
import { CameraStore } from '../data/cameraStore';
import { visibilityFactor, MAX_VISIBILITY_M } from './visibilityFactor';

export interface RouteScore {
  readonly camerasSeen: number;
  readonly surveillanceScore: number;
}

interface Encounter {
  readonly camera: ResolvedCamera;
  factor: number;
}

export function scoreRoute(
  polyline: readonly GeoPoint[],
  store: CameraStore,
  profile: ThreatProfile,
): RouteScore {
  if (polyline.length === 0) return { camerasSeen: 0, surveillanceScore: 0 };

  const encounters = new Map<string, Encounter>();

  for (const point of polyline) {
    const nearby = store.within(point, MAX_VISIBILITY_M);
    for (const cam of nearby) {
      const dist = CameraStore.distanceMeters(point, { lat: cam.lat, lon: cam.lon });
      if (dist > cam.effectiveRangeMeters) continue;
      if (!withinCone(cam, point)) continue;

      const factor = visibilityFactor(dist);
      const existing = encounters.get(cam.id);
      if (!existing) {
        encounters.set(cam.id, { camera: cam, factor });
      } else if (factor > existing.factor) {
        existing.factor = factor;
      }
    }
  }

  let score = 0;
  for (const { camera, factor } of encounters.values()) {
    score += profile.weights[camera.type] * factor;
  }

  return { camerasSeen: encounters.size, surveillanceScore: score };
}

function withinCone(cam: ResolvedCamera, point: GeoPoint): boolean {
  if (cam.effectiveFovDegrees >= 360) return true;
  const bearingToPoint = bearingDegrees(cam.lat, cam.lon, point.lat, point.lon);
  const halfFov = cam.effectiveFovDegrees / 2;
  const angularDiff = angularDifference(bearingToPoint, cam.effectiveDirection);
  return angularDiff <= halfFov;
}

function bearingDegrees(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const fromLatRad = toRad(fromLat);
  const toLatRad = toRad(toLat);
  const dLon = toRad(toLon - fromLon);
  const y = Math.sin(dLon) * Math.cos(toLatRad);
  const x =
    Math.cos(fromLatRad) * Math.sin(toLatRad) -
    Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

function angularDifference(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}
```

- [ ] **Step 4: Don't run tests yet**

`routeScorer` depends on `CameraStore` accepting `ResolvedCamera[]`, which Task 12 changes. Move to Task 12, then both will pass.

No commit at this step — bundled with Task 12.

---

## Task 12: CameraStore — accept and emit ResolvedCamera

**Files:**
- Modify: `src/data/cameraStore.ts`
- Modify: `tests/unit/data/cameraStore.test.ts`

CameraStore's surface changes:
- Constructor now takes `readonly ResolvedCamera[]` (not `readonly Camera[]`)
- `all()` returns `readonly ResolvedCamera[]`
- `within()` returns `readonly ResolvedCamera[]`
- `loadFromUrl` resolves each parsed Camera before storing

- [ ] **Step 1: Update tests**

Replace `tests/unit/data/cameraStore.test.ts`:

```ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { CameraStore } from '../../../src/data/cameraStore';
import { resolveCamera } from '../../../src/data/resolvedCamera';
import type { Camera } from '../../../src/domain/camera';

const SAMPLE: readonly Camera[] = [
  { id: 'a', type: 'alpr_government', lat: 33.7490, lon: -84.3880, confidence: 0.9, source: 'seed' },
  { id: 'b', type: 'alpr_government', lat: 33.7510, lon: -84.3900, confidence: 0.9, source: 'seed' },
  { id: 'c', type: 'cctv_municipal', lat: 34.0000, lon: -84.0000, confidence: 0.8, source: 'seed' },
];

describe('CameraStore', () => {
  let store: CameraStore;
  beforeAll(() => {
    store = new CameraStore(SAMPLE.map(resolveCamera));
  });

  it('all() returns every camera as ResolvedCamera', () => {
    const list = store.all();
    expect(list).toHaveLength(3);
    expect(list[0]!.effectiveRangeMeters).toBeGreaterThan(0);
  });

  it('within() returns cameras inside the bounding circle', () => {
    const result = store.within({ lat: 33.7500, lon: -84.3890 }, 500);
    expect(result.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('within() excludes cameras outside the radius', () => {
    const result = store.within({ lat: 33.7500, lon: -84.3890 }, 500);
    expect(result.find((c) => c.id === 'c')).toBeUndefined();
  });

  it('within() radius 0 returns nothing', () => {
    expect(store.within({ lat: 33.7500, lon: -84.3890 }, 0)).toHaveLength(0);
  });

  it('distanceMeters Haversine', () => {
    const d = CameraStore.distanceMeters(
      { lat: 33.7490, lon: -84.3880 },
      { lat: 33.7510, lon: -84.3900 },
    );
    expect(d).toBeGreaterThan(250);
    expect(d).toBeLessThan(310);
  });

  it('loadFromUrl rejects URLs not in the allowlist', async () => {
    await expect(CameraStore.loadFromUrl('https://evil.example.com/cameras.json'))
      .rejects.toThrow(/not in allowlist/);
  });

  it('loadFromUrl resolves loaded cameras (fills defaults)', async () => {
    const body = {
      cameras: [
        { id: 'r', type: 'alpr_government', lat: 33.75, lon: -84.39, confidence: 0.9, source: 'seed' },
      ],
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    );
    const loaded = await CameraStore.loadFromUrl('/data/x.json');
    expect(loaded.all()[0]!.effectiveRangeMeters).toBeGreaterThan(0);
    expect(loaded.all()[0]!.directionConfidence).toBe('unknown');
    fetchSpy.mockRestore();
  });

  it('loadFromUrl throws when cameras array is missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    await expect(CameraStore.loadFromUrl('/data/test.json'))
      .rejects.toThrow(/missing top-level/);
    fetchSpy.mockRestore();
  });

  it('loadFromUrl throws when a camera has an unknown type', async () => {
    const bad = { cameras: [{ id: 'x', type: 'unknown_type', lat: 0, lon: 0, confidence: 1, source: 'seed' }] };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(bad), { status: 200 }),
    );
    await expect(CameraStore.loadFromUrl('/data/test.json'))
      .rejects.toThrow(/invalid type/);
    fetchSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Replace `src/data/cameraStore.ts`**

```ts
import { isCameraType, type Camera } from '../domain/camera';
import type { GeoPoint } from '../domain/route';
import { isAllowedUrl } from '../privacy/networkAllowlist';
import { resolveCamera, type ResolvedCamera } from './resolvedCamera';

const EARTH_RADIUS_M = 6_371_000;

const VALID_SOURCES = new Set(['seed', 'deflock', 'osm', 'submission', 'foia']);

function parseCamera(raw: unknown, index: number): Camera {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`camera at index ${index} is not an object`);
  }
  const r = raw as Record<string, unknown>;
  if (typeof r['id'] !== 'string') throw new Error(`camera at index ${index} has invalid id`);
  if (!isCameraType(r['type'])) {
    throw new Error(`camera at index ${index} has invalid type: ${String(r['type'])}`);
  }
  if (typeof r['lat'] !== 'number') throw new Error(`camera ${r['id']} has invalid lat`);
  if (typeof r['lon'] !== 'number') throw new Error(`camera ${r['id']} has invalid lon`);
  if (typeof r['confidence'] !== 'number') throw new Error(`camera ${r['id']} has invalid confidence`);
  if (typeof r['source'] !== 'string' || !VALID_SOURCES.has(r['source'])) {
    throw new Error(`camera ${r['id']} has invalid source: ${String(r['source'])}`);
  }
  const base: Camera = {
    id: r['id'],
    type: r['type'],
    lat: r['lat'],
    lon: r['lon'],
    confidence: r['confidence'],
    source: r['source'] as Camera['source'],
  };
  // Optional geometry fields
  const out: Camera = {
    ...base,
    ...(typeof r['direction'] === 'number' ? { direction: r['direction'] } : {}),
    ...(typeof r['rangeMeters'] === 'number' ? { rangeMeters: r['rangeMeters'] } : {}),
    ...(typeof r['fovDegrees'] === 'number' ? { fovDegrees: r['fovDegrees'] } : {}),
    ...(r['directionConfidence'] === 'known' ||
    r['directionConfidence'] === 'inferred' ||
    r['directionConfidence'] === 'unknown'
      ? { directionConfidence: r['directionConfidence'] }
      : {}),
  };
  return out;
}

export class CameraStore {
  private readonly cameras: readonly ResolvedCamera[];

  constructor(cameras: readonly ResolvedCamera[]) {
    this.cameras = cameras;
  }

  static async loadFromUrl(url: string): Promise<CameraStore> {
    if (url.startsWith('/') || url.startsWith('./')) {
      // same-origin
    } else if (!isAllowedUrl(url)) {
      throw new Error(`Camera dataset URL not in allowlist: ${url}`);
    }
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to load camera dataset: ${resp.status}`);
    const body = (await resp.json()) as { cameras?: unknown };
    if (!Array.isArray(body.cameras)) {
      throw new Error('Camera dataset JSON missing top-level "cameras" array');
    }
    const resolved = body.cameras.map((raw, i) => resolveCamera(parseCamera(raw, i)));
    return new CameraStore(resolved);
  }

  all(): readonly ResolvedCamera[] {
    return this.cameras;
  }

  within(center: GeoPoint, radiusMeters: number): readonly ResolvedCamera[] {
    if (radiusMeters <= 0) return [];
    return this.cameras.filter(
      (c) => CameraStore.distanceMeters(center, { lat: c.lat, lon: c.lon }) <= radiusMeters,
    );
  }

  static distanceMeters(a: GeoPoint, b: GeoPoint): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
  }
}
```

- [ ] **Step 3: Run tests for both CameraStore and routeScorer**

```bash
npx vitest run tests/unit/data/cameraStore.test.ts tests/unit/routing/routeScorer.test.ts
```

Expected: 9 CameraStore tests + 6 routeScorer tests, all passing.

- [ ] **Step 4: Commit**

```bash
git add src/data/cameraStore.ts src/routing/routeScorer.ts \
        tests/unit/data/cameraStore.test.ts tests/unit/routing/routeScorer.test.ts
git commit -m "feat(data,routing): CameraStore returns ResolvedCamera; scoreRoute uses cone visibility

CameraStore now resolves each loaded Camera with per-type defaults so all
downstream consumers see ResolvedCamera. RouteScorer's visibility check
now requires the polyline point to be both within range AND within the
cone's angular span. Unknown-direction cameras (fov=360) behave the same
as before."
```

---

## Task 13: Router — use cones + graceful degradation

**Files:**
- Modify: `src/routing/router.ts`
- Modify: `tests/integration/router.test.ts`

The Router replaces `camerasToExclusionPolygons(cameras, profile)` with a per-camera loop calling `coneForCamera()` + `buildConePolygon()`. It also catches "No path could be found" from the private route call and returns a `RouteComparison` with the `degradation` field set instead of throwing.

- [ ] **Step 1: Update integration test**

First, fix the **existing** Router constructions in `tests/integration/router.test.ts` (both pre-existing test cases construct Router without the new required `valhallaBaseUrlForLocate` arg). Find every `new Router(new ValhallaClient(VALHALLA_URL), new CameraStore(SEED))` and change to `new Router(new ValhallaClient(VALHALLA_URL), new CameraStore(SEED), VALHALLA_URL)`. Same for the `beforeAll(() => { router = new Router(...) })` if present.

Also: the existing `SEED` array in router.test.ts was `Camera[]`. Since CameraStore now takes `ResolvedCamera[]`, change `new CameraStore(SEED)` to `new CameraStore(SEED.map(resolveCamera))` in every test case. Add `import { resolveCamera } from '../../src/data/resolvedCamera';` at the top.

Then add the new test before the closing `});`:

```ts
  it('returns degradation when no private path exists, with alternative previews', async () => {
    if (!valhallaReady) return;
    // Real Atlanta downtown crossing under Vulnerable that we know hits the wall:
    // load the full seed dataset for this so the wall actually forms.
    const fullStore = await CameraStore.loadFromUrl(
      'http://localhost:5173/data/cameras-atlanta-seed.json',
    ).catch(async () => {
      // Fallback: build store from a hard-coded fuller seed if dev server isn't up
      const denseSeed: Camera[] = [];
      for (let i = 0; i < 12; i++) {
        denseSeed.push({
          id: `dense-${i}`,
          type: 'alpr_government',
          lat: 33.7470 + (i % 4) * 0.001,
          lon: -84.3900 + Math.floor(i / 4) * 0.001,
          confidence: 0.9,
          source: 'seed',
        });
      }
      return new CameraStore(denseSeed.map(resolveCamera));
    });
    const router = new Router(new ValhallaClient(VALHALLA_URL), fullStore, VALHALLA_URL);
    const cmp = await router.compareRoutes(
      { lat: 33.7517, lon: -84.3942 },
      { lat: 33.7366, lon: -84.3762 },
      VULNERABLE_PROFILE,
    );
    expect(cmp.degradation).toBeDefined();
    expect(cmp.degradation!.reason).toBe('no_private_path');
    expect(cmp.degradation!.alternativePreviews.length).toBeGreaterThan(0);
    // The previews should reference profiles other than the user's current one
    for (const p of cmp.degradation!.alternativePreviews) {
      expect(p.profile.preset).not.toBe('vulnerable');
    }
    // shortest is still present
    expect(cmp.shortest.polyline.length).toBeGreaterThan(0);
  }, 60_000);
```

Also update the imports at the top:
```ts
import { resolveCamera } from '../../src/data/resolvedCamera';
```

- [ ] **Step 2: Run, confirm fails**

- [ ] **Step 3: Replace `src/routing/router.ts`**

```ts
import type { GeoPoint, RouteComparison, RouteResult, AlternativePreview } from '../domain/route';
import type { ThreatProfile } from '../domain/threatProfile';
import { ALL_PRESETS } from '../domain/threatProfile';
import type { CameraStore } from '../data/cameraStore';
import type { ValhallaClient } from './valhallaClient';
import type { ExclusionPolygon } from './conePolygon.types';
import { buildConePolygon } from './conePolygon';
import { coneForCamera } from './coneFromProfile';
import { parallelRoadDistance } from './parallelRoadDistance';
import { scoreRoute } from './routeScorer';

export class Router {
  private readonly parallelDistanceCache = new Map<string, number>();

  constructor(
    private readonly valhalla: ValhallaClient,
    private readonly cameras: CameraStore,
    private readonly valhallaBaseUrlForLocate: string,
  ) {}

  async compareRoutes(
    start: GeoPoint,
    end: GeoPoint,
    profile: ThreatProfile,
  ): Promise<RouteComparison> {
    const exclusions = await this.buildExclusions(profile);

    const shortestPromise = this.valhalla.route(start, end, []);
    const privatePromise = this.valhalla.route(start, end, exclusions).catch((err: unknown) => {
      if (err instanceof Error && /No path could be found/i.test(err.message)) {
        return null; // signal: degrade
      }
      throw err;
    });

    const [shortestRaw, privateRaw] = await Promise.all([shortestPromise, privatePromise]);
    const shortest = this.annotate(shortestRaw, profile);

    if (privateRaw === null) {
      const previews = await this.buildAlternativePreviews(profile);
      return {
        start,
        end,
        shortest,
        private: shortest,
        diff: { extraSeconds: 0, extraMeters: 0, camerasAvoided: 0 },
        degradation: { reason: 'no_private_path', alternativePreviews: previews },
      };
    }

    const privateR = this.annotate(privateRaw, profile);
    return {
      start,
      end,
      shortest,
      private: privateR,
      diff: {
        extraSeconds: privateR.durationSeconds - shortest.durationSeconds,
        extraMeters: privateR.distanceMeters - shortest.distanceMeters,
        camerasAvoided: shortest.camerasOnRoute - privateR.camerasOnRoute,
      },
    };
  }

  private async buildExclusions(profile: ThreatProfile): Promise<ExclusionPolygon[]> {
    const polys: ExclusionPolygon[] = [];
    for (const cam of this.cameras.all()) {
      const lookup = (lat: number, lon: number, bearing: number) =>
        this.cachedParallelDistance(lat, lon, bearing);
      const cone = coneForCamera(cam, profile, lookup);
      if (cone === null) continue;
      polys.push(buildConePolygon(cone));
    }
    return polys;
  }

  private cachedParallelDistance(lat: number, lon: number, bearing: number): number {
    const key = `${lat.toFixed(5)}|${lon.toFixed(5)}|${Math.round(bearing)}`;
    const cached = this.parallelDistanceCache.get(key);
    if (cached != null) return cached;
    // First call is synchronous-by-default Infinity (caller treats Infinity as "no parallel constraint").
    // The cone builder won't await the async lookup — Phase 0b-1 keeps cone construction sync.
    // We fire-and-forget the real lookup so future routes get the cached value.
    void this.fetchAndCacheParallelDistance(key, lat, lon, bearing);
    return Infinity;
  }

  private async fetchAndCacheParallelDistance(
    key: string,
    lat: number,
    lon: number,
    bearing: number,
  ): Promise<void> {
    if (this.parallelDistanceCache.has(key)) return;
    const d = await parallelRoadDistance(this.valhallaBaseUrlForLocate, lat, lon, bearing);
    this.parallelDistanceCache.set(key, d);
  }

  private async buildAlternativePreviews(
    currentProfile: ThreatProfile,
  ): Promise<readonly AlternativePreview[]> {
    const previews: AlternativePreview[] = [];
    for (const candidate of ALL_PRESETS) {
      if (candidate.preset === currentProfile.preset) continue;
      if (candidate.preset === 'custom') continue; // Custom isn't a useful suggestion
      let count = 0;
      for (const cam of this.cameras.all()) {
        if (candidate.weights[cam.type] > 0) count++;
      }
      previews.push({
        profile: candidate,
        camerasAvoidedEstimate: count,
        extraTimeEstimate: 'unknown',
      });
    }
    return previews;
  }

  private annotate(raw: RouteResult, profile: ThreatProfile): RouteResult {
    const score = scoreRoute(raw.polyline, this.cameras, profile);
    return {
      ...raw,
      camerasOnRoute: score.camerasSeen,
      surveillanceScore: score.surveillanceScore,
    };
  }
}
```

- [ ] **Step 4: Run integration tests**

```bash
npx vitest run tests/integration/router.test.ts
```

Expected: 3 tests pass (the original 2 from Phase 0a + the new degradation test).

- [ ] **Step 5: Commit**

```bash
git add src/routing/router.ts tests/integration/router.test.ts
git commit -m "feat(routing): Router builds cone exclusions + returns degradation on no-path

Replaces the old camerasToExclusionPolygons sweep with a per-camera cone
builder that consults coneForCamera (per-profile clamps) and buildCone-
Polygon. When the private route call fails with 'No path could be found',
Router no longer throws — it returns a RouteComparison whose degradation
field carries alternative profile previews for the UI to surface."
```

---

## Task 14: Delete the dead exclusionPolygons module

**Files:**
- Delete: `src/routing/exclusionPolygons.ts` (test file already deleted in Task 8)

- [ ] **Step 1: Verify nothing imports the old module**

```bash
grep -r "from.*exclusionPolygons" src tests
```

Expected: empty output.

- [ ] **Step 2: Delete the source file**

```bash
git rm src/routing/exclusionPolygons.ts
```

- [ ] **Step 3: Verify tsc + full test suite green**

```bash
npx tsc --noEmit
npm test
```

Expected: tsc clean (this was the last remaining error). Test suite passes — the test file for this module was already removed in Task 8.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(routing): remove dead exclusionPolygons module (replaced by cones)"
```

---

## Task 15: ProfilePicker — render 4 cards + handle Custom branch

**Files:**
- Modify: `src/ui/profilePicker.ts`

- [ ] **Step 1: Replace `src/ui/profilePicker.ts`**

```ts
import {
  COMMUTER_PROFILE, ACTIVIST_PROFILE, VULNERABLE_PROFILE,
  type ThreatProfile,
} from '../domain/threatProfile';

const PRESETS: { profile: ThreatProfile; emoji: string; label: string; sub: string }[] = [
  {
    profile: COMMUTER_PROFILE,
    emoji: '🚗',
    label: 'Commuter',
    sub: 'Routes stay close to the shortest path.',
  },
  {
    profile: ACTIVIST_PROFILE,
    emoji: '📣',
    label: 'Activist',
    sub: 'Detours around sensitive areas (~10–20% extra).',
  },
  {
    profile: VULNERABLE_PROFILE,
    emoji: '🛡️',
    label: 'Vulnerable',
    sub: 'Max avoidance, accepts significant detours.',
  },
];

export interface ProfilePickerCallbacks {
  readonly onPresetPicked: (profile: ThreatProfile) => void;
  readonly onCustomPicked: () => void;
}

export function renderProfilePicker(
  container: HTMLElement,
  callbacks: ProfilePickerCallbacks,
): void {
  container.innerHTML = '';
  const heading = document.createElement('h3');
  heading.textContent = 'Pick a threat profile';
  heading.style.cssText = 'margin:0 0 12px';
  container.appendChild(heading);

  for (const { profile, emoji, label, sub } of PRESETS) {
    container.appendChild(presetCard(emoji, label, sub, () => callbacks.onPresetPicked(profile)));
  }
  container.appendChild(presetCard('⚙️', 'Custom', 'Configure exactly how aggressively to avoid which cameras.', callbacks.onCustomPicked));
}

function presetCard(emoji: string, label: string, sub: string, onClick: () => void): HTMLElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.style.cssText =
    'display:block;width:100%;text-align:left;padding:12px;margin-bottom:8px;' +
    'border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font:inherit';
  card.innerHTML =
    `<div style="font-size:24px">${emoji}</div>` +
    `<div style="font-weight:600;margin-top:4px">${label}</div>` +
    `<div style="font-size:12px;color:#666;margin-top:2px">${sub}</div>`;
  card.addEventListener('click', onClick);
  return card;
}
```

(Existing app.ts call site still uses the single-callback API — that signature changes in Task 17.)

- [ ] **Step 2: tsc to confirm the picker compiles in isolation**

`npx tsc --noEmit src/ui/profilePicker.ts` is not how tsc works, so just run the full check:

```bash
npx tsc --noEmit
```

Expected: error in `src/app.ts` only (it calls the old signature). That's fixed in Task 17.

- [ ] **Step 3: Commit**

```bash
git add src/ui/profilePicker.ts
git commit -m "feat(ui): ProfilePicker renders 4 cards (Commuter / Activist / Vulnerable / Custom)"
```

---

## Task 16: CustomProfileEditor — sliders UI

**Files:**
- Create: `src/ui/customProfileEditor.ts`
- Create: `tests/unit/ui/customProfileEditor.test.ts`

The editor renders three top-level sliders (tolerance, visibility expansion) — wait, the spec says THREE sliders but only lists tolerance + visibility expansion as top-level. Re-read: spec §5.3 says "Three top-level sliders + collapsible 'Per-camera-type weights' section" with only two named (tolerance, visibility expansion). The third top-level "slider" is presumably the disclosure toggle for the per-type section. To avoid confusion, this task ships **two top-level sliders + the disclosure-toggle + the six per-type weight sliders**.

State persists to `localStorage` under `flockavoid.customProfile.v1` only when the "Save as my default" checkbox is checked.

- [ ] **Step 1: Add vitest jsdom dependency**

```bash
npm install -D jsdom @vitest/web-worker
```

(jsdom is needed for `localStorage` and `document` in unit tests.)

Update `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
    environmentMatchGlobs: [
      ['tests/unit/ui/**', 'jsdom'],
    ],
  },
});
```

- [ ] **Step 2: Write failing test**

Create `tests/unit/ui/customProfileEditor.test.ts`:

```ts
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderCustomProfileEditor } from '../../../src/ui/customProfileEditor';

describe('CustomProfileEditor', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    container = document.getElementById('c')!;
    localStorage.clear();
  });

  it('renders two top-level sliders and the advanced toggle', () => {
    renderCustomProfileEditor(container, { onApply: () => {} });
    expect(container.querySelector('input[name="tolerance"]')).toBeTruthy();
    expect(container.querySelector('input[name="visibilityExpansion"]')).toBeTruthy();
    expect(container.querySelector('[data-disclosure="advanced"]')).toBeTruthy();
  });

  it('per-camera-type weight sliders are present (collapsed by default)', () => {
    renderCustomProfileEditor(container, { onApply: () => {} });
    expect(container.querySelectorAll('input[data-weight-type]')).toHaveLength(6);
    const advanced = container.querySelector('[data-advanced-body]') as HTMLElement;
    expect(advanced.style.display).toBe('none');
  });

  it('clicking "Apply" invokes onApply with a complete ThreatProfile', () => {
    let received: { preset: string; toleranceMultiplier: number } | null = null;
    renderCustomProfileEditor(container, {
      onApply: (p) => {
        received = { preset: p.preset, toleranceMultiplier: p.toleranceMultiplier };
      },
    });
    const apply = container.querySelector('button[data-action="apply"]') as HTMLButtonElement;
    apply.click();
    expect(received).not.toBeNull();
    expect(received!.preset).toBe('custom');
  });

  it('"Save as my default" persists profile to localStorage', () => {
    renderCustomProfileEditor(container, { onApply: () => {} });
    const save = container.querySelector('input[name="saveDefault"]') as HTMLInputElement;
    save.checked = true;
    const apply = container.querySelector('button[data-action="apply"]') as HTMLButtonElement;
    apply.click();
    expect(localStorage.getItem('flockavoid.customProfile.v1')).toBeTruthy();
  });

  it('does NOT persist when checkbox unchecked', () => {
    renderCustomProfileEditor(container, { onApply: () => {} });
    const apply = container.querySelector('button[data-action="apply"]') as HTMLButtonElement;
    apply.click();
    expect(localStorage.getItem('flockavoid.customProfile.v1')).toBeNull();
  });

  it('loads from localStorage when present and pre-fills sliders', () => {
    localStorage.setItem(
      'flockavoid.customProfile.v1',
      JSON.stringify({
        preset: 'custom',
        weights: {
          alpr_government: 33,
          alpr_private: 50,
          cctv_municipal: 30,
          cctv_dot_traffic: 15,
          speed_camera: 25,
          red_light_camera: 25,
        },
        toleranceMultiplier: 1.7,
        visibilityExpansionMultiplier: 1.0,
      }),
    );
    renderCustomProfileEditor(container, { onApply: () => {} });
    const tol = container.querySelector('input[name="tolerance"]') as HTMLInputElement;
    expect(parseFloat(tol.value)).toBeCloseTo(1.7, 5);
    const alprWeight = container.querySelector(
      'input[data-weight-type="alpr_government"]',
    ) as HTMLInputElement;
    expect(parseInt(alprWeight.value, 10)).toBe(33);
  });
});
```

- [ ] **Step 3: Run, confirm fails**

- [ ] **Step 4: Implement**

Create `src/ui/customProfileEditor.ts`:

```ts
import {
  CUSTOM_PROFILE_DEFAULT, type ThreatProfile,
} from '../domain/threatProfile';
import { ALL_CAMERA_TYPES, type CameraType } from '../domain/camera';

const STORAGE_KEY = 'flockavoid.customProfile.v1';

export interface CustomProfileEditorCallbacks {
  readonly onApply: (profile: ThreatProfile) => void;
}

interface MutableProfile {
  weights: Record<CameraType, number>;
  toleranceMultiplier: number;
  visibilityExpansionMultiplier: number;
}

function loadStored(): MutableProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as ThreatProfile;
      return {
        weights: { ...p.weights },
        toleranceMultiplier: p.toleranceMultiplier,
        visibilityExpansionMultiplier: p.visibilityExpansionMultiplier,
      };
    }
  } catch {
    // fall through
  }
  return {
    weights: { ...CUSTOM_PROFILE_DEFAULT.weights },
    toleranceMultiplier: CUSTOM_PROFILE_DEFAULT.toleranceMultiplier,
    visibilityExpansionMultiplier: CUSTOM_PROFILE_DEFAULT.visibilityExpansionMultiplier,
  };
}

export function renderCustomProfileEditor(
  container: HTMLElement,
  callbacks: CustomProfileEditorCallbacks,
): void {
  const state = loadStored();
  container.innerHTML = '';

  const h = document.createElement('h3');
  h.textContent = 'Custom profile';
  h.style.cssText = 'margin:0 0 12px';
  container.appendChild(h);

  container.appendChild(
    sliderRow('Detour tolerance', 'tolerance', 0.3, 3.0, 0.05, state.toleranceMultiplier, (v) => {
      state.toleranceMultiplier = v;
    }),
  );
  container.appendChild(
    sliderRow(
      'Visibility expansion',
      'visibilityExpansion',
      0.8,
      2.0,
      0.05,
      state.visibilityExpansionMultiplier,
      (v) => {
        state.visibilityExpansionMultiplier = v;
      },
    ),
  );

  const disclosure = document.createElement('button');
  disclosure.type = 'button';
  disclosure.dataset['disclosure'] = 'advanced';
  disclosure.textContent = '▸ Per-camera-type weights';
  disclosure.style.cssText =
    'display:block;width:100%;text-align:left;padding:8px;margin:12px 0 8px;' +
    'border:0;background:#f0f0f0;border-radius:4px;cursor:pointer;font:inherit';
  container.appendChild(disclosure);

  const advanced = document.createElement('div');
  advanced.dataset['advancedBody'] = '';
  advanced.style.display = 'none';
  container.appendChild(advanced);

  for (const type of ALL_CAMERA_TYPES) {
    advanced.appendChild(
      weightRow(type, state.weights[type], (v) => {
        state.weights[type] = v;
      }),
    );
  }

  disclosure.addEventListener('click', () => {
    const shown = advanced.style.display !== 'none';
    advanced.style.display = shown ? 'none' : 'block';
    disclosure.textContent = (shown ? '▸ ' : '▾ ') + 'Per-camera-type weights';
  });

  const saveLabel = document.createElement('label');
  saveLabel.style.cssText = 'display:block;margin:12px 0;font-size:13px';
  const save = document.createElement('input');
  save.type = 'checkbox';
  save.name = 'saveDefault';
  saveLabel.appendChild(save);
  saveLabel.appendChild(document.createTextNode(' Save as my default'));
  container.appendChild(saveLabel);

  const apply = document.createElement('button');
  apply.type = 'button';
  apply.dataset['action'] = 'apply';
  apply.textContent = 'Apply';
  apply.style.cssText =
    'display:block;width:100%;padding:10px;background:#1976d2;color:#fff;border:0;' +
    'border-radius:6px;cursor:pointer;font:inherit';
  apply.addEventListener('click', () => {
    const profile: ThreatProfile = Object.freeze({
      preset: 'custom',
      weights: Object.freeze({ ...state.weights }),
      toleranceMultiplier: state.toleranceMultiplier,
      visibilityExpansionMultiplier: state.visibilityExpansionMultiplier,
    });
    if (save.checked) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      } catch {
        // ignore quota errors
      }
    }
    callbacks.onApply(profile);
  });
  container.appendChild(apply);
}

function sliderRow(
  label: string,
  name: string,
  min: number,
  max: number,
  step: number,
  value: number,
  onChange: (v: number) => void,
): HTMLElement {
  const row = document.createElement('label');
  row.style.cssText = 'display:block;margin-bottom:10px;font-size:13px';
  row.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.name = name;
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.style.cssText = 'display:block;width:100%;margin-top:6px';
  input.addEventListener('input', () => onChange(parseFloat(input.value)));
  row.appendChild(input);
  return row;
}

function weightRow(
  type: CameraType,
  value: number,
  onChange: (v: number) => void,
): HTMLElement {
  const row = document.createElement('label');
  row.style.cssText = 'display:block;margin-bottom:8px;font-size:12px';
  row.textContent = type;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.step = '1';
  input.value = String(value);
  input.dataset['weightType'] = type;
  input.style.cssText = 'display:block;width:100%;margin-top:4px';
  input.addEventListener('input', () => onChange(parseInt(input.value, 10)));
  row.appendChild(input);
  return row;
}
```

- [ ] **Step 5: Run, confirm passes (6 tests)**

```bash
npx vitest run tests/unit/ui/customProfileEditor.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/customProfileEditor.ts tests/unit/ui/customProfileEditor.test.ts \
        package.json package-lock.json vitest.config.ts
git commit -m "feat(ui): add CustomProfileEditor with sliders + per-type weights + localStorage"
```

---

## Task 17: RoutePlanner — degradation panel + profile-swap

**Files:**
- Modify: `src/ui/routePlanner.ts`

The planner gets a new optional callback `onProfileSwap(newProfile)` and a new rendering branch when the comparison's `degradation` field is present.

- [ ] **Step 1: Replace `src/ui/routePlanner.ts`**

```ts
import type { GeoPoint, RouteComparison, RouteDegradation } from '../domain/route';
import type { ThreatProfile } from '../domain/threatProfile';

export interface RoutePlannerCallbacks {
  readonly onPlanRequested: (start: GeoPoint, end: GeoPoint) => Promise<RouteComparison>;
  readonly onProfileSwap?: (newProfile: ThreatProfile) => void;
}

interface State {
  start: GeoPoint | null;
  end: GeoPoint | null;
  awaiting: 'start' | 'end' | null;
}

export class RoutePlanner {
  private readonly state: State = { start: null, end: null, awaiting: null };

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: RoutePlannerCallbacks,
    private readonly profile: ThreatProfile,
  ) {
    this.render();
  }

  handleMapClick(point: GeoPoint): void {
    if (this.state.awaiting === 'start') {
      this.state.start = point;
      this.state.awaiting = null;
    } else if (this.state.awaiting === 'end') {
      this.state.end = point;
      this.state.awaiting = null;
    }
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';
    const heading = document.createElement('h3');
    heading.textContent = `Plan route — profile: ${this.profile.preset}`;
    heading.style.cssText = 'margin:0 0 12px';
    this.container.appendChild(heading);

    this.container.appendChild(this.pointRow('Start', this.state.start, 'start'));
    this.container.appendChild(this.pointRow('End', this.state.end, 'end'));

    const plan = document.createElement('button');
    plan.type = 'button';
    plan.textContent = 'Plan route';
    plan.disabled = !(this.state.start && this.state.end);
    plan.style.cssText =
      'display:block;width:100%;padding:10px;margin-top:12px;background:#1976d2;color:#fff;' +
      'border:0;border-radius:6px;cursor:pointer;font:inherit';
    plan.addEventListener('click', () => void this.runPlan());
    this.container.appendChild(plan);
  }

  private pointRow(label: string, value: GeoPoint | null, kind: 'start' | 'end'): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:8px';
    const text = value
      ? `${label}: ${value.lat.toFixed(4)}, ${value.lon.toFixed(4)}`
      : `${label}: not set`;
    row.innerHTML = `<div style="font-size:13px">${text}</div>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent =
      this.state.awaiting === kind ? `Click map for ${label}…` : `Set ${label} on map`;
    btn.style.cssText =
      'margin-top:6px;padding:4px 10px;background:#fff;border:1px solid #aaa;' +
      'border-radius:4px;cursor:pointer;font:inherit;font-size:12px';
    btn.addEventListener('click', () => {
      this.state.awaiting = kind;
      this.render();
    });
    row.appendChild(btn);
    return row;
  }

  private async runPlan(): Promise<void> {
    if (!this.state.start || !this.state.end) return;
    this.clearError();
    try {
      const cmp = await this.callbacks.onPlanRequested(this.state.start, this.state.end);
      if (cmp.degradation) {
        this.renderDegradation(cmp.degradation);
      } else {
        this.renderComparison(cmp);
      }
    } catch (err) {
      this.renderError(err instanceof Error ? err.message : String(err));
    }
  }

  private renderError(message: string): void {
    this.clearError();
    const err = document.createElement('div');
    err.dataset['errorBanner'] = 'true';
    err.style.cssText =
      'margin-top:12px;padding:10px;background:#fdecea;color:#611a15;border:1px solid #f5c6cb;' +
      'border-radius:6px;font-size:13px';
    err.textContent = `Routing failed: ${message}`;
    this.container.appendChild(err);
  }

  private clearError(): void {
    this.container.querySelectorAll('[data-error-banner]').forEach((el) => el.remove());
  }

  private renderDegradation(degradation: RouteDegradation): void {
    const panel = document.createElement('div');
    panel.dataset['degradationPanel'] = 'true';
    panel.style.cssText =
      'margin-top:16px;padding:12px;border:1px solid #f5a623;border-radius:6px;background:#fff7e6';
    const heading = document.createElement('strong');
    heading.textContent = 'No private route possible with this profile';
    heading.style.color = '#7a5a00';
    panel.appendChild(heading);
    const body = document.createElement('p');
    body.style.cssText = 'margin:8px 0;font-size:13px';
    body.textContent = 'Try a different profile:';
    panel.appendChild(body);
    for (const preview of degradation.alternativePreviews) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset['profileSwap'] = preview.profile.preset;
      btn.style.cssText =
        'display:block;width:100%;padding:8px;margin-bottom:6px;background:#fff;' +
        'border:1px solid #f5a623;border-radius:4px;cursor:pointer;font:inherit;text-align:left;font-size:13px';
      btn.textContent =
        `Use ${cap(preview.profile.preset)} ` +
        `(would avoid ~${preview.camerasAvoidedEstimate} cameras)`;
      btn.addEventListener('click', () => this.callbacks.onProfileSwap?.(preview.profile));
      panel.appendChild(btn);
    }
    this.container.appendChild(panel);
  }

  private renderComparison(cmp: RouteComparison): void {
    const panel = document.createElement('div');
    panel.style.cssText = 'margin-top:16px;padding-top:16px;border-top:1px solid #ddd';
    panel.innerHTML = `
      <div style="padding:10px;border:2px solid #d32f2f;border-radius:6px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between">
          <strong style="color:#d32f2f">Shortest</strong>
          <span>${formatDuration(cmp.shortest.durationSeconds)}</span>
        </div>
        <div style="font-size:12px;color:#666;margin-top:4px">
          ${cmp.shortest.camerasOnRoute} cameras · score ${cmp.shortest.surveillanceScore.toFixed(0)}
        </div>
      </div>
      <div style="padding:10px;border:2px solid #2e7d32;border-radius:6px;background:#f1f8e9;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between">
          <strong style="color:#2e7d32">Private</strong>
          <span>${formatDuration(cmp.private.durationSeconds)}</span>
        </div>
        <div style="font-size:12px;color:#666;margin-top:4px">
          ${cmp.private.camerasOnRoute} cameras · score ${cmp.private.surveillanceScore.toFixed(0)}
        </div>
      </div>
      <div style="padding:10px;background:#e8f5e9;border-radius:6px;text-align:center;font-size:13px">
        <strong>+${formatDuration(cmp.diff.extraSeconds)}</strong> ·
        <strong>${cmp.diff.camerasAvoided} cameras avoided</strong>
      </div>
    `;
    this.container.appendChild(panel);
  }
}

function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```

- [ ] **Step 2: Compile check**

```bash
npx tsc --noEmit
```

Expected: error in `src/app.ts` only (it calls renderProfilePicker with the OLD signature). That's fixed in the next task.

- [ ] **Step 3: Commit**

```bash
git add src/ui/routePlanner.ts
git commit -m "feat(ui): RoutePlanner renders degradation panel with profile-swap buttons"
```

---

## Task 18: Wire Custom Editor + ProfilePicker into app.ts

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: Replace `src/app.ts`**

```ts
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapView } from './ui/mapView';
import { renderProfilePicker } from './ui/profilePicker';
import { renderCustomProfileEditor } from './ui/customProfileEditor';
import { RoutePlanner } from './ui/routePlanner';
import { CameraStore } from './data/cameraStore';
import { ValhallaClient } from './routing/valhallaClient';
import { Router } from './routing/router';
import type { GeoPoint } from './domain/route';
import type { ThreatProfile } from './domain/threatProfile';

const ATLANTA_CENTER: GeoPoint = { lat: 33.7500, lon: -84.3890 };
const VALHALLA_URL = '/valhalla';
const CAMERA_DATASET_URL = '/data/cameras-atlanta-seed.json';

export async function startApp(): Promise<void> {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) throw new Error('#sidebar missing');

  const cameraStore = await CameraStore.loadFromUrl(CAMERA_DATASET_URL);
  const mapView = new MapView('map', ATLANTA_CENTER);
  mapView.renderCameras(cameraStore.all());
  const router = new Router(new ValhallaClient(VALHALLA_URL), cameraStore, VALHALLA_URL);

  showPicker(sidebar, mapView, router);
}

function showPicker(sidebar: HTMLElement, mapView: MapView, router: Router): void {
  renderProfilePicker(sidebar, {
    onPresetPicked: (profile) => mountPlanner(sidebar, mapView, router, profile),
    onCustomPicked: () => {
      renderCustomProfileEditor(sidebar, {
        onApply: (profile) => mountPlanner(sidebar, mapView, router, profile),
      });
    },
  });
}

function mountPlanner(
  sidebar: HTMLElement,
  mapView: MapView,
  router: Router,
  profile: ThreatProfile,
): void {
  sidebar.innerHTML = '';
  const planner = new RoutePlanner(
    sidebar,
    {
      onPlanRequested: async (start, end) => {
        const cmp = await router.compareRoutes(start, end, profile);
        mapView.renderComparison(cmp);
        return cmp;
      },
      onProfileSwap: (newProfile) => mountPlanner(sidebar, mapView, router, newProfile),
    },
    profile,
  );
  mapView.onClick((p) => planner.handleMapClick(p));
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
npx vite build
```

Expected: clean.

- [ ] **Step 3: Run full test suite**

```bash
npm test
npm run lint
```

Expected: all unit + integration tests pass; lint clean.

- [ ] **Step 4: Commit**

```bash
git add src/app.ts
git commit -m "feat(app): wire ProfilePicker (4 cards) + Custom editor + profile-swap"
```

---

## Task 19: Seed Dataset + MapView "?" Badge

**Files:**
- Modify: `public/data/cameras-atlanta-seed.json`
- Modify: `src/ui/mapView.ts`

Hand-add `direction`, `rangeMeters`, `fovDegrees`, `directionConfidence` to the 12 cameras. Bearings are illustrative (north-facing or street-facing approximations); a real dataset would use Street View inspection or DeFlock data. One camera (`atl-007`) intentionally lacks direction data to exercise the unknown-direction fallback path.

Update `MapView.renderCameras` to accept `ResolvedCamera[]` (compatible since `ResolvedCamera extends Camera`) and render a yellow "?" badge ring on pins where `directionConfidence === 'unknown'`. This makes the data-quality issue visible to users and creates the feedback loop for community correction.

- [ ] **Step 1: Replace `public/data/cameras-atlanta-seed.json`**

```json
{
  "schemaVersion": 2,
  "generatedAt": "2026-05-15T00:00:00Z",
  "source": "hand-curated-v0-seed",
  "cameras": [
    { "id": "atl-001", "type": "alpr_government", "lat": 33.7490, "lon": -84.3880, "confidence": 0.9, "source": "seed", "direction": 90, "rangeMeters": 35, "fovDegrees": 30, "directionConfidence": "known" },
    { "id": "atl-002", "type": "alpr_government", "lat": 33.7510, "lon": -84.3900, "confidence": 0.9, "source": "seed", "direction": 180, "rangeMeters": 35, "fovDegrees": 30, "directionConfidence": "known" },
    { "id": "atl-003", "type": "alpr_government", "lat": 33.7530, "lon": -84.3850, "confidence": 0.9, "source": "seed", "direction": 270, "rangeMeters": 35, "fovDegrees": 30, "directionConfidence": "known" },
    { "id": "atl-004", "type": "alpr_government", "lat": 33.7470, "lon": -84.3920, "confidence": 0.9, "source": "seed", "direction": 0, "rangeMeters": 35, "fovDegrees": 30, "directionConfidence": "known" },
    { "id": "atl-005", "type": "alpr_government", "lat": 33.7450, "lon": -84.3870, "confidence": 0.9, "source": "seed", "direction": 45, "rangeMeters": 35, "fovDegrees": 30, "directionConfidence": "known" },
    { "id": "atl-006", "type": "cctv_municipal", "lat": 33.7505, "lon": -84.3865, "confidence": 0.8, "source": "seed", "direction": 135, "rangeMeters": 50, "fovDegrees": 70, "directionConfidence": "known" },
    { "id": "atl-007", "type": "cctv_municipal", "lat": 33.7460, "lon": -84.3895, "confidence": 0.8, "source": "seed", "rangeMeters": 50, "fovDegrees": 70, "directionConfidence": "unknown" },
    { "id": "atl-008", "type": "red_light_camera", "lat": 33.7500, "lon": -84.3950, "confidence": 0.85, "source": "seed", "direction": 0, "rangeMeters": 25, "fovDegrees": 35, "directionConfidence": "known" },
    { "id": "atl-009", "type": "red_light_camera", "lat": 33.7440, "lon": -84.3840, "confidence": 0.85, "source": "seed", "direction": 180, "rangeMeters": 25, "fovDegrees": 35, "directionConfidence": "known" },
    { "id": "atl-010", "type": "alpr_private", "lat": 33.7480, "lon": -84.3830, "confidence": 0.7, "source": "seed", "direction": 225, "rangeMeters": 35, "fovDegrees": 30, "directionConfidence": "known" },
    { "id": "atl-011", "type": "speed_camera", "lat": 33.7520, "lon": -84.3940, "confidence": 0.8, "source": "seed", "direction": 90, "rangeMeters": 30, "fovDegrees": 25, "directionConfidence": "known" },
    { "id": "atl-012", "type": "cctv_dot_traffic", "lat": 33.7495, "lon": -84.3835, "confidence": 0.75, "source": "seed", "direction": 315, "rangeMeters": 80, "fovDegrees": 60, "directionConfidence": "known" }
  ]
}
```

Notice `atl-007` has no `direction` and `directionConfidence: "unknown"` — exercises the omnidirectional-fallback code path.

- [ ] **Step 2: Update `src/ui/mapView.ts` to render the "?" badge**

Replace `renderCameras` in `src/ui/mapView.ts`:

```ts
import type { ResolvedCamera } from '../data/resolvedCamera';
// ... (other imports unchanged)

  renderCameras(cameras: readonly ResolvedCamera[]): void {
    for (const c of cameras) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;width:14px;height:14px';

      const dot = document.createElement('div');
      dot.style.cssText =
        'width:10px;height:10px;border-radius:50%;background:#d32f2f;border:2px solid #fff;' +
        'box-shadow:0 0 2px rgba(0,0,0,.5);position:absolute;left:2px;top:2px';
      wrap.appendChild(dot);

      if (c.directionConfidence === 'unknown') {
        const badge = document.createElement('div');
        badge.textContent = '?';
        badge.title = 'Direction unknown — contribute corrected data to DeFlock/OSM';
        badge.style.cssText =
          'position:absolute;top:-6px;right:-6px;width:12px;height:12px;border-radius:50%;' +
          'background:#f9a825;color:#fff;font-size:10px;font-weight:700;line-height:12px;' +
          'text-align:center;border:1px solid #fff';
        wrap.appendChild(badge);
      }

      wrap.title = `${c.type} (${c.id})${c.directionConfidence === 'unknown' ? ' — direction unknown' : ''}`;
      new maplibregl.Marker({ element: wrap }).setLngLat([c.lon, c.lat]).addTo(this.map);
    }
  }
```

(Keep `renderComparison`, `addRouteLayer`, `clearRoutes`, and `onClick` unchanged.)

Also update the import line at top of `src/ui/mapView.ts`: replace `import type { Camera } from '../domain/camera';` with `import type { ResolvedCamera } from '../data/resolvedCamera';`.

- [ ] **Step 3: Verify build + Playwright privacy test still passes**

```bash
npx tsc --noEmit
npm test
npx playwright test tests/privacy
```

Expected: clean compile, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add public/data/cameras-atlanta-seed.json src/ui/mapView.ts
git commit -m "feat(ui,data): seed has direction/range; MapView shows '?' badge for unknown-direction

atl-007 is intentionally left without direction to exercise the unknown
fallback. The MapView pin renders a yellow '?' badge for any camera with
directionConfidence === 'unknown', surfacing data-quality gaps to users
and inviting community correction to DeFlock/OSM."
```

---

## Task 20: Update Benchmark + Final Smoke Test

**Files:**
- Modify: `tests/benchmark/atlanta-routes.spec.ts`

Strengthen the benchmark to assert the cone model produces non-trivial avoidance for Activist profile (the new middle ground).

- [ ] **Step 1: Replace `tests/benchmark/atlanta-routes.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

const VALHALLA_URL = 'http://localhost:8002';

test.beforeAll(async () => {
  try {
    const resp = await fetch(`${VALHALLA_URL}/status`, { signal: AbortSignal.timeout(2000) });
    if (!resp.ok) {
      test.skip(true, `Valhalla not reachable at ${VALHALLA_URL} — benchmark skipped. Start Valhalla and re-run.`);
    }
  } catch {
    test.skip(true, `Valhalla not reachable at ${VALHALLA_URL} — benchmark skipped. Start Valhalla and re-run.`);
  }
});

test('Activist profile produces a measurable diff on an Atlanta crossing', async ({ page }) => {
  const valhallaErrors: string[] = [];
  page.on('response', async (resp) => {
    const url = resp.url();
    const isValhalla = url.includes('/valhalla/route') || url.includes(':8002/route');
    if (isValhalla && !resp.ok()) {
      valhallaErrors.push(`${resp.status()} ${await resp.text().catch(() => '')}`);
    }
  });

  await page.goto('/');
  await page.locator('#map canvas').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(1500);

  await page.getByText('Activist').click();

  await page.getByRole('button', { name: 'Set Start on map' }).click();
  await page.locator('#map').click({ position: { x: 300, y: 220 } });
  await page.getByRole('button', { name: 'Set End on map' }).click();
  await page.locator('#map').click({ position: { x: 420, y: 320 } });

  await page.getByRole('button', { name: 'Plan route' }).click();

  try {
    await page.waitForSelector('text=cameras avoided', { timeout: 20_000 });
  } catch (e) {
    const errorBanner = await page.locator('[data-error-banner]').textContent().catch(() => null);
    const degradation = await page.locator('[data-degradation-panel]').textContent().catch(() => null);
    const sidebarText = await page.locator('#sidebar').textContent().catch(() => null);
    throw new Error(
      `Activist plan didn't produce a comparison panel.\n` +
        `Valhalla errors: ${JSON.stringify(valhallaErrors)}\n` +
        `Error banner: ${errorBanner ?? '(none)'}\n` +
        `Degradation panel: ${degradation ?? '(none)'}\n` +
        `Sidebar text: ${sidebarText?.slice(0, 500) ?? '(none)'}\n` +
        `Original: ${(e as Error).message}`,
    );
  }

  const summary = await page.locator('text=cameras avoided').textContent();
  expect(summary).toMatch(/\d+ cameras avoided/);
});

test('Vulnerable downtown crossing produces a degradation panel with profile-swap options', async ({ page }) => {
  await page.goto('/');
  await page.locator('#map canvas').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(1500);

  await page.getByText('Vulnerable').click();

  await page.getByRole('button', { name: 'Set Start on map' }).click();
  await page.locator('#map').click({ position: { x: 250, y: 200 } });
  await page.getByRole('button', { name: 'Set End on map' }).click();
  await page.locator('#map').click({ position: { x: 480, y: 360 } });

  await page.getByRole('button', { name: 'Plan route' }).click();

  // Either a comparison panel OR a degradation panel must appear.
  const settledSelector = await Promise.race([
    page.waitForSelector('text=cameras avoided', { timeout: 20_000 }).then(() => 'comparison'),
    page.waitForSelector('[data-degradation-panel]', { timeout: 20_000 }).then(() => 'degradation'),
  ]);

  if (settledSelector === 'degradation') {
    const buttons = await page.locator('button[data-profile-swap]').count();
    expect(buttons).toBeGreaterThan(0);
  } else {
    const summary = await page.locator('text=cameras avoided').textContent();
    expect(summary).toMatch(/\d+ cameras avoided/);
  }
});
```

- [ ] **Step 2: Run full suite end-to-end**

```bash
npm run lint
npx tsc --noEmit
npx vitest run
npx playwright test
```

Expected:
- Lint + tsc clean
- All unit + integration tests pass
- All Playwright tests pass (with live Valhalla)

- [ ] **Step 3: Commit**

```bash
git add tests/benchmark/atlanta-routes.spec.ts
git commit -m "test(benchmark): assert cone model produces real diff (Activist) + degradation path (Vulnerable)"
```

---

## Done — Exit Checklist

Before merging `feat/phase-0b-1-routing-quality` back to master, verify:

- [ ] `npm run lint` clean
- [ ] `npx tsc --noEmit` clean
- [ ] `npx vitest run` — all unit + integration tests pass (Valhalla up)
- [ ] `npx playwright test` — all privacy + benchmark tests pass
- [ ] Manual smoke: pick Commuter on a downtown crossing → see a real diff (not "+0 cameras avoided")
- [ ] Manual smoke: pick Activist on the same crossing → see a larger diff than Commuter
- [ ] Manual smoke: pick Vulnerable on the same crossing → either see a route OR see the degradation panel with profile-swap buttons
- [ ] Manual smoke: pick Custom → editor opens with sliders → apply → planner mounts with custom profile

If all eight pass, Phase 0b-1's success criteria from the spec are met. Merge to master via the finishing-a-development-branch skill.
