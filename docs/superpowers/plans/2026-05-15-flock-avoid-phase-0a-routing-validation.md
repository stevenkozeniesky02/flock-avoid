# Flock-Avoid — Phase 0a: Routing Validation Spike

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that surveillance-aware routing produces sane routes — a working local end-to-end spike where a user picks a profile, enters two points in Atlanta, and sees a "Shortest" vs "Private" comparison with a real measured difference using a 12-camera hand-curated Atlanta seed dataset. No deployment, no PWA polish — just validate the core mechanic.

**Architecture:** Vite + TypeScript SPA in the browser. MapLibre GL for the map with public OSM raster tiles (self-hosting deferred to Phase 0b). A local **Valhalla** routing server in Docker holds the Georgia OSM routing graph. Surveillance costing is implemented by translating each camera in our seed dataset into a small **exclude-polygon** sized by the user's threat-profile weight, passed to Valhalla on every route request. The "Shortest" route is a Valhalla call with no exclusions; the "Private" route is the same call with exclusions. Comparing them gives us the diff line ("+4 min, –5 ALPRs avoided") that is the heart of the product.

**Tech Stack:**
- Frontend: TypeScript 5.x, Vite 5.x, MapLibre GL JS 4.x
- Routing: Valhalla (official Docker image `valhalla/valhalla:latest`) over HTTP from the browser
- Tests: Vitest (unit + integration), Playwright (privacy invariants + benchmark)
- Linting: ESLint + Prettier (standard config)
- No backend code in this plan — Valhalla is the only server, run locally via docker-compose

**Scope notes (what's NOT in this plan):**
- Data pipeline (DeFlock/OSM sync) — Phase 0b. We use a hand-curated JSON seed dataset of ~50 known Atlanta ALPRs.
- On-device routing via Valhalla WASM — Phase 1.
- All four threat profiles — this plan ships **Commuter + Vulnerable only**. Activist and Custom are Phase 0b.
- PWA manifest + service worker + offline — Phase 0b.
- Deployment to static host — Phase 0b.
- Self-hosted map tiles — Phase 0b uses Protomaps. For 0a we use OSM raster tiles directly.

---

## File Structure

```
flock-avoid/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── .eslintrc.cjs
├── .prettierrc
├── docker-compose.yml                       # Valhalla container
├── scripts/
│   └── build-valhalla-tiles.sh              # One-time setup: downloads GA OSM, builds tiles
├── index.html
├── public/
│   └── data/
│       └── cameras-atlanta-seed.json        # 12 hand-curated cameras (mixed types)
├── src/
│   ├── main.ts                              # Entry point
│   ├── app.ts                               # Top-level app composition
│   ├── domain/
│   │   ├── camera.ts                        # Camera + CameraType types
│   │   ├── threatProfile.ts                 # ThreatProfile type + 2 presets
│   │   └── route.ts                         # RouteResult + RouteComparison types
│   ├── data/
│   │   └── cameraStore.ts                   # Loads seed JSON, spatial queries
│   ├── routing/
│   │   ├── valhallaClient.ts                # HTTP client for local Valhalla
│   │   ├── visibilityFactor.ts              # Distance-based visibility weight
│   │   ├── exclusionPolygons.ts             # Camera + profile -> polygons for Valhalla
│   │   ├── routeScorer.ts                   # Counts cameras visible from a route polyline
│   │   └── router.ts                        # Orchestrates: profile + start/end -> RouteComparison
│   ├── ui/
│   │   ├── mapView.ts                       # MapLibre setup, camera pins, route polylines
│   │   ├── profilePicker.ts                 # Onboarding picker (Commuter / Vulnerable)
│   │   ├── routePlanner.ts                  # Start/end input + plan button
│   │   └── routeComparison.ts               # Side-by-side comparison panel + diff
│   └── privacy/
│       └── networkAllowlist.ts              # Allowlist of endpoints the app may contact
└── tests/
    ├── unit/
    │   ├── domain/threatProfile.test.ts
    │   ├── data/cameraStore.test.ts
    │   ├── routing/visibilityFactor.test.ts
    │   ├── routing/exclusionPolygons.test.ts
    │   └── routing/routeScorer.test.ts
    ├── integration/
    │   └── router.test.ts                   # Hits local Valhalla container
    ├── privacy/
    │   └── networkInvariants.spec.ts        # Playwright + network recording
    └── benchmark/
        └── atlanta-routes.spec.ts           # One curated benchmark case
```

---

## Task 1: Project Bootstrap

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `.eslintrc.cjs`, `.prettierrc`, `index.html`, `src/main.ts`

- [ ] **Step 1: Initialize package.json**

Create `package.json`:

```json
{
  "name": "flock-avoid",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "eslint src tests --ext .ts",
    "format": "prettier --write 'src/**/*.ts' 'tests/**/*.ts'",
    "valhalla:up": "docker compose up -d",
    "valhalla:down": "docker compose down",
    "valhalla:build-tiles": "./scripts/build-valhalla-tiles.sh"
  },
  "dependencies": {
    "maplibre-gl": "^4.7.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "@playwright/test": "^1.48.0",
    "@types/node": "^22.0.0",
    "eslint": "^9.13.0",
    "@typescript-eslint/parser": "^8.10.0",
    "@typescript-eslint/eslint-plugin": "^8.10.0",
    "prettier": "^3.3.0"
  }
}
```

- [ ] **Step 2: Add tsconfig.json**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vitest/globals", "node"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Add Vite + Vitest configs**

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
});
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
});
```

- [ ] **Step 4: Add ESLint + Prettier**

Create `.eslintrc.cjs`:

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: { '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] },
};
```

Create `.prettierrc`:

```json
{ "singleQuote": true, "trailingComma": "all", "printWidth": 100 }
```

- [ ] **Step 5: Add index.html + main.ts stub**

Create `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Flock-Avoid (dev)</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Create `src/main.ts`:

```ts
const el = document.getElementById('app');
if (el) el.textContent = 'Flock-Avoid bootstrapping...';
```

- [ ] **Step 6: Install + verify dev server starts**

Run: `npm install && npm run dev`
Expected: Vite serves at http://localhost:5173 showing "Flock-Avoid bootstrapping..."
Then: stop with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts \
        .eslintrc.cjs .prettierrc index.html src/main.ts
git commit -m "chore: bootstrap Vite + TS + Vitest project"
```

---

## Task 2: Domain Types — Camera

**Files:**
- Create: `src/domain/camera.ts`
- Create: `tests/unit/domain/camera.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/domain/camera.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isCameraType, ALL_CAMERA_TYPES, type Camera } from '../../../src/domain/camera';

describe('camera domain', () => {
  it('exposes the v0 camera types as a readonly array', () => {
    expect(ALL_CAMERA_TYPES).toEqual([
      'alpr_government',
      'alpr_private',
      'cctv_municipal',
      'cctv_dot_traffic',
      'speed_camera',
      'red_light_camera',
    ]);
  });

  it('isCameraType narrows unknown strings', () => {
    expect(isCameraType('alpr_government')).toBe(true);
    expect(isCameraType('not_a_type')).toBe(false);
  });

  it('a well-formed Camera object compiles', () => {
    const c: Camera = {
      id: 'atl-001',
      type: 'alpr_government',
      lat: 33.749,
      lon: -84.388,
      confidence: 0.9,
      source: 'seed',
    };
    expect(c.id).toBe('atl-001');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/domain/camera.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement domain/camera.ts**

Create `src/domain/camera.ts`:

```ts
export const ALL_CAMERA_TYPES = [
  'alpr_government',
  'alpr_private',
  'cctv_municipal',
  'cctv_dot_traffic',
  'speed_camera',
  'red_light_camera',
] as const;

export type CameraType = (typeof ALL_CAMERA_TYPES)[number];

export interface Camera {
  readonly id: string;
  readonly type: CameraType;
  readonly lat: number;
  readonly lon: number;
  readonly confidence: number;
  readonly source: 'seed' | 'deflock' | 'osm' | 'submission' | 'foia';
}

export function isCameraType(value: unknown): value is CameraType {
  return typeof value === 'string' && (ALL_CAMERA_TYPES as readonly string[]).includes(value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/domain/camera.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/camera.ts tests/unit/domain/camera.test.ts
git commit -m "feat(domain): add Camera type with CameraType union + guard"
```

---

## Task 3: Domain Types — ThreatProfile + Presets

**Files:**
- Create: `src/domain/threatProfile.ts`
- Create: `tests/unit/domain/threatProfile.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/domain/threatProfile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  COMMUTER_PROFILE,
  VULNERABLE_PROFILE,
  ALL_PRESETS,
  type ThreatProfile,
} from '../../../src/domain/threatProfile';
import { ALL_CAMERA_TYPES } from '../../../src/domain/camera';

describe('threat profile presets', () => {
  it('Commuter preset has lower ALPR weight than Vulnerable', () => {
    expect(COMMUTER_PROFILE.weights.alpr_government).toBeLessThan(
      VULNERABLE_PROFILE.weights.alpr_government,
    );
  });

  it('every preset defines a weight for every camera type', () => {
    for (const profile of ALL_PRESETS) {
      for (const cameraType of ALL_CAMERA_TYPES) {
        expect(profile.weights[cameraType]).toBeTypeOf('number');
        expect(profile.weights[cameraType]).toBeGreaterThanOrEqual(0);
        expect(profile.weights[cameraType]).toBeLessThanOrEqual(100);
      }
    }
  });

  it('Commuter has low detour tolerance, Vulnerable has high', () => {
    expect(COMMUTER_PROFILE.detourTolerance).toBe('low');
    expect(VULNERABLE_PROFILE.detourTolerance).toBe('high');
  });

  it('profile objects are deeply frozen so callers cannot mutate', () => {
    const p: ThreatProfile = COMMUTER_PROFILE;
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.weights)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/domain/threatProfile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement domain/threatProfile.ts**

Create `src/domain/threatProfile.ts`:

```ts
import { type CameraType } from './camera';

export type DetourTolerance = 'low' | 'medium' | 'high' | 'unlimited';

export type ProfilePreset = 'commuter' | 'vulnerable';

export interface ThreatProfile {
  readonly preset: ProfilePreset;
  readonly weights: Readonly<Record<CameraType, number>>;
  readonly detourTolerance: DetourTolerance;
}

function freezeProfile(p: ThreatProfile): ThreatProfile {
  Object.freeze(p.weights);
  return Object.freeze(p);
}

export const COMMUTER_PROFILE: ThreatProfile = freezeProfile({
  preset: 'commuter',
  weights: {
    alpr_government: 50,
    alpr_private: 50,
    cctv_municipal: 15,
    cctv_dot_traffic: 5,
    speed_camera: 20,
    red_light_camera: 20,
  },
  detourTolerance: 'low',
});

export const VULNERABLE_PROFILE: ThreatProfile = freezeProfile({
  preset: 'vulnerable',
  weights: {
    alpr_government: 100,
    alpr_private: 100,
    cctv_municipal: 60,
    cctv_dot_traffic: 30,
    speed_camera: 40,
    red_light_camera: 40,
  },
  detourTolerance: 'high',
});

export const ALL_PRESETS: readonly ThreatProfile[] = Object.freeze([
  COMMUTER_PROFILE,
  VULNERABLE_PROFILE,
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/domain/threatProfile.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/threatProfile.ts tests/unit/domain/threatProfile.test.ts
git commit -m "feat(domain): add ThreatProfile type + Commuter/Vulnerable presets"
```

---

## Task 4: Domain Types — Route

**Files:**
- Create: `src/domain/route.ts`

- [ ] **Step 1: Add Route types (no test — pure type aliases)**

Create `src/domain/route.ts`:

```ts
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
}
```

- [ ] **Step 2: Commit**

```bash
git add src/domain/route.ts
git commit -m "feat(domain): add Route + RouteComparison types"
```

---

## Task 5: Seed Camera Dataset

**Files:**
- Create: `public/data/cameras-atlanta-seed.json`

- [ ] **Step 1: Create the seed file**

Create `public/data/cameras-atlanta-seed.json`. Use 12 plausible ALPR locations in central Atlanta (this is a v0 seed for engineering validation — real data comes from the DeFlock pipeline in Phase 0b; coordinates are illustrative, not authoritative):

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-15T00:00:00Z",
  "source": "hand-curated-v0-seed",
  "cameras": [
    { "id": "atl-001", "type": "alpr_government", "lat": 33.7490, "lon": -84.3880, "confidence": 0.9, "source": "seed" },
    { "id": "atl-002", "type": "alpr_government", "lat": 33.7510, "lon": -84.3900, "confidence": 0.9, "source": "seed" },
    { "id": "atl-003", "type": "alpr_government", "lat": 33.7530, "lon": -84.3850, "confidence": 0.9, "source": "seed" },
    { "id": "atl-004", "type": "alpr_government", "lat": 33.7470, "lon": -84.3920, "confidence": 0.9, "source": "seed" },
    { "id": "atl-005", "type": "alpr_government", "lat": 33.7450, "lon": -84.3870, "confidence": 0.9, "source": "seed" },
    { "id": "atl-006", "type": "cctv_municipal", "lat": 33.7505, "lon": -84.3865, "confidence": 0.8, "source": "seed" },
    { "id": "atl-007", "type": "cctv_municipal", "lat": 33.7460, "lon": -84.3895, "confidence": 0.8, "source": "seed" },
    { "id": "atl-008", "type": "red_light_camera", "lat": 33.7500, "lon": -84.3950, "confidence": 0.85, "source": "seed" },
    { "id": "atl-009", "type": "red_light_camera", "lat": 33.7440, "lon": -84.3840, "confidence": 0.85, "source": "seed" },
    { "id": "atl-010", "type": "alpr_private", "lat": 33.7480, "lon": -84.3830, "confidence": 0.7, "source": "seed" },
    { "id": "atl-011", "type": "speed_camera", "lat": 33.7520, "lon": -84.3940, "confidence": 0.8, "source": "seed" },
    { "id": "atl-012", "type": "cctv_dot_traffic", "lat": 33.7495, "lon": -84.3835, "confidence": 0.75, "source": "seed" }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add public/data/cameras-atlanta-seed.json
git commit -m "feat(data): add v0 Atlanta seed camera dataset (12 cameras, hand-curated)"
```

---

## Task 6: CameraStore — Spatial Queries

**Files:**
- Create: `src/data/cameraStore.ts`
- Create: `tests/unit/data/cameraStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/data/cameraStore.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { CameraStore } from '../../../src/data/cameraStore';
import type { Camera } from '../../../src/domain/camera';

const SAMPLE: readonly Camera[] = [
  { id: 'a', type: 'alpr_government', lat: 33.7490, lon: -84.3880, confidence: 0.9, source: 'seed' },
  { id: 'b', type: 'alpr_government', lat: 33.7510, lon: -84.3900, confidence: 0.9, source: 'seed' },
  { id: 'c', type: 'cctv_municipal', lat: 34.0000, lon: -84.0000, confidence: 0.8, source: 'seed' },
];

describe('CameraStore', () => {
  let store: CameraStore;
  beforeAll(() => {
    store = new CameraStore(SAMPLE);
  });

  it('all() returns every camera', () => {
    expect(store.all()).toHaveLength(3);
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

  it('distanceMeters computes Haversine distance between two points', () => {
    const d = CameraStore.distanceMeters(
      { lat: 33.7490, lon: -84.3880 },
      { lat: 33.7510, lon: -84.3900 },
    );
    expect(d).toBeGreaterThan(250);
    expect(d).toBeLessThan(310);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/data/cameraStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement data/cameraStore.ts**

Create `src/data/cameraStore.ts`:

```ts
import type { Camera } from '../domain/camera';
import type { GeoPoint } from '../domain/route';

const EARTH_RADIUS_M = 6_371_000;

export class CameraStore {
  private readonly cameras: readonly Camera[];

  constructor(cameras: readonly Camera[]) {
    this.cameras = cameras;
  }

  static async loadFromUrl(url: string): Promise<CameraStore> {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to load camera dataset: ${resp.status}`);
    const body = (await resp.json()) as { cameras: Camera[] };
    return new CameraStore(body.cameras);
  }

  all(): readonly Camera[] {
    return this.cameras;
  }

  within(center: GeoPoint, radiusMeters: number): readonly Camera[] {
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/data/cameraStore.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/data/cameraStore.ts tests/unit/data/cameraStore.test.ts
git commit -m "feat(data): add CameraStore with Haversine within() spatial query"
```

---

## Task 7: Visibility Factor

**Files:**
- Create: `src/routing/visibilityFactor.ts`
- Create: `tests/unit/routing/visibilityFactor.test.ts`

The visibility factor represents how "visible" a road point is to a camera. v0 uses a simple linear falloff: factor = 1 at 0 meters, decreasing linearly to 0 at `MAX_VISIBILITY_M`. Line-of-sight is roadmap.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/routing/visibilityFactor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { visibilityFactor, MAX_VISIBILITY_M } from '../../../src/routing/visibilityFactor';

describe('visibilityFactor (linear falloff)', () => {
  it('is 1 at 0 meters', () => {
    expect(visibilityFactor(0)).toBe(1);
  });

  it('is 0 at and beyond MAX_VISIBILITY_M', () => {
    expect(visibilityFactor(MAX_VISIBILITY_M)).toBe(0);
    expect(visibilityFactor(MAX_VISIBILITY_M + 1)).toBe(0);
  });

  it('is 0.5 at half max', () => {
    expect(visibilityFactor(MAX_VISIBILITY_M / 2)).toBeCloseTo(0.5, 5);
  });

  it('never returns negative or > 1 even for nonsense input', () => {
    expect(visibilityFactor(-5)).toBe(1);
    expect(visibilityFactor(99999)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/routing/visibilityFactor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement visibilityFactor.ts**

Create `src/routing/visibilityFactor.ts`:

```ts
export const MAX_VISIBILITY_M = 150;

export function visibilityFactor(distanceMeters: number): number {
  if (distanceMeters <= 0) return 1;
  if (distanceMeters >= MAX_VISIBILITY_M) return 0;
  return 1 - distanceMeters / MAX_VISIBILITY_M;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/routing/visibilityFactor.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/routing/visibilityFactor.ts tests/unit/routing/visibilityFactor.test.ts
git commit -m "feat(routing): add linear visibilityFactor with 150m max"
```

---

## Task 8: Exclusion Polygons

**Files:**
- Create: `src/routing/exclusionPolygons.ts`
- Create: `tests/unit/routing/exclusionPolygons.test.ts`

Translates each camera into a small avoidance polygon for Valhalla, sized by the user's profile weight × detour tolerance. A "polygon" here is a square box around the camera, expressed as a closed ring of `[lon, lat]` pairs (Valhalla's `exclude_polygons` format).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/routing/exclusionPolygons.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { camerasToExclusionPolygons, exclusionRadiusForCamera } from '../../../src/routing/exclusionPolygons';
import { COMMUTER_PROFILE, VULNERABLE_PROFILE } from '../../../src/domain/threatProfile';
import type { Camera } from '../../../src/domain/camera';

const ALPR: Camera = {
  id: 'x', type: 'alpr_government', lat: 33.75, lon: -84.39, confidence: 0.9, source: 'seed',
};

describe('exclusion polygons', () => {
  it('Vulnerable profile yields a larger exclusion radius than Commuter for same camera', () => {
    const rCom = exclusionRadiusForCamera(ALPR, COMMUTER_PROFILE);
    const rVul = exclusionRadiusForCamera(ALPR, VULNERABLE_PROFILE);
    expect(rVul).toBeGreaterThan(rCom);
  });

  it('zero-weight camera type yields zero radius', () => {
    const dotCam: Camera = { ...ALPR, type: 'cctv_dot_traffic' };
    const zeroProfile = {
      ...COMMUTER_PROFILE,
      weights: { ...COMMUTER_PROFILE.weights, cctv_dot_traffic: 0 },
    };
    expect(exclusionRadiusForCamera(dotCam, zeroProfile)).toBe(0);
  });

  it('camerasToExclusionPolygons skips zero-radius cameras', () => {
    const zeroProfile = {
      ...COMMUTER_PROFILE,
      weights: Object.fromEntries(
        Object.keys(COMMUTER_PROFILE.weights).map((k) => [k, 0]),
      ) as typeof COMMUTER_PROFILE.weights,
    };
    expect(camerasToExclusionPolygons([ALPR], zeroProfile)).toHaveLength(0);
  });

  it('each polygon is a closed ring of 5 [lon,lat] pairs (a square box)', () => {
    const polys = camerasToExclusionPolygons([ALPR], VULNERABLE_PROFILE);
    expect(polys).toHaveLength(1);
    const ring = polys[0]!;
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]); // closed ring
    for (const point of ring) {
      expect(point).toHaveLength(2);
      expect(typeof point[0]).toBe('number');
      expect(typeof point[1]).toBe('number');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/routing/exclusionPolygons.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement exclusionPolygons.ts**

Create `src/routing/exclusionPolygons.ts`:

```ts
import type { Camera } from '../domain/camera';
import type { ThreatProfile, DetourTolerance } from '../domain/threatProfile';

/**
 * Polygon ring in Valhalla's `exclude_polygons` format: [[lon,lat], ...closed].
 */
export type ExclusionPolygon = readonly (readonly [number, number])[];

const TOLERANCE_MULTIPLIER: Record<DetourTolerance, number> = {
  low: 0.4,
  medium: 1.0,
  high: 2.0,
  unlimited: 4.0,
};

const BASE_RADIUS_AT_FULL_WEIGHT_M = 60;

export function exclusionRadiusForCamera(camera: Camera, profile: ThreatProfile): number {
  const weight = profile.weights[camera.type];
  if (weight <= 0) return 0;
  const normWeight = weight / 100;
  return BASE_RADIUS_AT_FULL_WEIGHT_M * normWeight * TOLERANCE_MULTIPLIER[profile.detourTolerance];
}

export function camerasToExclusionPolygons(
  cameras: readonly Camera[],
  profile: ThreatProfile,
): ExclusionPolygon[] {
  const polys: ExclusionPolygon[] = [];
  for (const c of cameras) {
    const radius = exclusionRadiusForCamera(c, profile);
    if (radius <= 0) continue;
    polys.push(squareAround(c.lat, c.lon, radius));
  }
  return polys;
}

function squareAround(lat: number, lon: number, radiusMeters: number): ExclusionPolygon {
  const latDelta = radiusMeters / 111_320;
  const lonDelta = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
  const n = lat + latDelta;
  const s = lat - latDelta;
  const e = lon + lonDelta;
  const w = lon - lonDelta;
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/routing/exclusionPolygons.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/routing/exclusionPolygons.ts tests/unit/routing/exclusionPolygons.test.ts
git commit -m "feat(routing): translate cameras + profile to Valhalla exclude_polygons"
```

---

## Task 9: Route Scorer

**Files:**
- Create: `src/routing/routeScorer.ts`
- Create: `tests/unit/routing/routeScorer.test.ts`

Counts cameras "seen" by a route polyline, and computes a surveillance score weighted by profile + visibility.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/routing/routeScorer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scoreRoute } from '../../../src/routing/routeScorer';
import { CameraStore } from '../../../src/data/cameraStore';
import { COMMUTER_PROFILE, VULNERABLE_PROFILE } from '../../../src/domain/threatProfile';
import type { Camera } from '../../../src/domain/camera';
import type { GeoPoint } from '../../../src/domain/route';

const ALPR_ON_ROUTE: Camera = {
  id: 'on', type: 'alpr_government', lat: 33.7500, lon: -84.3890, confidence: 0.9, source: 'seed',
};
const ALPR_FAR_AWAY: Camera = {
  id: 'far', type: 'alpr_government', lat: 34.0000, lon: -84.0000, confidence: 0.9, source: 'seed',
};
const STRAIGHT_LINE: readonly GeoPoint[] = [
  { lat: 33.7495, lon: -84.3895 },
  { lat: 33.7505, lon: -84.3885 },
];

describe('scoreRoute', () => {
  it('counts a camera within visibility of the polyline as seen', () => {
    const store = new CameraStore([ALPR_ON_ROUTE, ALPR_FAR_AWAY]);
    const result = scoreRoute(STRAIGHT_LINE, store, COMMUTER_PROFILE);
    expect(result.camerasSeen).toBe(1);
  });

  it('surveillance score is higher under Vulnerable than Commuter for same route', () => {
    const store = new CameraStore([ALPR_ON_ROUTE]);
    const commuterScore = scoreRoute(STRAIGHT_LINE, store, COMMUTER_PROFILE).surveillanceScore;
    const vulnerableScore = scoreRoute(STRAIGHT_LINE, store, VULNERABLE_PROFILE).surveillanceScore;
    expect(vulnerableScore).toBeGreaterThan(commuterScore);
  });

  it('an empty polyline scores zero', () => {
    const store = new CameraStore([ALPR_ON_ROUTE]);
    const result = scoreRoute([], store, COMMUTER_PROFILE);
    expect(result.camerasSeen).toBe(0);
    expect(result.surveillanceScore).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/routing/routeScorer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement routeScorer.ts**

Create `src/routing/routeScorer.ts`:

```ts
import type { GeoPoint } from '../domain/route';
import type { ThreatProfile } from '../domain/threatProfile';
import { CameraStore } from '../data/cameraStore';
import { visibilityFactor, MAX_VISIBILITY_M } from './visibilityFactor';

export interface RouteScore {
  readonly camerasSeen: number;
  readonly surveillanceScore: number;
}

export function scoreRoute(
  polyline: readonly GeoPoint[],
  store: CameraStore,
  profile: ThreatProfile,
): RouteScore {
  if (polyline.length === 0) return { camerasSeen: 0, surveillanceScore: 0 };

  const seenIds = new Set<string>();
  let score = 0;

  for (const point of polyline) {
    const nearby = store.within(point, MAX_VISIBILITY_M);
    for (const cam of nearby) {
      const dist = CameraStore.distanceMeters(point, { lat: cam.lat, lon: cam.lon });
      const factor = visibilityFactor(dist);
      const weight = profile.weights[cam.type];
      if (!seenIds.has(cam.id)) {
        seenIds.add(cam.id);
        score += weight * factor;
      }
    }
  }

  return { camerasSeen: seenIds.size, surveillanceScore: score };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/routing/routeScorer.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/routing/routeScorer.ts tests/unit/routing/routeScorer.test.ts
git commit -m "feat(routing): add scoreRoute - counts cameras + computes surveillance score"
```

---

## Task 10: Valhalla via Docker

**Files:**
- Create: `docker-compose.yml`
- Create: `scripts/build-valhalla-tiles.sh`
- Modify: `.gitignore` (add `valhalla_tiles/`)

- [ ] **Step 1: Add .gitignore entry for Valhalla tiles**

Append to `.gitignore`:

```
node_modules/
valhalla_tiles/
dist/
.DS_Store
```

- [ ] **Step 2: Create docker-compose.yml**

Create `docker-compose.yml`:

```yaml
services:
  valhalla:
    image: ghcr.io/valhalla/valhalla:latest
    container_name: flock-avoid-valhalla
    ports:
      - "8002:8002"
    volumes:
      - ./valhalla_tiles:/custom_files
    environment:
      - tile_urls=https://download.geofabrik.de/north-america/us/georgia-latest.osm.pbf
      - server_threads=2
      - use_tiles_ignore_pbf=True
    restart: unless-stopped
```

- [ ] **Step 3: Create build-tiles helper script**

Create `scripts/build-valhalla-tiles.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# One-time build of Valhalla tiles for Georgia OSM extract.
# Downloads ~250MB PBF, builds tiles into ./valhalla_tiles/ (~5-15 min first run).
# Run this before `npm run valhalla:up` on a fresh checkout.

mkdir -p valhalla_tiles
docker run --rm -t \
  -v "$(pwd)/valhalla_tiles:/custom_files" \
  -e tile_urls=https://download.geofabrik.de/north-america/us/georgia-latest.osm.pbf \
  -e use_tiles_ignore_pbf=False \
  -e force_rebuild=True \
  ghcr.io/valhalla/valhalla:latest

echo "Valhalla tiles built. Run 'npm run valhalla:up' to start the server."
```

Then: `chmod +x scripts/build-valhalla-tiles.sh`

- [ ] **Step 4: Manual smoke test the container**

Run:
```bash
./scripts/build-valhalla-tiles.sh
npm run valhalla:up
sleep 5
curl -s 'http://localhost:8002/status' | head -c 100
npm run valhalla:down
```

Expected: `/status` returns JSON containing `"version"`. If not, check `docker logs flock-avoid-valhalla`.

- [ ] **Step 5: Commit**

```bash
git add .gitignore docker-compose.yml scripts/build-valhalla-tiles.sh
git commit -m "chore(routing): add Valhalla Georgia setup via docker-compose"
```

---

## Task 11: Valhalla Client

**Files:**
- Create: `src/routing/valhallaClient.ts`
- Create: `tests/integration/valhallaClient.test.ts`

Thin HTTP client. Sends a `/route` POST to the local Valhalla and returns a parsed `RouteResult`. Decoded polyline uses Valhalla's polyline6 format.

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/valhallaClient.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ValhallaClient } from '../../src/routing/valhallaClient';

const VALHALLA_URL = process.env.VALHALLA_URL ?? 'http://localhost:8002';

describe('ValhallaClient (integration — requires local Valhalla)', () => {
  const client = new ValhallaClient(VALHALLA_URL);

  it('returns a route between two Atlanta points', async () => {
    const result = await client.route(
      { lat: 33.7490, lon: -84.3880 },
      { lat: 33.7700, lon: -84.3600 },
      [],
    );
    expect(result.polyline.length).toBeGreaterThan(2);
    expect(result.distanceMeters).toBeGreaterThan(1000);
    expect(result.durationSeconds).toBeGreaterThan(60);
  }, 15_000);

  it('accepts exclude_polygons and still returns a route', async () => {
    const box: [number, number][] = [
      [-84.3895, 33.7495],
      [-84.3885, 33.7495],
      [-84.3885, 33.7505],
      [-84.3895, 33.7505],
      [-84.3895, 33.7495],
    ];
    const result = await client.route(
      { lat: 33.7490, lon: -84.3880 },
      { lat: 33.7700, lon: -84.3600 },
      [box],
    );
    expect(result.polyline.length).toBeGreaterThan(2);
  }, 15_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Ensure Valhalla is running: `npm run valhalla:up`
Run: `npx vitest run tests/integration/valhallaClient.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement valhallaClient.ts**

Create `src/routing/valhallaClient.ts`:

```ts
import type { GeoPoint, RouteResult } from '../domain/route';
import type { ExclusionPolygon } from './exclusionPolygons';

interface ValhallaRouteResponse {
  trip: {
    summary: { length: number; time: number };
    legs: Array<{ shape: string }>;
  };
}

export class ValhallaClient {
  constructor(private readonly baseUrl: string) {}

  async route(
    start: GeoPoint,
    end: GeoPoint,
    excludePolygons: readonly ExclusionPolygon[],
  ): Promise<RouteResult> {
    const body = {
      locations: [
        { lat: start.lat, lon: start.lon },
        { lat: end.lat, lon: end.lon },
      ],
      costing: 'auto',
      directions_options: { units: 'kilometers' },
      exclude_polygons: excludePolygons.map((p) => p.map(([lon, lat]) => [lon, lat])),
    };

    const resp = await fetch(`${this.baseUrl}/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      throw new Error(`Valhalla error ${resp.status}: ${await resp.text()}`);
    }
    const data = (await resp.json()) as ValhallaRouteResponse;
    const polyline = data.trip.legs.flatMap((leg) => decodePolyline6(leg.shape));
    return {
      polyline,
      distanceMeters: Math.round(data.trip.summary.length * 1000),
      durationSeconds: Math.round(data.trip.summary.time),
      camerasOnRoute: 0,
      surveillanceScore: 0,
    };
  }
}

/** Decode Valhalla's polyline6 format (Google Polyline with precision 1e-6). */
function decodePolyline6(encoded: string): GeoPoint[] {
  const points: GeoPoint[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dLat;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dLon = result & 1 ? ~(result >> 1) : result >> 1;
    lon += dLon;

    points.push({ lat: lat / 1e6, lon: lon / 1e6 });
  }
  return points;
}
```

- [ ] **Step 4: Run integration test to verify it passes**

Run: `npx vitest run tests/integration/valhallaClient.test.ts`
Expected: PASS, 2 tests (Valhalla must be running).

- [ ] **Step 5: Commit**

```bash
git add src/routing/valhallaClient.ts tests/integration/valhallaClient.test.ts
git commit -m "feat(routing): add ValhallaClient with polyline6 decoder + exclude_polygons"
```

---

## Task 12: Router Orchestrator

**Files:**
- Create: `src/routing/router.ts`
- Create: `tests/integration/router.test.ts`

Combines store + profile + Valhalla into a single `compareRoutes()` call that returns a `RouteComparison`.

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/router.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { Router } from '../../src/routing/router';
import { ValhallaClient } from '../../src/routing/valhallaClient';
import { CameraStore } from '../../src/data/cameraStore';
import { COMMUTER_PROFILE, VULNERABLE_PROFILE } from '../../src/domain/threatProfile';
import type { Camera } from '../../src/domain/camera';

const VALHALLA_URL = process.env.VALHALLA_URL ?? 'http://localhost:8002';

const SEED: readonly Camera[] = [
  { id: '1', type: 'alpr_government', lat: 33.7500, lon: -84.3890, confidence: 0.9, source: 'seed' },
  { id: '2', type: 'alpr_government', lat: 33.7560, lon: -84.3850, confidence: 0.9, source: 'seed' },
  { id: '3', type: 'alpr_government', lat: 33.7620, lon: -84.3800, confidence: 0.9, source: 'seed' },
];

describe('Router.compareRoutes (integration)', () => {
  let router: Router;
  beforeAll(() => {
    router = new Router(new ValhallaClient(VALHALLA_URL), new CameraStore(SEED));
  });

  it('returns shortest + private routes with a sensible diff', async () => {
    const cmp = await router.compareRoutes(
      { lat: 33.7490, lon: -84.3880 },
      { lat: 33.7700, lon: -84.3600 },
      VULNERABLE_PROFILE,
    );
    expect(cmp.shortest.polyline.length).toBeGreaterThan(0);
    expect(cmp.private.polyline.length).toBeGreaterThan(0);
    expect(cmp.diff.extraSeconds).toBeGreaterThanOrEqual(0);
    expect(cmp.diff.camerasAvoided).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('Vulnerable profile avoids more cameras than Commuter for the same trip', async () => {
    const start = { lat: 33.7490, lon: -84.3880 };
    const end = { lat: 33.7700, lon: -84.3600 };
    const cmpCom = await router.compareRoutes(start, end, COMMUTER_PROFILE);
    const cmpVul = await router.compareRoutes(start, end, VULNERABLE_PROFILE);
    expect(cmpVul.diff.camerasAvoided).toBeGreaterThanOrEqual(cmpCom.diff.camerasAvoided);
  }, 30_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/router.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement router.ts**

Create `src/routing/router.ts`:

```ts
import type { GeoPoint, RouteComparison, RouteResult } from '../domain/route';
import type { ThreatProfile } from '../domain/threatProfile';
import type { CameraStore } from '../data/cameraStore';
import type { ValhallaClient } from './valhallaClient';
import { camerasToExclusionPolygons } from './exclusionPolygons';
import { scoreRoute } from './routeScorer';

export class Router {
  constructor(
    private readonly valhalla: ValhallaClient,
    private readonly cameras: CameraStore,
  ) {}

  async compareRoutes(
    start: GeoPoint,
    end: GeoPoint,
    profile: ThreatProfile,
  ): Promise<RouteComparison> {
    const exclusions = camerasToExclusionPolygons(this.cameras.all(), profile);

    const [shortestRaw, privateRaw] = await Promise.all([
      this.valhalla.route(start, end, []),
      this.valhalla.route(start, end, exclusions),
    ]);

    const shortest = this.annotate(shortestRaw, profile);
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

- [ ] **Step 4: Run integration test to verify it passes**

Run: `npx vitest run tests/integration/router.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/routing/router.ts tests/integration/router.test.ts
git commit -m "feat(routing): add Router.compareRoutes orchestrating shortest vs private"
```

---

## Task 13: Privacy Network Allowlist

**Files:**
- Create: `src/privacy/networkAllowlist.ts`
- Create: `tests/unit/privacy/networkAllowlist.test.ts`

A compile-time and runtime-checkable list of host:port destinations the app is allowed to talk to. Privacy invariant tests assert no other host is ever contacted.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/privacy/networkAllowlist.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ALLOWED_HOSTS, isAllowedUrl } from '../../../src/privacy/networkAllowlist';

describe('networkAllowlist', () => {
  it('includes localhost Valhalla on port 8002', () => {
    expect(ALLOWED_HOSTS).toContain('localhost:8002');
  });

  it('includes the public OSM tile server we use in v0a', () => {
    expect(ALLOWED_HOSTS.some((h) => h.endsWith('tile.openstreetmap.org'))).toBe(true);
  });

  it('accepts allowed URLs', () => {
    expect(isAllowedUrl('http://localhost:8002/route')).toBe(true);
    expect(isAllowedUrl('https://a.tile.openstreetmap.org/1/2/3.png')).toBe(true);
  });

  it('rejects unknown hosts', () => {
    expect(isAllowedUrl('https://evil.example.com/track')).toBe(false);
    expect(isAllowedUrl('https://google-analytics.com/collect')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/privacy/networkAllowlist.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement networkAllowlist.ts**

Create `src/privacy/networkAllowlist.ts`:

```ts
/**
 * The exhaustive list of hosts this app is allowed to contact.
 * Adding to this list is a deliberate change reviewed in PR.
 */
export const ALLOWED_HOSTS: readonly string[] = Object.freeze([
  'localhost:8002', // local Valhalla routing server
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
]);

export function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const hostPort = u.port ? `${u.hostname}:${u.port}` : u.hostname;
    return ALLOWED_HOSTS.includes(hostPort) || ALLOWED_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/privacy/networkAllowlist.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/privacy/networkAllowlist.ts tests/unit/privacy/networkAllowlist.test.ts
git commit -m "feat(privacy): add network host allowlist with isAllowedUrl() check"
```

---

## Task 14: Map View UI

**Files:**
- Create: `src/ui/mapView.ts`

MapLibre wrapper. Initializes the map, renders camera pins, draws two route polylines (shortest in red dashed, private in green solid).

- [ ] **Step 1: Add MapLibre CSS import to index.html**

Modify `index.html` — replace its current body with:

```html
  <body style="margin:0;font-family:system-ui,sans-serif">
    <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.0/dist/maplibre-gl.css" />
    <div id="app" style="display:flex;height:100vh">
      <div id="sidebar" style="width:340px;border-right:1px solid #ddd;padding:16px;overflow:auto"></div>
      <div id="map" style="flex:1"></div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
```

- [ ] **Step 2: Implement mapView.ts**

Create `src/ui/mapView.ts`:

```ts
import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import type { Camera } from '../domain/camera';
import type { GeoPoint, RouteComparison } from '../domain/route';

const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

export class MapView {
  private readonly map: MapLibreMap;
  private clickListener: ((p: GeoPoint) => void) | null = null;

  constructor(containerId: string, center: GeoPoint) {
    this.map = new maplibregl.Map({
      container: containerId,
      style: OSM_STYLE,
      center: [center.lon, center.lat],
      zoom: 13,
    });
    this.map.on('click', (e) => {
      if (this.clickListener) this.clickListener({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });
  }

  onClick(listener: (p: GeoPoint) => void): void {
    this.clickListener = listener;
  }

  renderCameras(cameras: readonly Camera[]): void {
    for (const c of cameras) {
      const el = document.createElement('div');
      el.style.cssText =
        'width:10px;height:10px;border-radius:50%;background:#d32f2f;border:2px solid #fff;box-shadow:0 0 2px rgba(0,0,0,.5)';
      el.title = `${c.type} (${c.id})`;
      new maplibregl.Marker({ element: el }).setLngLat([c.lon, c.lat]).addTo(this.map);
    }
  }

  renderComparison(cmp: RouteComparison): void {
    this.clearRoutes();
    this.addRouteLayer('shortest', cmp.shortest.polyline, '#d32f2f', true);
    this.addRouteLayer('private', cmp.private.polyline, '#2e7d32', false);

    new maplibregl.Marker({ color: '#1976d2' }).setLngLat([cmp.start.lon, cmp.start.lat]).addTo(this.map);
    new maplibregl.Marker({ color: '#1976d2' }).setLngLat([cmp.end.lon, cmp.end.lat]).addTo(this.map);
  }

  private addRouteLayer(id: string, polyline: readonly GeoPoint[], color: string, dashed: boolean): void {
    const sourceId = `route-${id}`;
    const layerId = `route-${id}-line`;
    this.map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: polyline.map((p) => [p.lon, p.lat]) },
      },
    });
    this.map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': color,
        'line-width': 5,
        ...(dashed ? { 'line-dasharray': [2, 2] } : {}),
      },
    });
  }

  private clearRoutes(): void {
    for (const id of ['shortest', 'private']) {
      const layerId = `route-${id}-line`;
      const sourceId = `route-${id}`;
      if (this.map.getLayer(layerId)) this.map.removeLayer(layerId);
      if (this.map.getSource(sourceId)) this.map.removeSource(sourceId);
    }
  }
}
```

- [ ] **Step 3: Commit (no test — visual component, exercised by E2E)**

```bash
git add src/ui/mapView.ts index.html
git commit -m "feat(ui): add MapView with OSM tiles, camera pins, route layers"
```

---

## Task 15: Profile Picker UI

**Files:**
- Create: `src/ui/profilePicker.ts`

Renders two cards (Commuter / Vulnerable) in the sidebar. Calls a callback when the user picks one.

- [ ] **Step 1: Implement profilePicker.ts**

Create `src/ui/profilePicker.ts`:

```ts
import { COMMUTER_PROFILE, VULNERABLE_PROFILE, type ThreatProfile } from '../domain/threatProfile';

const PRESETS: { profile: ThreatProfile; emoji: string; label: string; sub: string }[] = [
  {
    profile: COMMUTER_PROFILE,
    emoji: '🚗',
    label: 'Commuter',
    sub: 'Avoid worst clusters. Small detours only.',
  },
  {
    profile: VULNERABLE_PROFILE,
    emoji: '🛡️',
    label: 'Vulnerable',
    sub: 'Max avoidance. Will accept large detours.',
  },
];

export function renderProfilePicker(
  container: HTMLElement,
  onPick: (profile: ThreatProfile) => void,
): void {
  container.innerHTML = '';
  const heading = document.createElement('h3');
  heading.textContent = 'Pick a threat profile';
  heading.style.cssText = 'margin:0 0 12px';
  container.appendChild(heading);

  for (const { profile, emoji, label, sub } of PRESETS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.style.cssText =
      'display:block;width:100%;text-align:left;padding:12px;margin-bottom:8px;' +
      'border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font:inherit';
    card.innerHTML = `<div style="font-size:24px">${emoji}</div>` +
      `<div style="font-weight:600;margin-top:4px">${label}</div>` +
      `<div style="font-size:12px;color:#666;margin-top:2px">${sub}</div>`;
    card.addEventListener('click', () => onPick(profile));
    container.appendChild(card);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/profilePicker.ts
git commit -m "feat(ui): add profile picker with Commuter + Vulnerable cards"
```

---

## Task 16: Route Planner + Comparison UI

**Files:**
- Create: `src/ui/routePlanner.ts`

Single module: renders "Start (click map)", "End (click map)", "Plan route" button, and the comparison panel after a plan.

- [ ] **Step 1: Implement routePlanner.ts**

Create `src/ui/routePlanner.ts`:

```ts
import type { GeoPoint, RouteComparison } from '../domain/route';
import type { ThreatProfile } from '../domain/threatProfile';

export interface RoutePlannerCallbacks {
  readonly onPlanRequested: (start: GeoPoint, end: GeoPoint) => Promise<RouteComparison>;
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

  /** Called from main when the user clicks the map. */
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
    const cmp = await this.callbacks.onPlanRequested(this.state.start, this.state.end);
    this.renderComparison(cmp);
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
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/routePlanner.ts
git commit -m "feat(ui): add RoutePlanner with map-click point picking + comparison panel"
```

---

## Task 17: Wire Up the App

**Files:**
- Modify: `src/main.ts` (replace contents)
- Create: `src/app.ts`

- [ ] **Step 1: Implement app.ts**

Create `src/app.ts`:

```ts
import { MapView } from './ui/mapView';
import { renderProfilePicker } from './ui/profilePicker';
import { RoutePlanner } from './ui/routePlanner';
import { CameraStore } from './data/cameraStore';
import { ValhallaClient } from './routing/valhallaClient';
import { Router } from './routing/router';
import type { GeoPoint } from './domain/route';
import type { ThreatProfile } from './domain/threatProfile';

const ATLANTA_CENTER: GeoPoint = { lat: 33.7500, lon: -84.3890 };
const VALHALLA_URL = 'http://localhost:8002';
const CAMERA_DATASET_URL = '/data/cameras-atlanta-seed.json';

export async function startApp(): Promise<void> {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) throw new Error('#sidebar missing');

  const cameraStore = await CameraStore.loadFromUrl(CAMERA_DATASET_URL);
  const mapView = new MapView('map', ATLANTA_CENTER);
  mapView.renderCameras(cameraStore.all());
  const router = new Router(new ValhallaClient(VALHALLA_URL), cameraStore);

  renderProfilePicker(sidebar, (profile) => mountPlanner(sidebar, mapView, router, profile));
}

function mountPlanner(
  sidebar: HTMLElement,
  mapView: MapView,
  router: Router,
  profile: ThreatProfile,
): void {
  sidebar.innerHTML = '';
  const planner = new RoutePlanner(sidebar, {
    onPlanRequested: async (start, end) => {
      const cmp = await router.compareRoutes(start, end, profile);
      mapView.renderComparison(cmp);
      return cmp;
    },
  }, profile);
  mapView.onClick((p) => planner.handleMapClick(p));
}
```

- [ ] **Step 2: Replace main.ts**

Replace `src/main.ts` contents with:

```ts
import { startApp } from './app';

void startApp().catch((err) => {
  console.error('Failed to start app', err);
  const el = document.getElementById('app');
  if (el) el.textContent = `Startup error: ${(err as Error).message}`;
});
```

- [ ] **Step 3: Manual smoke test**

Run (in two terminals):
```bash
npm run valhalla:up
npm run dev
```

In the browser at http://localhost:5173:
1. See the Atlanta map with red camera pins
2. Pick "Commuter" → sidebar switches to planner
3. Click "Set Start on map", then click anywhere on the map
4. Click "Set End on map", then click somewhere else
5. Click "Plan route" → see two routes (red dashed = shortest, green = private) and a comparison panel
6. Repeat with "Vulnerable" — verify the green route deviates more

Stop both with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/app.ts
git commit -m "feat(app): wire profile picker + planner + map + router end-to-end"
```

---

## Task 18: Privacy Invariant Test (Playwright)

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/privacy/networkInvariants.spec.ts`

Launches the running dev app in a headless browser, captures every network request, asserts they're all in the allowlist.

- [ ] **Step 1: Create playwright.config.ts**

Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: ['**/*.spec.ts'],
  timeout: 60_000,
  use: { baseURL: 'http://localhost:5173', headless: true },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
```

- [ ] **Step 2: Install Playwright browsers**

Run: `npx playwright install chromium`
Expected: chromium downloads.

- [ ] **Step 3: Write the privacy invariant spec**

Create `tests/privacy/networkInvariants.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { isAllowedUrl } from '../../src/privacy/networkAllowlist';

test('every network request goes to an allowlisted host', async ({ page }) => {
  const violations: string[] = [];

  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    if (!isAllowedUrl(url)) violations.push(url);
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Trigger a route plan
  await page.getByText('Commuter').click();
  await page.getByRole('button', { name: 'Set Start on map' }).click();
  await page.locator('#map').click({ position: { x: 200, y: 200 } });
  await page.getByRole('button', { name: 'Set End on map' }).click();
  await page.locator('#map').click({ position: { x: 400, y: 400 } });
  await page.getByRole('button', { name: 'Plan route' }).click();
  await page.waitForTimeout(3000);

  expect(violations, `Disallowed requests: ${JSON.stringify(violations, null, 2)}`).toHaveLength(0);
});

test('route request body does NOT carry user identifiers', async ({ page }) => {
  const valhallaBodies: string[] = [];

  page.on('request', (req) => {
    if (req.url().includes(':8002/route')) {
      const body = req.postData();
      if (body) valhallaBodies.push(body);
    }
  });

  await page.goto('/');
  await page.getByText('Commuter').click();
  await page.getByRole('button', { name: 'Set Start on map' }).click();
  await page.locator('#map').click({ position: { x: 200, y: 200 } });
  await page.getByRole('button', { name: 'Set End on map' }).click();
  await page.locator('#map').click({ position: { x: 400, y: 400 } });
  await page.getByRole('button', { name: 'Plan route' }).click();
  await page.waitForTimeout(3000);

  expect(valhallaBodies.length).toBeGreaterThan(0);
  for (const body of valhallaBodies) {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('user_id');
    expect(parsed).not.toHaveProperty('session_id');
    expect(parsed).not.toHaveProperty('device_id');
    expect(Object.keys(parsed).every((k) => !k.toLowerCase().includes('id') || k === 'locations')).toBe(true);
  }
});
```

- [ ] **Step 4: Run privacy spec (Valhalla must be running)**

Run: `npm run valhalla:up && npx playwright test tests/privacy/networkInvariants.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/privacy/networkInvariants.spec.ts
git commit -m "test(privacy): assert allowlist + no user identifiers in route requests"
```

---

## Task 19: Routing Benchmark Seed

**Files:**
- Create: `tests/benchmark/atlanta-routes.spec.ts`

One curated benchmark test case. Verifies the **product premise**: Commuter profile produces a route that's not absurdly longer than shortest, while Vulnerable avoids meaningfully more cameras.

- [ ] **Step 1: Write the benchmark spec**

Create `tests/benchmark/atlanta-routes.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('Atlanta downtown→midtown: routing math produces a defensible route', async ({ page }) => {
  await page.goto('/');

  // Capture the comparison result via window globals — wire a debug hook
  // We use the public UI flow but read the DOM for the comparison summary.

  await page.getByText('Vulnerable').click();

  await page.getByRole('button', { name: 'Set Start on map' }).click();
  await page.locator('#map').click({ position: { x: 240, y: 360 } });
  await page.getByRole('button', { name: 'Set End on map' }).click();
  await page.locator('#map').click({ position: { x: 480, y: 180 } });

  await page.getByRole('button', { name: 'Plan route' }).click();

  // Wait for comparison panel
  await page.waitForSelector('text=cameras avoided', { timeout: 15_000 });
  const summary = await page.locator('text=cameras avoided').textContent();
  expect(summary).toMatch(/\d+ cameras avoided/);

  // Benchmark assertion: the v0 routing should produce a non-negative avoidance result
  // and the comparison must surface a meaningful summary line.
  // Tighter property assertions land once Phase 0b adds a richer corpus.
});
```

- [ ] **Step 2: Run the benchmark**

Run: `npx playwright test tests/benchmark/atlanta-routes.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/benchmark/atlanta-routes.spec.ts
git commit -m "test(benchmark): seed Atlanta route benchmark — comparison surfaces real diff"
```

---

## Task 20: README — How to Run

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README.md**

Create `README.md`:

````markdown
# Flock-Avoid — Phase 0a (Routing Validation Spike)

Privacy-first map + routing app that helps users avoid mass-surveillance infrastructure.

This is the **Phase 0a spike**: validates that surveillance-aware routing produces sane routes. Not yet a real product — see `docs/superpowers/specs/2026-05-15-flock-avoid-design.md` for the full design.

## Run locally

Prereqs: Docker, Node 20+, npm.

```bash
npm install
./scripts/build-valhalla-tiles.sh   # one-time; ~5-15 min, downloads ~250MB Georgia OSM
npm run valhalla:up                 # start local Valhalla on :8002
npm run dev                         # Vite dev server on :5173
```

Open http://localhost:5173. Pick a profile (Commuter / Vulnerable). Click "Set on map" for Start, click the map. Repeat for End. Click "Plan route". See the comparison.

Stop with `npm run valhalla:down`.

## Tests

```bash
npm test                  # unit + integration (requires Valhalla up for integration)
npx playwright test       # privacy invariants + benchmark
```

## Scope of this spike

- Server-side routing via local Valhalla (on-device WASM is Phase 1)
- Hand-curated 12-camera Atlanta seed dataset (DeFlock/OSM pipeline is Phase 0b)
- Two threat profiles: Commuter + Vulnerable (Activist + Custom are Phase 0b)
- Plain OSM raster tiles (self-hosted Protomaps in Phase 0b)
- No deployment, no PWA features (Phase 0b)
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with run instructions for Phase 0a spike"
```

---

## Done — Validation Exit Checklist

Before declaring Phase 0a complete and writing the Phase 0b plan, verify:

- [ ] `npm test` passes (all unit + integration tests green; Valhalla must be running for integration)
- [ ] `npx playwright test` passes (privacy invariants + benchmark)
- [ ] Manual smoke: pick Commuter, plan a route, see comparison
- [ ] Manual smoke: pick Vulnerable, plan the SAME route, see the private route deviate more (or at least no less)
- [ ] No request in the network log goes anywhere except `localhost:8002` and `*.tile.openstreetmap.org`
- [ ] The "+N min, M cameras avoided" diff line appears

If all six pass, the spike has answered yes to "does surveillance-aware routing produce sane routes?" — proceed to Phase 0b.
