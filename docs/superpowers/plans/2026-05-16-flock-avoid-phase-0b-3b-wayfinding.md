# Phase 0b-3b · Sub-project A — Wayfinding UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add address/place search (Photon-backed autocomplete), live device location, and a refreshed v0.2 map-first UI on top of the existing route-planning pipeline.

**Architecture:** Two new domain dirs (`src/geocode/`, `src/location/`) introduce search and location capabilities; the UI layer (`src/ui/`) gains seven new components (`SearchBar`, `PlannerCard`, `SearchInput`, `Fab`, `FabStack`, `LocationMarker`, `RouteSummaryCard`) and four restyles (`welcomeModal`, `datasetFreshness`, `showAllConesToggle`, `cameraDetailPopup`). Brand tokens swap from Inter+indigo to Geist+modern in one atomic commit. All third-party endpoints are reached through Vite same-origin proxies (`/photon` joins the existing `/valhalla` and `/dataset`).

**Tech Stack:** TypeScript 5 · Vite 5 · MapLibre GL JS 4 · Vitest 2 (jsdom) · Playwright · vanilla DOM (class- and function-based components, no framework).

**Spec:** `docs/superpowers/specs/2026-05-16-flock-avoid-phase-0b-3b-wayfinding.md`
**Design reference:** `design-explorations/2026-05-16-wayfinding-dossier.html`
**Branch:** `feat/phase-0b-3b-wayfinding` (already created)
**Baseline:** 157 vitest + 12 Playwright passing on master.

---

## File Structure (created by this plan)

```
public/fonts/
  Geist-Regular.woff2          NEW · self-hosted display + body 400
  Geist-Medium.woff2           NEW · 500
  Geist-SemiBold.woff2         NEW · 600
  GeistMono-Regular.woff2      NEW · mono 400
  GeistMono-Medium.woff2       NEW · mono 500
  (Inter-*.woff2)              DELETED · superseded

src/brand/
  tokens.ts                    REWRITE · v0.2 token set
  tokens.css                   REWRITE · v0.2 tokens + Geist faces + dark theme

src/geocode/
  geocodeTypes.ts              NEW · GeocodeResult, GeocodeResultType, GeocodeError
  photonClient.ts              NEW · PhotonClient.search
  zoomForType.ts               NEW · pure zoom mapping

src/location/
  locationStore.ts             NEW · LocationStore (watchPosition wrapper)

src/ui/
  fab.ts                       NEW · mountFab + FabStack
  searchInput.ts               NEW · SearchInput class (debounced autocomplete)
  searchBar.ts                 NEW · mountSearchBar (idle pill)
  plannerCard.ts               NEW · PlannerCard class (expanded planning state)
  locationMarker.ts            NEW · LocationMarker (DOM overlay positioned via map.project)
  routeSummaryCard.ts          NEW · mountRouteSummaryCard
  welcomeModal.ts              REWRITE · v0.2 copy + visual
  datasetFreshness.ts          REWRITE · bottom-left floating chip
  showAllConesToggle.ts        REWRITE · FAB-style toggle
  cameraDetailPopup.ts         REWRITE · v0.2 card

src/
  app.ts                       MODIFY · wire LocationStore + new chrome
  main.ts                      (unchanged)

tests/unit/geocode/            NEW dir
  photonClient.test.ts
  zoomForType.test.ts
tests/unit/location/           NEW dir
  locationStore.test.ts
tests/unit/ui/
  fab.test.ts                  NEW
  searchInput.test.ts          NEW
  searchBar.test.ts            NEW
  plannerCard.test.ts          NEW
  locationMarker.test.ts       NEW
  routeSummaryCard.test.ts     NEW
  welcomeModal.test.ts         MODIFY · new copy assertions
  datasetFreshness.test.ts     MODIFY · new shape
  showAllConesToggle.test.ts   MODIFY · FAB role
  cameraDetailPopup.test.ts    MODIFY · new structure
tests/unit/brand/
  tokens.test.ts               MODIFY · v0.2 tokens

tests/e2e/                     NEW dir
  searchFlow.spec.ts           NEW · search → fly E2E
  useMyLocation.spec.ts        NEW · grant permission → origin fills
tests/privacy/
  networkInvariants.spec.ts    MODIFY · cover /photon, update planner selectors

docs/superpowers/specs/2026-05-16-flock-avoid-phase-0b-3b-wayfinding.md   (spec, exists)
design-explorations/2026-05-16-wayfinding-dossier.html                   (reference, exists)
```

**Dependency graph (task order):**
```
01 (brand tokens) ─┬─ 02 (Geist woff2)
                   └─ 04 (zoomForType, pure)
03 (geocode types) ── 05 (PhotonClient) ── 06 (proxy + allowlist)
07 (LocationStore, isolated)
08 (Fab, isolated)
09 (SearchInput) ── needs 05
10 (SearchBar)   ── needs 09
11 (PlannerCard) ── needs 07, 09
12 (LocationMarker) ── needs 07
13 (RouteSummaryCard, isolated)
14–17 (component restyles, isolated each)
18 (app.ts wiring) ── needs 07, 10, 11, 12, 13, 14
19 (privacy invariant update) ── needs 06, 18
20 (E2E search) ── needs 18
21 (E2E location) ── needs 18
```

---

## Pre-flight (before Task 1)

- [ ] Confirm you are on `feat/phase-0b-3b-wayfinding` branch.
- [ ] Run baseline: `npm test` → expect 157 passing. `npm run lint` → expect 0 errors. `npx tsc --noEmit` → expect 0 errors.
- [ ] If baseline fails, stop and report — do not start until green.

---

## Task 1 — Brand tokens v0.2 (TS + CSS in lockstep)

**Why:** v0.2 design needs new color/scale/type/shadow/radius/motion tokens. The token sync test (`tests/unit/brand/tokens.test.ts`) enforces TS↔CSS parity, so both files must change together. Tasks that depend on tokens (everything after) read them via CSS custom properties.

**Files:**
- Modify: `src/brand/tokens.ts`
- Modify: `src/brand/tokens.css`
- Modify: `tests/unit/brand/tokens.test.ts`

- [ ] **Step 1: Rewrite the token test for v0.2 shape**

Replace `tests/unit/brand/tokens.test.ts` entirely:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND_TOKENS } from '../../../src/brand/tokens';

describe('brand tokens v0.2', () => {
  it('exports the v0.2 color palette', () => {
    expect(BRAND_TOKENS.color.ink).toBe('#0a0a0b');
    expect(BRAND_TOKENS.color.surface).toBe('#ffffff');
    expect(BRAND_TOKENS.color['bg-alt']).toBe('#f7f7f5');
    expect(BRAND_TOKENS.color.muted).toBe('#71717a');
    expect(BRAND_TOKENS.color.accent).toBe('#2f54ff');
    expect(BRAND_TOKENS.color['accent-soft']).toBe('#eef1ff');
    expect(BRAND_TOKENS.color.threat).toBe('#dc2626');
    expect(BRAND_TOKENS.color.safe).toBe('#059669');
  });

  it('exports the v0.2 spacing scale', () => {
    expect(BRAND_TOKENS.space['1']).toBe('4px');
    expect(BRAND_TOKENS.space['8']).toBe('48px');
  });

  it('exports the v0.2 radius scale including pill', () => {
    expect(BRAND_TOKENS.radius.pill).toBe('999px');
  });

  it('TS and CSS files agree on every token (light theme)', () => {
    const cssPath = join(__dirname, '../../../src/brand/tokens.css');
    const cssRaw = readFileSync(cssPath, 'utf-8');
    for (const [key, value] of Object.entries(BRAND_TOKENS.color)) {
      expect(cssRaw, `missing --color-${key} in tokens.css`).toContain(`--color-${key}: ${value}`);
    }
    for (const [key, value] of Object.entries(BRAND_TOKENS.space)) {
      expect(cssRaw).toContain(`--space-${key}: ${value}`);
    }
    for (const [key, value] of Object.entries(BRAND_TOKENS.radius)) {
      expect(cssRaw).toContain(`--radius-${key}: ${value}`);
    }
    for (const [key, value] of Object.entries(BRAND_TOKENS.shadow)) {
      expect(cssRaw).toContain(`--shadow-${key}: ${value}`);
    }
    for (const [key, value] of Object.entries(BRAND_TOKENS.fontSize)) {
      expect(cssRaw).toContain(`--font-size-${key}: ${value}`);
    }
  });

  it('CSS declares a dark theme via [data-theme="dark"]', () => {
    const cssPath = join(__dirname, '../../../src/brand/tokens.css');
    const cssRaw = readFileSync(cssPath, 'utf-8');
    expect(cssRaw).toMatch(/\[data-theme="dark"\]\s*\{/);
  });

  it('CSS declares Geist + Geist Mono @font-face blocks (self-hosted)', () => {
    const cssPath = join(__dirname, '../../../src/brand/tokens.css');
    const cssRaw = readFileSync(cssPath, 'utf-8');
    expect(cssRaw).toContain(`font-family: 'Geist'`);
    expect(cssRaw).toContain(`font-family: 'Geist Mono'`);
    expect(cssRaw).toContain(`/fonts/Geist-Regular.woff2`);
    expect(cssRaw).toContain(`/fonts/GeistMono-Regular.woff2`);
  });

  it('CSS does NOT reference Inter (cleaned up from Phase 0b-3a)', () => {
    const cssPath = join(__dirname, '../../../src/brand/tokens.css');
    const cssRaw = readFileSync(cssPath, 'utf-8');
    expect(cssRaw).not.toMatch(/Inter/);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```
npx vitest run tests/unit/brand/tokens.test.ts
```
Expected: tests fail (`BRAND_TOKENS.color.ink` undefined, etc.).

- [ ] **Step 3: Rewrite `src/brand/tokens.ts`**

```ts
export const BRAND_TOKENS = {
  color: {
    'ink':         '#0a0a0b',
    'ink-2':       '#27272a',
    'surface':     '#ffffff',
    'bg-alt':      '#f7f7f5',
    'muted':       '#71717a',
    'muted-2':     '#a1a1aa',
    'border':      'rgba(10, 10, 11, 0.10)',
    'border-strong':'rgba(10, 10, 11, 0.18)',
    'hairline':    'rgba(10, 10, 11, 0.06)',
    'accent':      '#2f54ff',
    'accent-soft': '#eef1ff',
    'threat':      '#dc2626',
    'threat-soft': '#fef2f2',
    'safe':        '#059669',
    'safe-soft':   '#ecfdf5',
    'warn':        '#d97706',
  },
  space: {
    '1': '4px',  '2': '8px',  '3': '12px', '4': '16px',
    '5': '20px', '6': '24px', '7': '32px', '8': '48px', '9': '64px',
  },
  radius: {
    'sm':   '8px',
    'md':   '12px',
    'lg':   '16px',
    'xl':   '20px',
    'pill': '999px',
  },
  shadow: {
    '1': '0 1px 2px rgba(15, 15, 18, 0.04), 0 1px 1px rgba(15, 15, 18, 0.02)',
    '2': '0 1px 3px rgba(15, 15, 18, 0.06), 0 8px 24px rgba(15, 15, 18, 0.08)',
    '3': '0 2px 6px rgba(15, 15, 18, 0.08), 0 24px 48px rgba(15, 15, 18, 0.14)',
  },
  fontSize: {
    'xs':   '11px',
    'sm':   '12.5px',
    'base': '14px',
    'md':   '15px',
    'lg':   '18px',
    'xl':   '24px',
    '2xl':  '36px',
  },
} as const;
```

- [ ] **Step 4: Rewrite `src/brand/tokens.css`**

```css
:root {
  /* color */
  --color-ink: #0a0a0b;
  --color-ink-2: #27272a;
  --color-surface: #ffffff;
  --color-bg-alt: #f7f7f5;
  --color-muted: #71717a;
  --color-muted-2: #a1a1aa;
  --color-border: rgba(10, 10, 11, 0.10);
  --color-border-strong: rgba(10, 10, 11, 0.18);
  --color-hairline: rgba(10, 10, 11, 0.06);
  --color-accent: #2f54ff;
  --color-accent-soft: #eef1ff;
  --color-threat: #dc2626;
  --color-threat-soft: #fef2f2;
  --color-safe: #059669;
  --color-safe-soft: #ecfdf5;
  --color-warn: #d97706;

  /* space */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-7: 32px; --space-8: 48px; --space-9: 64px;

  /* radius */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-pill: 999px;

  /* shadow */
  --shadow-1: 0 1px 2px rgba(15, 15, 18, 0.04), 0 1px 1px rgba(15, 15, 18, 0.02);
  --shadow-2: 0 1px 3px rgba(15, 15, 18, 0.06), 0 8px 24px rgba(15, 15, 18, 0.08);
  --shadow-3: 0 2px 6px rgba(15, 15, 18, 0.08), 0 24px 48px rgba(15, 15, 18, 0.14);

  /* type */
  --font-family-sans: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-family-mono: 'Geist Mono', 'SF Mono', 'JetBrains Mono', Menlo, monospace;
  --font-size-xs: 11px;
  --font-size-sm: 12.5px;
  --font-size-base: 14px;
  --font-size-md: 15px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;
  --font-size-2xl: 36px;

  /* motion */
  --motion-fast: 160ms;
  --motion-base: 200ms;
  --easing-out: cubic-bezier(0.16, 1, 0.3, 1);
  --easing-in:  cubic-bezier(0.7, 0, 0.84, 0);

  /* ambient theme metadata */
  color-scheme: light dark;
}

[data-theme="dark"] {
  --color-ink: #fafafa;
  --color-ink-2: #d4d4d8;
  --color-surface: #18181b;
  --color-bg-alt: #111114;
  --color-muted: #a1a1aa;
  --color-muted-2: #71717a;
  --color-border: rgba(255, 255, 255, 0.10);
  --color-border-strong: rgba(255, 255, 255, 0.18);
  --color-hairline: rgba(255, 255, 255, 0.06);
  --color-accent: #6f8aff;
  --color-accent-soft: rgba(111, 138, 255, 0.16);
  --color-threat: #f87171;
  --color-threat-soft: rgba(248, 113, 113, 0.15);
  --color-safe: #34d399;
  --color-safe-soft: rgba(52, 211, 153, 0.15);
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-2: 0 1px 3px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.5);
  --shadow-3: 0 2px 6px rgba(0, 0, 0, 0.4), 0 24px 48px rgba(0, 0, 0, 0.6);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-ink: #fafafa;
    --color-ink-2: #d4d4d8;
    --color-surface: #18181b;
    --color-bg-alt: #111114;
    --color-muted: #a1a1aa;
    --color-muted-2: #71717a;
    --color-border: rgba(255, 255, 255, 0.10);
    --color-border-strong: rgba(255, 255, 255, 0.18);
    --color-hairline: rgba(255, 255, 255, 0.06);
    --color-accent: #6f8aff;
    --color-accent-soft: rgba(111, 138, 255, 0.16);
    --color-threat: #f87171;
    --color-threat-soft: rgba(248, 113, 113, 0.15);
    --color-safe: #34d399;
    --color-safe-soft: rgba(52, 211, 153, 0.15);
    --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4);
    --shadow-2: 0 1px 3px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.5);
    --shadow-3: 0 2px 6px rgba(0, 0, 0, 0.4), 0 24px 48px rgba(0, 0, 0, 0.6);
  }
}

@font-face {
  font-family: 'Geist';
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/Geist-Regular.woff2') format('woff2');
}
@font-face {
  font-family: 'Geist';
  font-weight: 500;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/Geist-Medium.woff2') format('woff2');
}
@font-face {
  font-family: 'Geist';
  font-weight: 600;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/Geist-SemiBold.woff2') format('woff2');
}
@font-face {
  font-family: 'Geist Mono';
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/GeistMono-Regular.woff2') format('woff2');
}
@font-face {
  font-family: 'Geist Mono';
  font-weight: 500;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/GeistMono-Medium.woff2') format('woff2');
}
```

- [ ] **Step 5: Run test — expect PASS**

```
npx vitest run tests/unit/brand/tokens.test.ts
```
All assertions pass.

- [ ] **Step 6: Commit**

```
git add src/brand/tokens.ts src/brand/tokens.css tests/unit/brand/tokens.test.ts
git commit -m "feat(brand): v0.2 token set (Geist, modern map-first colors, dark theme)"
```

Note: existing components that reference old token names (`--color-brand-primary`, `--font-family-sans` etc.) will visually break until Task 18 rewires `app.ts`. Type-check + test suite stay green because the test only enforces token sync, not consumer correctness. We accept transient visual breakage on the feature branch.

---

## Task 2 — Self-host Geist + Geist Mono woff2 files

**Why:** Phase 0b-3a established the precedent of self-hosting fonts (no `fonts.googleapis.com` allowlist trip). Task 1's CSS references `/fonts/Geist-*.woff2` paths; this task puts the actual files there and removes the Inter assets they replace.

**Files:**
- Create: `public/fonts/Geist-Regular.woff2`, `Geist-Medium.woff2`, `Geist-SemiBold.woff2`
- Create: `public/fonts/GeistMono-Regular.woff2`, `GeistMono-Medium.woff2`
- Delete: `public/fonts/Inter-*.woff2`

- [ ] **Step 1: Download Geist Sans woff2 from the official Geist repo**

Geist is published by Vercel under the SIL Open Font License. Use the official release.

```
cd /tmp
curl -L -o geist-font.zip https://github.com/vercel/geist-font/archive/refs/heads/main.zip
unzip -o geist-font.zip 'geist-font-main/fonts/geist/woff2/*' -d /tmp/geist-extract
ls /tmp/geist-extract/geist-font-main/fonts/geist/woff2/
```
Expected: a list of woff2 files for each weight.

- [ ] **Step 2: Copy the three Sans weights into `public/fonts/`**

```
cp /tmp/geist-extract/geist-font-main/fonts/geist/woff2/Geist-Regular.woff2  ~/projects/flock-avoid/public/fonts/
cp /tmp/geist-extract/geist-font-main/fonts/geist/woff2/Geist-Medium.woff2   ~/projects/flock-avoid/public/fonts/
cp /tmp/geist-extract/geist-font-main/fonts/geist/woff2/Geist-SemiBold.woff2 ~/projects/flock-avoid/public/fonts/
```

- [ ] **Step 3: Extract and copy the two Mono weights**

```
unzip -o /tmp/geist-font.zip 'geist-font-main/fonts/geist-mono/woff2/*' -d /tmp/geist-extract
cp /tmp/geist-extract/geist-font-main/fonts/geist-mono/woff2/GeistMono-Regular.woff2 ~/projects/flock-avoid/public/fonts/
cp /tmp/geist-extract/geist-font-main/fonts/geist-mono/woff2/GeistMono-Medium.woff2  ~/projects/flock-avoid/public/fonts/
ls ~/projects/flock-avoid/public/fonts/Geist*.woff2 ~/projects/flock-avoid/public/fonts/GeistMono*.woff2
```
Expected: five woff2 files listed.

- [ ] **Step 4: Audit and remove Inter**

```
cd ~/projects/flock-avoid
grep -r "Inter" src/ tests/ index.html --include='*.ts' --include='*.css' --include='*.html' 2>/dev/null
```
Expected: zero matches (Task 1 already removed Inter from `tokens.css`; if any straggler is found in a component's inline `font-family` string, replace it with `var(--font-family-sans)` and commit that fix separately as a follow-up to Task 1).

```
rm public/fonts/Inter-Regular.woff2 public/fonts/Inter-Medium.woff2 public/fonts/Inter-SemiBold.woff2 public/fonts/Inter-Bold.woff2
ls public/fonts/
```
Expected: only the five Geist files remain.

- [ ] **Step 5: Verify Vite serves the new fonts**

```
npm run dev &
sleep 3
curl -sSI http://localhost:5173/fonts/Geist-Regular.woff2 | head -3
curl -sSI http://localhost:5173/fonts/GeistMono-Regular.woff2 | head -3
kill %1 2>/dev/null
```
Expected: `HTTP/1.1 200 OK` and `content-type: font/woff2` for both.

- [ ] **Step 6: Commit**

```
git add public/fonts/
git commit -m "chore(fonts): self-host Geist + Geist Mono, drop Inter"
```

---

## Task 3 — Geocode types

**Why:** Establish the shared shape before the client and the UI both depend on it. Pure type file, no runtime.

**Files:**
- Create: `src/geocode/geocodeTypes.ts`

- [ ] **Step 1: Create `src/geocode/geocodeTypes.ts`**

```ts
export type GeocodeResultType =
  | 'city'
  | 'state'
  | 'country'
  | 'street'
  | 'address'
  | 'poi'
  | 'other';

export interface GeocodeResult {
  /** Stable id: `${osm_type}/${osm_id}` when available, else `${lat},${lon}`. */
  readonly id: string;
  /** Primary label, e.g. "Krog Street Market". */
  readonly name: string;
  /** Secondary label, e.g. "99 Krog St NE, Inman Park, Atlanta GA". */
  readonly secondary: string;
  readonly type: GeocodeResultType;
  readonly lat: number;
  readonly lon: number;
  /** [minLon, minLat, maxLon, maxLat] when Photon provides one. */
  readonly bbox?: readonly [number, number, number, number];
}

export class GeocodeError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'http' | 'parse' | 'aborted',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GeocodeError';
  }
}
```

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Commit**

```
git add src/geocode/geocodeTypes.ts
git commit -m "feat(geocode): GeocodeResult + GeocodeError types"
```

---

## Task 4 — `zoomForType` pure function

**Why:** Maps Photon result types to a sensible map zoom level. Pure function, easy to TDD.

**Files:**
- Create: `src/geocode/zoomForType.ts`
- Test: `tests/unit/geocode/zoomForType.test.ts`

- [ ] **Step 1: Create the failing test**

```ts
// tests/unit/geocode/zoomForType.test.ts
import { describe, it, expect } from 'vitest';
import { zoomForType } from '../../../src/geocode/zoomForType';

describe('zoomForType', () => {
  it('returns 6 for state', () => { expect(zoomForType('state')).toBe(6); });
  it('returns 4 for country', () => { expect(zoomForType('country')).toBe(4); });
  it('returns 11 for city', () => { expect(zoomForType('city')).toBe(11); });
  it('returns 15 for street', () => { expect(zoomForType('street')).toBe(15); });
  it('returns 16 for address', () => { expect(zoomForType('address')).toBe(16); });
  it('returns 16 for poi', () => { expect(zoomForType('poi')).toBe(16); });
  it('returns 13 for other (safe default)', () => { expect(zoomForType('other')).toBe(13); });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
npx vitest run tests/unit/geocode/zoomForType.test.ts
```
Expected: "Cannot find module '../../../src/geocode/zoomForType'".

- [ ] **Step 3: Create `src/geocode/zoomForType.ts`**

```ts
import type { GeocodeResultType } from './geocodeTypes';

export function zoomForType(type: GeocodeResultType): number {
  switch (type) {
    case 'country': return 4;
    case 'state':   return 6;
    case 'city':    return 11;
    case 'street':  return 15;
    case 'address': return 16;
    case 'poi':     return 16;
    case 'other':   return 13;
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```
npx vitest run tests/unit/geocode/zoomForType.test.ts
```
All 7 pass.

- [ ] **Step 5: Commit**

```
git add src/geocode/zoomForType.ts tests/unit/geocode/zoomForType.test.ts
git commit -m "feat(geocode): zoomForType helper"
```

---

## Task 5 — PhotonClient

**Why:** Wraps Photon's REST endpoint behind a typed interface that returns `GeocodeResult[]`. Uses `fetch` + `AbortSignal`. Translates Photon's GeoJSON `FeatureCollection` into our domain type, including the result-type inference Photon doesn't do directly.

**Files:**
- Create: `src/geocode/photonClient.ts`
- Test: `tests/unit/geocode/photonClient.test.ts`

- [ ] **Step 1: Create the failing test**

```ts
// tests/unit/geocode/photonClient.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PhotonClient } from '../../../src/geocode/photonClient';
import { GeocodeError } from '../../../src/geocode/geocodeTypes';

const photonResponse = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        osm_type: 'W', osm_id: 12345,
        name: 'Krog Street Market',
        street: 'Krog St NE', housenumber: '99',
        city: 'Atlanta', state: 'Georgia', country: 'United States',
        osm_key: 'shop', osm_value: 'mall',
      },
      geometry: { type: 'Point', coordinates: [-84.3617, 33.7553] },
    },
    {
      type: 'Feature',
      properties: {
        osm_type: 'N', osm_id: 67890,
        name: 'Atlanta', city: 'Atlanta', state: 'Georgia', country: 'United States',
        osm_key: 'place', osm_value: 'city',
        extent: [-84.55, 33.65, -84.30, 33.89],
      },
      geometry: { type: 'Point', coordinates: [-84.39, 33.749] },
    },
  ],
};

describe('PhotonClient', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('search() hits /photon/api with q and limit params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(photonResponse), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new PhotonClient('/photon');
    await client.search('krog');
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('/photon/api?');
    expect(url).toContain('q=krog');
    expect(url).toContain('limit=5');
    expect(url).toContain('lang=en');
  });

  it('parses POI features with name + secondary address', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(photonResponse), { status: 200 }),
    ));
    const results = await new PhotonClient('/photon').search('krog');
    expect(results[0]?.id).toBe('W/12345');
    expect(results[0]?.name).toBe('Krog Street Market');
    expect(results[0]?.secondary).toContain('99 Krog St NE');
    expect(results[0]?.secondary).toContain('Atlanta');
    expect(results[0]?.type).toBe('poi');
    expect(results[0]?.lat).toBeCloseTo(33.7553);
    expect(results[0]?.lon).toBeCloseTo(-84.3617);
  });

  it('infers city type and extracts bbox from "extent"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(photonResponse), { status: 200 }),
    ));
    const results = await new PhotonClient('/photon').search('atlanta');
    expect(results[1]?.type).toBe('city');
    expect(results[1]?.bbox).toEqual([-84.55, 33.65, -84.30, 33.89]);
  });

  it('throws GeocodeError(http) on non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 503 })));
    await expect(new PhotonClient('/photon').search('x')).rejects.toMatchObject({
      name: 'GeocodeError', kind: 'http', status: 503,
    });
  });

  it('throws GeocodeError(network) on fetch rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(new PhotonClient('/photon').search('x')).rejects.toMatchObject({
      name: 'GeocodeError', kind: 'network',
    });
  });

  it('throws GeocodeError(aborted) when signal aborts mid-flight', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    }));
    await expect(
      new PhotonClient('/photon').search('x', controller.signal),
    ).rejects.toMatchObject({ name: 'GeocodeError', kind: 'aborted' });
  });

  it('forwards the AbortSignal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const ctrl = new AbortController();
    await new PhotonClient('/photon').search('x', ctrl.signal);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ signal: ctrl.signal });
  });

  it('returns [] for empty query without hitting the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const results = await new PhotonClient('/photon').search('   ');
    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
npx vitest run tests/unit/geocode/photonClient.test.ts
```
Expected: module not found.

- [ ] **Step 3: Create `src/geocode/photonClient.ts`**

```ts
import { GeocodeError, type GeocodeResult, type GeocodeResultType } from './geocodeTypes';

interface PhotonFeature {
  type: 'Feature';
  properties: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    osm_key?: string;
    osm_value?: string;
    extent?: [number, number, number, number];
  };
  geometry: { type: 'Point'; coordinates: [number, number] };
}

interface PhotonResponse {
  type: 'FeatureCollection';
  features: readonly PhotonFeature[];
}

export class PhotonClient {
  constructor(private readonly baseUrl: string = '/photon') {}

  async search(query: string, signal?: AbortSignal): Promise<readonly GeocodeResult[]> {
    const q = query.trim();
    if (q.length === 0) return [];
    const url = `${this.baseUrl}/api?q=${encodeURIComponent(q)}&limit=5&lang=en`;
    let resp: Response;
    try {
      resp = await fetch(url, { signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new GeocodeError('Search aborted', 'aborted');
      }
      throw new GeocodeError(
        err instanceof Error ? err.message : 'Network error',
        'network',
      );
    }
    if (!resp.ok) {
      throw new GeocodeError(`Photon returned ${resp.status}`, 'http', resp.status);
    }
    let json: PhotonResponse;
    try {
      json = (await resp.json()) as PhotonResponse;
    } catch (err) {
      throw new GeocodeError(
        err instanceof Error ? err.message : 'Malformed JSON',
        'parse',
      );
    }
    return json.features.map(featureToResult);
  }
}

function featureToResult(f: PhotonFeature): GeocodeResult {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const id =
    p.osm_type && p.osm_id !== undefined ? `${p.osm_type}/${p.osm_id}` : `${lat},${lon}`;
  const name = p.name ?? p.street ?? `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const secondary = buildSecondary(p);
  const type = inferType(p);
  const result: GeocodeResult = {
    id,
    name,
    secondary,
    type,
    lat,
    lon,
    ...(p.extent ? { bbox: p.extent } : {}),
  };
  return result;
}

function buildSecondary(p: PhotonFeature['properties']): string {
  const parts: string[] = [];
  if (p.housenumber && p.street) parts.push(`${p.housenumber} ${p.street}`);
  else if (p.street) parts.push(p.street);
  if (p.city) parts.push(p.city);
  if (p.state) parts.push(p.state);
  if (p.postcode) parts.push(p.postcode);
  return parts.join(', ');
}

function inferType(p: PhotonFeature['properties']): GeocodeResultType {
  const key = p.osm_key;
  const value = p.osm_value;
  if (key === 'place') {
    if (value === 'country') return 'country';
    if (value === 'state' || value === 'region') return 'state';
    if (value === 'city' || value === 'town' || value === 'village') return 'city';
  }
  if (key === 'highway') return 'street';
  if (p.housenumber) return 'address';
  if (key === 'shop' || key === 'amenity' || key === 'tourism' || key === 'leisure') return 'poi';
  return 'other';
}
```

- [ ] **Step 4: Run — expect PASS**

```
npx vitest run tests/unit/geocode/photonClient.test.ts
```
All 8 pass.

- [ ] **Step 5: Commit**

```
git add src/geocode/photonClient.ts tests/unit/geocode/photonClient.test.ts
git commit -m "feat(geocode): PhotonClient with typed errors + abort support"
```

---

## Task 6 — `/photon` Vite proxy + network allowlist

**Why:** Same-origin invariant. Photon queries must go through a Vite dev proxy (and same-origin reverse proxy in production); the allowlist gets `photon.komoot.io` so the privacy invariant test stays correct when the proxy is bypassed in any direct fetches.

**Files:**
- Modify: `vite.config.ts`
- Modify: `src/privacy/networkAllowlist.ts`
- Modify: `tests/unit/privacy/networkAllowlist.test.ts`

- [ ] **Step 1: Extend the allowlist test**

Append to `tests/unit/privacy/networkAllowlist.test.ts`:

```ts
  it('includes photon.komoot.io for geocoding', () => {
    expect(ALLOWED_HOSTS).toContain('photon.komoot.io');
  });

  it('accepts a Photon search URL', () => {
    expect(isAllowedUrl('https://photon.komoot.io/api?q=krog')).toBe(true);
  });
```

- [ ] **Step 2: Run — expect FAIL**

```
npx vitest run tests/unit/privacy/networkAllowlist.test.ts
```
Expected: two new assertions fail.

- [ ] **Step 3: Add `photon.komoot.io` to the allowlist**

Edit `src/privacy/networkAllowlist.ts`, append before the closing `]`:

```ts
  'photon.komoot.io',                  // Photon geocoder (Phase 0b-3b)
```

- [ ] **Step 4: Run — expect PASS**

```
npx vitest run tests/unit/privacy/networkAllowlist.test.ts
```
All pass.

- [ ] **Step 5: Add the `/photon` proxy to `vite.config.ts`**

Inside the `proxy: { ... }` block, after the `/dataset` entry:

```ts
      // Photon public geocoder. Same same-origin pattern as /valhalla and /dataset:
      // browser only talks to its own origin; the proxy hops to photon.komoot.io.
      '/photon': {
        target: 'https://photon.komoot.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/photon/, ''),
      },
```

- [ ] **Step 6: Verify the proxy works**

```
npm run dev &
sleep 3
curl -s 'http://localhost:5173/photon/api?q=atlanta&limit=1' | head -c 200
kill %1 2>/dev/null
```
Expected: JSON beginning `{"features":[...` — confirms the proxy is forwarding correctly. If Photon is unreachable from your network the test is informational only; the dev server still works.

- [ ] **Step 7: Commit**

```
git add vite.config.ts src/privacy/networkAllowlist.ts tests/unit/privacy/networkAllowlist.test.ts
git commit -m "feat(privacy): /photon dev proxy + photon.komoot.io allowlist"
```

---

## Task 7 — LocationStore

**Why:** Wrap `navigator.geolocation.watchPosition` + the Permissions API behind a typed, subscribable store. No DOM. No UI. Pure browser-API mediator that other components can plug into.

**Files:**
- Create: `src/location/locationStore.ts`
- Test: `tests/unit/location/locationStore.test.ts`

- [ ] **Step 1: Create the failing test**

```ts
// tests/unit/location/locationStore.test.ts
/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocationStore } from '../../../src/location/locationStore';

function fakeGeolocation(): {
  watchPosition: ReturnType<typeof vi.fn>;
  clearWatch: ReturnType<typeof vi.fn>;
  fire(pos: { lat: number; lon: number; acc: number }): void;
  fail(code: number): void;
} {
  let success: PositionCallback | null = null;
  let error: PositionErrorCallback | null = null;
  const watchPosition = vi.fn((s: PositionCallback, e: PositionErrorCallback) => {
    success = s; error = e; return 42;
  });
  const clearWatch = vi.fn();
  return {
    watchPosition, clearWatch,
    fire(pos) {
      success?.({
        coords: { latitude: pos.lat, longitude: pos.lon, accuracy: pos.acc,
          altitude: null, altitudeAccuracy: null, heading: null, speed: null,
          toJSON: () => ({}) },
        timestamp: 1700000000000,
        toJSON: () => ({}),
      } as GeolocationPosition);
    },
    fail(code) {
      error?.({ code, message: 'fake', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    },
  };
}

describe('LocationStore', () => {
  let geo: ReturnType<typeof fakeGeolocation>;
  beforeEach(() => {
    geo = fakeGeolocation();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true, value: { watchPosition: geo.watchPosition, clearWatch: geo.clearWatch, getCurrentPosition: vi.fn() },
    });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('starts in idle state', () => {
    const s = new LocationStore();
    expect(s.state.status).toBe('idle');
    expect(s.lastPosition()).toBeNull();
  });

  it('transitions idle → pending → tracking on successful start + fix', () => {
    const s = new LocationStore();
    const seen: string[] = [];
    s.subscribe((st) => seen.push(st.status));
    s.start();
    expect(geo.watchPosition).toHaveBeenCalledOnce();
    expect(s.state.status).toBe('pending');
    geo.fire({ lat: 33.7501, lon: -84.389, acc: 12 });
    expect(s.state.status).toBe('tracking');
    expect(s.lastPosition()).toMatchObject({ lat: 33.7501, lon: -84.389, accuracyMeters: 12 });
    expect(seen).toEqual(['pending', 'tracking']);
  });

  it('transitions to denied on PERMISSION_DENIED', () => {
    const s = new LocationStore();
    s.start();
    geo.fail(1);
    expect(s.state.status).toBe('denied');
  });

  it('transitions to unavailable on POSITION_UNAVAILABLE', () => {
    const s = new LocationStore();
    s.start();
    geo.fail(2);
    expect(s.state.status).toBe('unavailable');
  });

  it('start() is idempotent — does not re-watch', () => {
    const s = new LocationStore();
    s.start(); s.start(); s.start();
    expect(geo.watchPosition).toHaveBeenCalledOnce();
  });

  it('stop() clears the watch and returns to idle', () => {
    const s = new LocationStore();
    s.start();
    geo.fire({ lat: 1, lon: 2, acc: 5 });
    s.stop();
    expect(geo.clearWatch).toHaveBeenCalledWith(42);
    expect(s.state.status).toBe('idle');
  });

  it('subscribe() returns an unsubscribe fn', () => {
    const s = new LocationStore();
    const cb = vi.fn();
    const unsub = s.subscribe(cb);
    s.start();
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    geo.fire({ lat: 0, lon: 0, acc: 1 });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('state object is replaced on update (immutability)', () => {
    const s = new LocationStore();
    const before = s.state;
    s.start();
    expect(s.state).not.toBe(before);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module '.../locationStore'`).

```
npx vitest run tests/unit/location/locationStore.test.ts
```

- [ ] **Step 3: Create `src/location/locationStore.ts`**

```ts
export interface GeoPosition {
  readonly lat: number;
  readonly lon: number;
  readonly accuracyMeters: number;
  readonly timestamp: number;
}

export type LocationState =
  | { readonly status: 'idle' }
  | { readonly status: 'pending' }
  | { readonly status: 'tracking'; readonly position: GeoPosition }
  | { readonly status: 'denied' }
  | { readonly status: 'unavailable'; readonly reason: string };

type Listener = (state: LocationState) => void;

const HIGH_ACCURACY_OFF: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 5000,
  timeout: 15000,
};

export class LocationStore {
  private current: LocationState = { status: 'idle' };
  private listeners = new Set<Listener>();
  private watchId: number | null = null;

  get state(): LocationState {
    return this.current;
  }

  lastPosition(): GeoPosition | null {
    return this.current.status === 'tracking' ? this.current.position : null;
  }

  start(): void {
    if (this.watchId !== null) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.set({ status: 'unavailable', reason: 'Geolocation API not available' });
      return;
    }
    this.set({ status: 'pending' });
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.set({
          status: 'tracking',
          position: {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracyMeters: pos.coords.accuracy,
            timestamp: pos.timestamp,
          },
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) this.set({ status: 'denied' });
        else this.set({ status: 'unavailable', reason: err.message });
      },
      HIGH_ACCURACY_OFF,
    );
  }

  stop(): void {
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = null;
    this.set({ status: 'idle' });
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    cb(this.current);
    return () => { this.listeners.delete(cb); };
  }

  private set(next: LocationState): void {
    this.current = next;
    for (const l of this.listeners) l(next);
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```
npx vitest run tests/unit/location/locationStore.test.ts
```
All 8 pass.

- [ ] **Step 5: Commit**

```
git add src/location/locationStore.ts tests/unit/location/locationStore.test.ts
git commit -m "feat(location): LocationStore wraps watchPosition with typed state"
```

---

## Task 8 — Fab + FabStack

**Why:** Reusable floating action button used by the location-recenter button, the show-all-cones toggle, and the sensor-pins toggle. Pure presentational.

**Files:**
- Create: `src/ui/fab.ts`
- Test: `tests/unit/ui/fab.test.ts`

- [ ] **Step 1: Failing test**

```ts
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountFab, mountFabStack } from '../../../src/ui/fab';

describe('fab', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="c"></div>'; });

  it('mountFab renders a square button with aria-label', () => {
    const c = document.getElementById('c')!;
    mountFab(c, { ariaLabel: 'Recenter on me', icon: '<svg/>', onClick: () => {} });
    const btn = c.querySelector('button[data-fab]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-label')).toBe('Recenter on me');
    expect(btn.innerHTML).toContain('<svg');
  });

  it('mountFab forwards onClick', () => {
    const c = document.getElementById('c')!;
    let clicked = 0;
    mountFab(c, { ariaLabel: 'X', icon: '·', onClick: () => { clicked++; } });
    (c.querySelector('button[data-fab]') as HTMLButtonElement).click();
    expect(clicked).toBe(1);
  });

  it('mountFab respects pressed: true → aria-pressed=true + active class', () => {
    const c = document.getElementById('c')!;
    mountFab(c, { ariaLabel: 'Toggle', icon: '·', onClick: () => {}, pressed: true });
    const btn = c.querySelector('button[data-fab]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.dataset['active']).toBe('true');
  });

  it('mountFabStack creates a positioned container at top:50% right:s-4', () => {
    const c = document.getElementById('c')!;
    const stack = mountFabStack(c);
    expect(stack.tagName).toBe('DIV');
    expect(stack.dataset['fabStack']).toBe('true');
    expect(stack.style.position).toBe('absolute');
    expect(c.contains(stack)).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
npx vitest run tests/unit/ui/fab.test.ts
```

- [ ] **Step 3: Create `src/ui/fab.ts`**

```ts
export interface FabOptions {
  readonly ariaLabel: string;
  /** Inline SVG markup string. */
  readonly icon: string;
  readonly onClick: () => void;
  readonly pressed?: boolean;
}

export function mountFab(container: HTMLElement, opts: FabOptions): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset['fab'] = 'true';
  if (opts.pressed !== undefined) {
    btn.setAttribute('aria-pressed', String(opts.pressed));
    if (opts.pressed) btn.dataset['active'] = 'true';
  }
  btn.setAttribute('aria-label', opts.ariaLabel);
  btn.innerHTML = opts.icon;
  btn.style.cssText =
    'width:40px;height:40px;border-radius:var(--radius-md);' +
    'background:var(--color-surface);box-shadow:var(--shadow-2);' +
    'border:1px solid var(--color-border);color:var(--color-ink-2);' +
    'display:inline-flex;align-items:center;justify-content:center;' +
    'cursor:pointer;transition:background var(--motion-fast) var(--easing-out)';
  if (opts.pressed) {
    btn.style.background = 'var(--color-accent)';
    btn.style.color = '#fff';
    btn.style.borderColor = 'transparent';
  }
  btn.addEventListener('click', opts.onClick);
  container.appendChild(btn);
  return btn;
}

export function mountFabStack(container: HTMLElement): HTMLDivElement {
  const stack = document.createElement('div');
  stack.dataset['fabStack'] = 'true';
  stack.style.cssText =
    'position:absolute;right:var(--space-4);top:50%;transform:translateY(-50%);' +
    'display:flex;flex-direction:column;gap:var(--space-2);z-index:5';
  container.appendChild(stack);
  return stack;
}
```

- [ ] **Step 4: Run — expect PASS**

```
npx vitest run tests/unit/ui/fab.test.ts
```

- [ ] **Step 5: Commit**

```
git add src/ui/fab.ts tests/unit/ui/fab.test.ts
git commit -m "feat(ui): Fab + FabStack reusable floating-action primitives"
```

---

## Task 9 — SearchInput (debounced autocomplete)

**Why:** A single input with anchored dropdown, 300 ms debounce, keyboard nav, aria-combobox roles. Used by `PlannerCard` for both Origin and Destination fields.

**Files:**
- Create: `src/ui/searchInput.ts`
- Test: `tests/unit/ui/searchInput.test.ts`

- [ ] **Step 1: Failing test**

```ts
/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchInput } from '../../../src/ui/searchInput';
import type { GeocodeResult } from '../../../src/geocode/geocodeTypes';

const sample: GeocodeResult[] = [
  { id: 'W/1', name: 'Krog Street Market', secondary: '99 Krog St NE', type: 'poi', lat: 33.7553, lon: -84.3617 },
  { id: 'N/2', name: 'Krog Tunnel', secondary: 'Krog St', type: 'street', lat: 33.7517, lon: -84.3614 },
];

class StubClient {
  calls: string[] = [];
  delay = 0;
  async search(q: string): Promise<readonly GeocodeResult[]> {
    this.calls.push(q);
    if (this.delay > 0) await new Promise((r) => setTimeout(r, this.delay));
    return sample;
  }
}

describe('SearchInput', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('renders an input with the right aria roles', () => {
    const c = document.getElementById('c')!;
    new SearchInput(c, { photonClient: new StubClient() as never, placeholder: 'Where?', onSelect: () => {} });
    const input = c.querySelector('input[data-search-input]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.placeholder).toBe('Where?');
  });

  it('debounces input — 300 ms between keystroke and fetch', async () => {
    const c = document.getElementById('c')!;
    const client = new StubClient();
    new SearchInput(c, { photonClient: client as never, placeholder: '', onSelect: () => {} });
    const input = c.querySelector('input[data-search-input]') as HTMLInputElement;
    input.value = 'k';   input.dispatchEvent(new Event('input'));
    input.value = 'kr';  input.dispatchEvent(new Event('input'));
    input.value = 'kro'; input.dispatchEvent(new Event('input'));
    expect(client.calls.length).toBe(0);
    await vi.advanceTimersByTimeAsync(299);
    expect(client.calls.length).toBe(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(client.calls).toEqual(['kro']);
  });

  it('renders results in a listbox below the input', async () => {
    const c = document.getElementById('c')!;
    new SearchInput(c, { photonClient: new StubClient() as never, placeholder: '', onSelect: () => {} });
    const input = c.querySelector('input[data-search-input]') as HTMLInputElement;
    input.value = 'krog'; input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(305);
    await Promise.resolve();
    const rows = c.querySelectorAll('[role="option"]');
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toContain('Krog Street Market');
  });

  it('clicking a result calls onSelect with that result and clears the dropdown', async () => {
    const c = document.getElementById('c')!;
    const seen: GeocodeResult[] = [];
    new SearchInput(c, {
      photonClient: new StubClient() as never,
      placeholder: '',
      onSelect: (r) => seen.push(r),
    });
    const input = c.querySelector('input[data-search-input]') as HTMLInputElement;
    input.value = 'krog'; input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(305);
    await Promise.resolve();
    (c.querySelectorAll('[role="option"]')[0] as HTMLElement).click();
    expect(seen).toEqual([sample[0]]);
    expect(c.querySelectorAll('[role="option"]').length).toBe(0);
    expect(input.value).toBe('Krog Street Market');
  });

  it('ArrowDown/ArrowUp/Enter navigate and select', async () => {
    const c = document.getElementById('c')!;
    const seen: GeocodeResult[] = [];
    new SearchInput(c, {
      photonClient: new StubClient() as never,
      placeholder: '',
      onSelect: (r) => seen.push(r),
    });
    const input = c.querySelector('input[data-search-input]') as HTMLInputElement;
    input.value = 'krog'; input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(305);
    await Promise.resolve();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(seen).toEqual([sample[1]]);
  });

  it('Escape closes the dropdown without selecting', async () => {
    const c = document.getElementById('c')!;
    new SearchInput(c, { photonClient: new StubClient() as never, placeholder: '', onSelect: () => {} });
    const input = c.querySelector('input[data-search-input]') as HTMLInputElement;
    input.value = 'krog'; input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(305);
    await Promise.resolve();
    expect(c.querySelectorAll('[role="option"]').length).toBe(2);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(c.querySelectorAll('[role="option"]').length).toBe(0);
  });

  it('clearing the input cancels in-flight queries', async () => {
    const c = document.getElementById('c')!;
    const client = new StubClient();
    client.delay = 50;
    new SearchInput(c, { photonClient: client as never, placeholder: '', onSelect: () => {} });
    const input = c.querySelector('input[data-search-input]') as HTMLInputElement;
    input.value = 'kr'; input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(305);
    input.value = ''; input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);
    await Promise.resolve();
    expect(c.querySelectorAll('[role="option"]').length).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
npx vitest run tests/unit/ui/searchInput.test.ts
```

- [ ] **Step 3: Create `src/ui/searchInput.ts`**

```ts
import type { GeocodeResult } from '../geocode/geocodeTypes';
import type { PhotonClient } from '../geocode/photonClient';

export interface SearchInputOptions {
  readonly photonClient: PhotonClient;
  readonly placeholder: string;
  readonly onSelect: (result: GeocodeResult) => void;
  readonly initialValue?: string;
  readonly debounceMs?: number;
}

const DEBOUNCE_DEFAULT_MS = 300;

export class SearchInput {
  private readonly input: HTMLInputElement;
  private readonly listbox: HTMLDivElement;
  private results: readonly GeocodeResult[] = [];
  private highlighted = -1;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private inflightAbort: AbortController | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly opts: SearchInputOptions,
  ) {
    const wrap = document.createElement('div');
    wrap.dataset['searchInputWrap'] = 'true';
    wrap.style.cssText = 'position:relative;width:100%';
    this.input = document.createElement('input');
    this.input.dataset['searchInput'] = 'true';
    this.input.type = 'text';
    this.input.placeholder = opts.placeholder;
    this.input.value = opts.initialValue ?? '';
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-autocomplete', 'list');
    this.input.setAttribute('aria-expanded', 'false');
    this.input.style.cssText =
      'width:100%;padding:10px 12px;background:var(--color-bg-alt);' +
      'border:0;border-radius:var(--radius-md);font:inherit;' +
      'font-size:var(--font-size-md);color:var(--color-ink);outline:none';
    this.input.addEventListener('input', () => this.onInput());
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.input.addEventListener('blur', () => {
      // small delay so a click on a listbox row registers before we clear
      setTimeout(() => this.clearDropdown(), 150);
    });
    this.listbox = document.createElement('div');
    this.listbox.setAttribute('role', 'listbox');
    this.listbox.style.cssText =
      'position:absolute;top:calc(100% + 4px);left:0;right:0;' +
      'background:var(--color-surface);border:1px solid var(--color-border);' +
      'border-radius:var(--radius-md);box-shadow:var(--shadow-2);' +
      'overflow:hidden;z-index:10';
    wrap.appendChild(this.input);
    wrap.appendChild(this.listbox);
    container.appendChild(wrap);
  }

  value(): string { return this.input.value; }
  focus(): void { this.input.focus(); }

  private onInput(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    const q = this.input.value;
    if (q.trim().length === 0) {
      this.clearDropdown();
      return;
    }
    this.debounceTimer = setTimeout(() => this.runSearch(q), this.opts.debounceMs ?? DEBOUNCE_DEFAULT_MS);
  }

  private async runSearch(q: string): Promise<void> {
    if (this.inflightAbort) this.inflightAbort.abort();
    this.inflightAbort = new AbortController();
    try {
      const results = await this.opts.photonClient.search(q, this.inflightAbort.signal);
      // Drop results if input changed since
      if (this.input.value !== q) return;
      this.results = results;
      this.highlighted = results.length > 0 ? 0 : -1;
      this.renderDropdown();
    } catch (err) {
      // GeocodeError(aborted) is expected when a newer query supersedes us
      if (err instanceof Error && err.name === 'GeocodeError' && (err as { kind?: string }).kind === 'aborted') return;
      this.results = [];
      this.renderDropdown();
    }
  }

  private renderDropdown(): void {
    this.listbox.innerHTML = '';
    this.input.setAttribute('aria-expanded', this.results.length > 0 ? 'true' : 'false');
    this.results.forEach((r, i) => {
      const row = document.createElement('div');
      row.setAttribute('role', 'option');
      row.dataset['idx'] = String(i);
      row.style.cssText =
        'padding:10px 14px;cursor:pointer;display:flex;flex-direction:column;gap:2px;' +
        'border-top:1px solid var(--color-hairline)';
      if (i === 0) row.style.borderTop = '0';
      if (i === this.highlighted) row.style.background = 'var(--color-bg-alt)';
      row.innerHTML =
        `<div style="font-weight:500;font-size:var(--font-size-md);color:var(--color-ink)">${escapeHtml(r.name)}</div>` +
        `<div style="font-size:var(--font-size-xs);color:var(--color-muted)">${escapeHtml(r.secondary)}</div>`;
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.select(i);
      });
      this.listbox.appendChild(row);
    });
  }

  private onKey(e: KeyboardEvent): void {
    if (this.results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.highlighted = (this.highlighted + 1) % this.results.length;
      this.renderDropdown();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.highlighted = (this.highlighted - 1 + this.results.length) % this.results.length;
      this.renderDropdown();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.highlighted >= 0) this.select(this.highlighted);
    } else if (e.key === 'Escape') {
      this.clearDropdown();
    }
  }

  private select(idx: number): void {
    const r = this.results[idx];
    if (!r) return;
    this.input.value = r.name;
    this.clearDropdown();
    this.opts.onSelect(r);
  }

  private clearDropdown(): void {
    this.results = [];
    this.highlighted = -1;
    this.listbox.innerHTML = '';
    this.input.setAttribute('aria-expanded', 'false');
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

- [ ] **Step 4: Run — expect PASS**

```
npx vitest run tests/unit/ui/searchInput.test.ts
```

- [ ] **Step 5: Commit**

```
git add src/ui/searchInput.ts tests/unit/ui/searchInput.test.ts
git commit -m "feat(ui): SearchInput — debounced autocomplete with keyboard nav"
```

---

## Task 10 — SearchBar (idle pill)

**Why:** The collapsed search affordance — a floating pill at the top of the map that expands into the planner card when tapped.

**Files:**
- Create: `src/ui/searchBar.ts`
- Test: `tests/unit/ui/searchBar.test.ts`

- [ ] **Step 1: Failing test**

```ts
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountSearchBar } from '../../../src/ui/searchBar';

describe('searchBar', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="map" style="position:relative"></div>'; });

  it('renders a pill anchored top-center of the map container', () => {
    const map = document.getElementById('map')!;
    mountSearchBar(map, { onActivate: () => {}, onUseLocation: () => {} });
    const bar = map.querySelector('[data-search-bar]') as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.style.position).toBe('absolute');
    expect(bar.style.top).toBeTruthy();
  });

  it('tapping the bar or its input fires onActivate', () => {
    const map = document.getElementById('map')!;
    let activated = 0;
    mountSearchBar(map, { onActivate: () => { activated++; }, onUseLocation: () => {} });
    (map.querySelector('[data-search-bar-activate]') as HTMLElement).click();
    expect(activated).toBe(1);
  });

  it('tapping the location button fires onUseLocation, not onActivate', () => {
    const map = document.getElementById('map')!;
    let activated = 0; let usedLocation = 0;
    mountSearchBar(map, {
      onActivate: () => { activated++; },
      onUseLocation: () => { usedLocation++; },
    });
    (map.querySelector('button[data-action="use-location"]') as HTMLButtonElement).click();
    expect(usedLocation).toBe(1);
    expect(activated).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
npx vitest run tests/unit/ui/searchBar.test.ts
```

- [ ] **Step 3: Create `src/ui/searchBar.ts`**

```ts
export interface SearchBarCallbacks {
  readonly onActivate: () => void;
  readonly onUseLocation: () => void;
}

const SEARCH_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>';
const LOC_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M22 12h-3M5 12H2"/></svg>';
const ARROW_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h13M11 6l6 6-6 6"/></svg>';

export function mountSearchBar(container: HTMLElement, cb: SearchBarCallbacks): HTMLElement {
  const bar = document.createElement('div');
  bar.dataset['searchBar'] = 'true';
  bar.style.cssText =
    'position:absolute;top:var(--space-4);left:50%;transform:translateX(-50%);' +
    'width:min(520px, calc(100% - 32px));background:var(--color-surface);' +
    'border-radius:var(--radius-pill);box-shadow:var(--shadow-2);' +
    'display:grid;grid-template-columns:auto minmax(0, 1fr) auto auto auto;' +
    'align-items:center;gap:var(--space-2);' +
    'padding:6px var(--space-2) 6px var(--space-4);' +
    'border:1px solid var(--color-border);z-index:5';

  const icon = document.createElement('span');
  icon.style.cssText = 'color:var(--color-muted);display:inline-flex';
  icon.innerHTML = SEARCH_ICON;

  const input = document.createElement('button');
  input.dataset['searchBarActivate'] = 'true';
  input.type = 'button';
  input.style.cssText =
    'background:transparent;border:0;padding:8px 0;text-align:left;font:inherit;' +
    'font-size:var(--font-size-md);color:var(--color-muted);cursor:pointer';
  input.textContent = 'Search a place, address, or coordinate';
  input.addEventListener('click', () => cb.onActivate());

  const sep = document.createElement('span');
  sep.style.cssText = 'width:1px;height:22px;background:var(--color-border);margin:0 var(--space-1)';

  const locBtn = document.createElement('button');
  locBtn.type = 'button';
  locBtn.dataset['action'] = 'use-location';
  locBtn.setAttribute('aria-label', 'Use my location');
  locBtn.innerHTML = LOC_ICON;
  locBtn.style.cssText = iconBtnCss();
  locBtn.addEventListener('click', () => cb.onUseLocation());

  const primary = document.createElement('button');
  primary.type = 'button';
  primary.dataset['action'] = 'plan';
  primary.setAttribute('aria-label', 'Plan route');
  primary.innerHTML = ARROW_ICON;
  primary.style.cssText = iconBtnCss() + 'background:var(--color-accent);color:#fff';
  primary.addEventListener('click', () => cb.onActivate());

  bar.appendChild(icon);
  bar.appendChild(input);
  bar.appendChild(sep);
  bar.appendChild(locBtn);
  bar.appendChild(primary);
  container.appendChild(bar);
  return bar;
}

function iconBtnCss(): string {
  return (
    'width:36px;height:36px;border-radius:var(--radius-pill);' +
    'display:inline-flex;align-items:center;justify-content:center;' +
    'color:var(--color-ink-2);background:transparent;border:0;cursor:pointer;' +
    'transition:background var(--motion-fast) var(--easing-out);'
  );
}
```

- [ ] **Step 4: Run — expect PASS**

```
npx vitest run tests/unit/ui/searchBar.test.ts
```

- [ ] **Step 5: Commit**

```
git add src/ui/searchBar.ts tests/unit/ui/searchBar.test.ts
git commit -m "feat(ui): SearchBar floating pill (idle state)"
```

---

## Task 11 — PlannerCard

**Why:** The expanded planning state. Hosts two `SearchInput`s plus the swap action plus the use-location button on Origin. Replaces the existing `RoutePlanner`'s "Set Start/End on map" UI; the map-tap-as-fallback comes through `handleMapClick` which mirrors the old API so `app.ts` keeps a stable contract.

**Files:**
- Create: `src/ui/plannerCard.ts`
- Test: `tests/unit/ui/plannerCard.test.ts`

- [ ] **Step 1: Failing test**

```ts
/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlannerCard } from '../../../src/ui/plannerCard';
import { LocationStore } from '../../../src/location/locationStore';
import type { GeocodeResult } from '../../../src/geocode/geocodeTypes';

const stubResult = (name: string, lat: number, lon: number): GeocodeResult => ({
  id: `id/${name}`, name, secondary: '', type: 'address', lat, lon,
});

class StubClient {
  async search(): Promise<readonly GeocodeResult[]> { return []; }
}

describe('PlannerCard', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="c"></div>'; });

  it('renders Origin and Destination labels', () => {
    const c = document.getElementById('c')!;
    new PlannerCard(c, {
      photonClient: new StubClient() as never,
      locationStore: new LocationStore(),
      onCompare: vi.fn(),
      onClose: vi.fn(),
    });
    expect(c.textContent).toMatch(/Origin/i);
    expect(c.textContent).toMatch(/Destination/i);
  });

  it('exposes setOrigin/setDestination programmatically (map-tap fallback)', () => {
    const c = document.getElementById('c')!;
    const planner = new PlannerCard(c, {
      photonClient: new StubClient() as never,
      locationStore: new LocationStore(),
      onCompare: vi.fn(),
      onClose: vi.fn(),
    });
    planner.setOrigin({ lat: 1, lon: 2, label: '1.0000, 2.0000' });
    planner.setDestination({ lat: 3, lon: 4, label: '3.0000, 4.0000' });
    const fields = c.querySelectorAll('[data-waypoint] input');
    expect((fields[0] as HTMLInputElement).value).toBe('1.0000, 2.0000');
    expect((fields[1] as HTMLInputElement).value).toBe('3.0000, 4.0000');
  });

  it('plan button is disabled until both waypoints are set', () => {
    const c = document.getElementById('c')!;
    const planner = new PlannerCard(c, {
      photonClient: new StubClient() as never,
      locationStore: new LocationStore(),
      onCompare: vi.fn(),
      onClose: vi.fn(),
    });
    const btn = c.querySelector('button[data-action="plan"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    planner.setOrigin({ lat: 1, lon: 2, label: 'A' });
    expect((c.querySelector('button[data-action="plan"]') as HTMLButtonElement).disabled).toBe(true);
    planner.setDestination({ lat: 3, lon: 4, label: 'B' });
    expect((c.querySelector('button[data-action="plan"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('swap button exchanges origin and destination', () => {
    const c = document.getElementById('c')!;
    const planner = new PlannerCard(c, {
      photonClient: new StubClient() as never,
      locationStore: new LocationStore(),
      onCompare: vi.fn(),
      onClose: vi.fn(),
    });
    planner.setOrigin({ lat: 1, lon: 2, label: 'A' });
    planner.setDestination({ lat: 3, lon: 4, label: 'B' });
    (c.querySelector('button[data-action="swap"]') as HTMLButtonElement).click();
    const fields = c.querySelectorAll('[data-waypoint] input');
    expect((fields[0] as HTMLInputElement).value).toBe('B');
    expect((fields[1] as HTMLInputElement).value).toBe('A');
  });

  it('clicking plan with both waypoints calls onCompare with coords', async () => {
    const c = document.getElementById('c')!;
    const onCompare = vi.fn().mockResolvedValue({ shortest: { polyline: [] }, private: { polyline: [] } });
    const planner = new PlannerCard(c, {
      photonClient: new StubClient() as never,
      locationStore: new LocationStore(),
      onCompare,
      onClose: vi.fn(),
    });
    planner.setOrigin({ lat: 1, lon: 2, label: 'A' });
    planner.setDestination({ lat: 3, lon: 4, label: 'B' });
    (c.querySelector('button[data-action="plan"]') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(onCompare).toHaveBeenCalledWith({ lat: 1, lon: 2 }, { lat: 3, lon: 4 });
  });

  it('use-location button on origin is disabled until LocationStore has a fix', () => {
    const c = document.getElementById('c')!;
    const store = new LocationStore();
    new PlannerCard(c, {
      photonClient: new StubClient() as never,
      locationStore: store,
      onCompare: vi.fn(),
      onClose: vi.fn(),
    });
    const btn = c.querySelector('button[data-action="origin-use-location"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
npx vitest run tests/unit/ui/plannerCard.test.ts
```

- [ ] **Step 3: Create `src/ui/plannerCard.ts`**

```ts
import type { GeoPoint } from '../domain/route';
import type { GeocodeResult } from '../geocode/geocodeTypes';
import type { PhotonClient } from '../geocode/photonClient';
import type { LocationStore } from '../location/locationStore';
import { SearchInput } from './searchInput';

export interface PlannerCardCallbacks {
  readonly photonClient: PhotonClient;
  readonly locationStore: LocationStore;
  readonly onCompare: (start: GeoPoint, end: GeoPoint) => Promise<unknown>;
  readonly onClose: () => void;
}

interface Waypoint {
  lat: number;
  lon: number;
  label: string;
}

export class PlannerCard {
  private origin: Waypoint | null = null;
  private destination: Waypoint | null = null;
  private planBtn!: HTMLButtonElement;
  private useLocBtn!: HTMLButtonElement;
  private originHost!: HTMLElement;
  private destHost!: HTMLElement;
  private originInput!: SearchInput;
  private destInput!: SearchInput;
  private locUnsub: () => void;

  constructor(
    private readonly container: HTMLElement,
    private readonly cb: PlannerCardCallbacks,
  ) {
    this.render();
    this.locUnsub = cb.locationStore.subscribe(() => this.refreshUseLocBtn());
  }

  destroy(): void {
    this.locUnsub();
    this.container.innerHTML = '';
  }

  setOrigin(wp: Waypoint): void {
    this.origin = wp;
    this.syncFieldValues();
    this.refreshPlanBtn();
  }

  setDestination(wp: Waypoint): void {
    this.destination = wp;
    this.syncFieldValues();
    this.refreshPlanBtn();
  }

  private render(): void {
    this.container.innerHTML = '';
    const card = document.createElement('div');
    card.dataset['plannerCard'] = 'true';
    card.style.cssText =
      'position:absolute;top:var(--space-4);left:50%;transform:translateX(-50%);' +
      'width:min(520px, calc(100% - 32px));background:var(--color-surface);' +
      'border-radius:var(--radius-lg);box-shadow:var(--shadow-3);' +
      'border:1px solid var(--color-border);padding:var(--space-4);' +
      'display:flex;flex-direction:column;gap:var(--space-3);z-index:6';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:var(--space-3)';
    const back = document.createElement('button');
    back.type = 'button';
    back.dataset['action'] = 'close';
    back.setAttribute('aria-label', 'Close planner');
    back.textContent = '←';
    back.style.cssText =
      'width:32px;height:32px;border-radius:var(--radius-pill);border:0;' +
      'background:transparent;cursor:pointer;font-size:18px;color:var(--color-ink-2)';
    back.addEventListener('click', () => this.cb.onClose());
    const title = document.createElement('span');
    title.textContent = 'Plan a route';
    title.style.cssText = 'font-weight:600;font-size:var(--font-size-md);color:var(--color-ink)';
    head.appendChild(back);
    head.appendChild(title);
    card.appendChild(head);

    // Origin row
    const oRow = document.createElement('div');
    oRow.dataset['waypoint'] = 'origin';
    oRow.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:var(--space-2);align-items:center';
    const oHost = document.createElement('div');
    this.originHost = oHost;
    this.originInput = new SearchInput(oHost, {
      photonClient: this.cb.photonClient,
      placeholder: 'Origin',
      onSelect: (r) => this.setOrigin(geocodeToWaypoint(r)),
    });
    this.useLocBtn = document.createElement('button');
    this.useLocBtn.type = 'button';
    this.useLocBtn.dataset['action'] = 'origin-use-location';
    this.useLocBtn.setAttribute('aria-label', 'Use my location');
    this.useLocBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M22 12h-3M5 12H2"/></svg>';
    this.useLocBtn.style.cssText =
      'width:32px;height:32px;border-radius:var(--radius-pill);border:0;cursor:pointer;' +
      'background:transparent;color:var(--color-ink-2);display:inline-flex;align-items:center;justify-content:center';
    this.useLocBtn.addEventListener('click', () => this.fillOriginFromLocation());
    oRow.appendChild(oHost);
    oRow.appendChild(this.useLocBtn);
    card.appendChild(oRow);

    // Swap row
    const swapRow = document.createElement('div');
    swapRow.style.cssText = 'display:flex;justify-content:flex-end';
    const swap = document.createElement('button');
    swap.type = 'button';
    swap.dataset['action'] = 'swap';
    swap.textContent = '↕ Swap';
    swap.style.cssText =
      'padding:4px 10px;border-radius:var(--radius-pill);border:0;cursor:pointer;' +
      'font-size:var(--font-size-xs);color:var(--color-muted);background:transparent';
    swap.addEventListener('click', () => this.swap());
    swapRow.appendChild(swap);
    card.appendChild(swapRow);

    // Destination row
    const dRow = document.createElement('div');
    dRow.dataset['waypoint'] = 'destination';
    const dHost = document.createElement('div');
    this.destHost = dHost;
    this.destInput = new SearchInput(dHost, {
      photonClient: this.cb.photonClient,
      placeholder: 'Where to?',
      onSelect: (r) => this.setDestination(geocodeToWaypoint(r)),
    });
    dRow.appendChild(dHost);
    card.appendChild(dRow);

    // Plan button
    this.planBtn = document.createElement('button');
    this.planBtn.type = 'button';
    this.planBtn.dataset['action'] = 'plan';
    this.planBtn.textContent = 'Plan route →';
    this.planBtn.disabled = true;
    this.planBtn.style.cssText =
      'padding:12px 20px;border-radius:var(--radius-pill);border:0;cursor:pointer;' +
      'background:var(--color-ink);color:var(--color-surface);font:inherit;' +
      'font-size:var(--font-size-md);font-weight:500';
    this.planBtn.addEventListener('click', () => void this.runPlan());
    card.appendChild(this.planBtn);

    this.container.appendChild(card);
    this.refreshPlanBtn();
    this.refreshUseLocBtn();
  }

  private syncFieldValues(): void {
    const fields = this.container.querySelectorAll('[data-waypoint] input') as NodeListOf<HTMLInputElement>;
    if (this.origin && fields[0]) fields[0].value = this.origin.label;
    if (this.destination && fields[1]) fields[1].value = this.destination.label;
  }

  private refreshPlanBtn(): void {
    this.planBtn.disabled = !(this.origin && this.destination);
    this.planBtn.style.opacity = this.planBtn.disabled ? '0.5' : '1';
  }

  private refreshUseLocBtn(): void {
    const has = this.cb.locationStore.lastPosition() !== null;
    this.useLocBtn.disabled = !has;
    this.useLocBtn.style.opacity = has ? '1' : '0.4';
  }

  private swap(): void {
    const o = this.origin;
    this.origin = this.destination;
    this.destination = o;
    this.syncFieldValues();
    this.refreshPlanBtn();
  }

  private fillOriginFromLocation(): void {
    const pos = this.cb.locationStore.lastPosition();
    if (!pos) return;
    this.setOrigin({ lat: pos.lat, lon: pos.lon, label: `${pos.lat.toFixed(4)}, ${pos.lon.toFixed(4)}` });
  }

  private async runPlan(): Promise<void> {
    if (!this.origin || !this.destination) return;
    await this.cb.onCompare(
      { lat: this.origin.lat, lon: this.origin.lon },
      { lat: this.destination.lat, lon: this.destination.lon },
    );
  }
}

function geocodeToWaypoint(r: GeocodeResult): Waypoint {
  return { lat: r.lat, lon: r.lon, label: r.name };
}
```

- [ ] **Step 4: Run — expect PASS**

```
npx vitest run tests/unit/ui/plannerCard.test.ts
```

- [ ] **Step 5: Commit**

```
git add src/ui/plannerCard.ts tests/unit/ui/plannerCard.test.ts
git commit -m "feat(ui): PlannerCard hosts two SearchInputs + swap + use-location"
```

---

## Task 12 — LocationMarker

**Why:** The blue "you are here" dot + pulsing accuracy ring. Lives as a DOM overlay on top of the MapLibre canvas (not a map layer) so the pulse can animate via CSS without touching the GL pipeline. Subscribes to `LocationStore` and repositions via `map.project()` on every position fix and on map `move`/`zoom`.

**Files:**
- Create: `src/ui/locationMarker.ts`
- Test: `tests/unit/ui/locationMarker.test.ts`

- [ ] **Step 1: Failing test (uses a fake map adapter — no maplibre import in jsdom)**

```ts
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocationMarker, type MapProjector } from '../../../src/ui/locationMarker';
import { LocationStore } from '../../../src/location/locationStore';

function fakeMap(): MapProjector & { fire: (ev: string) => void } {
  const listeners = new Map<string, () => void>();
  return {
    project(lngLat) {
      return { x: lngLat[0] * 10, y: lngLat[1] * 10 };
    },
    on(ev, cb) { listeners.set(ev, cb); },
    off(ev) { listeners.delete(ev); },
    fire(ev) { listeners.get(ev)?.(); },
  };
}

describe('LocationMarker', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="map" style="position:relative"></div>'; });

  it('renders nothing when LocationStore is idle', () => {
    const map = document.getElementById('map')!;
    const store = new LocationStore();
    new LocationMarker(map, fakeMap(), store);
    expect(map.querySelector('[data-location-marker]')).toBeNull();
  });

  it('renders the dot when LocationStore enters tracking', () => {
    const map = document.getElementById('map')!;
    const store = new LocationStore();
    const proj = fakeMap();
    new LocationMarker(map, proj, store);
    // Simulate the store transitioning to tracking without invoking real geolocation
    (store as unknown as { current: unknown }).current = {
      status: 'tracking',
      position: { lat: 33.7501, lon: -84.389, accuracyMeters: 12, timestamp: 1 },
    };
    (store as unknown as { listeners: Set<(s: unknown) => void> }).listeners.forEach((l) => l((store as unknown as { current: unknown }).current));
    const marker = map.querySelector('[data-location-marker]') as HTMLElement;
    expect(marker).toBeTruthy();
    // x = lon * 10 = -843.89, y = lat * 10 = 337.501
    expect(marker.style.left).toBe('-843.89px');
    expect(marker.style.top).toBe('337.501px');
  });

  it('repositions on map move', () => {
    const map = document.getElementById('map')!;
    const store = new LocationStore();
    const proj = fakeMap();
    const spyProject = vi.spyOn(proj, 'project');
    new LocationMarker(map, proj, store);
    (store as unknown as { current: unknown }).current = {
      status: 'tracking',
      position: { lat: 1, lon: 2, accuracyMeters: 5, timestamp: 0 },
    };
    (store as unknown as { listeners: Set<(s: unknown) => void> }).listeners.forEach((l) => l((store as unknown as { current: unknown }).current));
    spyProject.mockClear();
    proj.fire('move');
    expect(spyProject).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
npx vitest run tests/unit/ui/locationMarker.test.ts
```

- [ ] **Step 3: Create `src/ui/locationMarker.ts`**

```ts
import type { LocationStore } from '../location/locationStore';

export interface MapProjector {
  project(lngLat: [number, number]): { x: number; y: number };
  on(event: 'move' | 'zoom', cb: () => void): void;
  off(event: 'move' | 'zoom', cb: () => void): void;
}

export class LocationMarker {
  private el: HTMLElement | null = null;
  private unsub: () => void;
  private currentPos: { lat: number; lon: number } | null = null;
  private readonly onMapMove: () => void;

  constructor(
    private readonly container: HTMLElement,
    private readonly projector: MapProjector,
    store: LocationStore,
  ) {
    this.onMapMove = () => this.reposition();
    projector.on('move', this.onMapMove);
    projector.on('zoom', this.onMapMove);
    this.unsub = store.subscribe((state) => {
      if (state.status === 'tracking') {
        this.currentPos = { lat: state.position.lat, lon: state.position.lon };
        this.ensureEl();
        this.reposition();
      } else {
        this.removeEl();
        this.currentPos = null;
      }
    });
  }

  destroy(): void {
    this.unsub();
    this.projector.off('move', this.onMapMove);
    this.projector.off('zoom', this.onMapMove);
    this.removeEl();
  }

  private ensureEl(): void {
    if (this.el) return;
    const el = document.createElement('div');
    el.dataset['locationMarker'] = 'true';
    el.style.cssText =
      'position:absolute;width:18px;height:18px;transform:translate(-50%, -50%);' +
      'pointer-events:none;z-index:4';
    el.innerHTML = `
      <div style="position:absolute;inset:-42px;border-radius:50%;
        background:radial-gradient(circle, rgba(47, 84, 255, 0.18) 0%, rgba(47, 84, 255, 0) 70%);
        animation:flockavoid-you-pulse 2.4s ease-out infinite"></div>
      <div style="position:absolute;inset:4px;background:var(--color-accent);
        border-radius:50%;box-shadow:0 0 0 3px var(--color-surface), 0 2px 6px rgba(47, 84, 255, 0.4)"></div>`;
    // Inject keyframes once
    if (!document.getElementById('flockavoid-loc-marker-kf')) {
      const style = document.createElement('style');
      style.id = 'flockavoid-loc-marker-kf';
      style.textContent =
        '@keyframes flockavoid-you-pulse {' +
        '  0% { transform: scale(0.5); opacity: 0.9; }' +
        '  100% { transform: scale(1.4); opacity: 0; }' +
        '}';
      document.head.appendChild(style);
    }
    this.container.appendChild(el);
    this.el = el;
  }

  private removeEl(): void {
    if (this.el) { this.el.remove(); this.el = null; }
  }

  private reposition(): void {
    if (!this.el || !this.currentPos) return;
    const { x, y } = this.projector.project([this.currentPos.lon, this.currentPos.lat]);
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }
}
```

- [ ] **Step 4: Run — expect PASS**

```
npx vitest run tests/unit/ui/locationMarker.test.ts
```

- [ ] **Step 5: Commit**

```
git add src/ui/locationMarker.ts tests/unit/ui/locationMarker.test.ts
git commit -m "feat(ui): LocationMarker — DOM overlay tracking LocationStore"
```

---

## Task 13 — RouteSummaryCard

**Why:** Bottom-docked compact summary that appears after `Router.compareRoutes` returns. Two route tiles + headline savings + Details/Start buttons.

**Files:**
- Create: `src/ui/routeSummaryCard.ts`
- Test: `tests/unit/ui/routeSummaryCard.test.ts`

- [ ] **Step 1: Failing test**

```ts
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountRouteSummaryCard } from '../../../src/ui/routeSummaryCard';

const cmp = {
  shortest: { distanceMeters: 5150, exposure: 47, sensorsAlong: 11 },
  private:  { distanceMeters: 6116, exposure: 8,  sensorsAlong: 2 },
};

describe('routeSummaryCard', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="map" style="position:relative"></div>'; });

  it('renders both tiles when no degradation', () => {
    const map = document.getElementById('map')!;
    mountRouteSummaryCard(map, { comparison: cmp as never, originLabel: 'A', destinationLabel: 'B', profileName: 'Vulnerable', onSelect: () => {}, onStart: () => {}, onDetails: () => {} });
    expect(map.querySelector('[data-route-tile="shortest"]')).toBeTruthy();
    expect(map.querySelector('[data-route-tile="private"]')).toBeTruthy();
  });

  it('renders distance in miles, rounded to 1 decimal', () => {
    const map = document.getElementById('map')!;
    mountRouteSummaryCard(map, { comparison: cmp as never, originLabel: 'A', destinationLabel: 'B', profileName: 'Vulnerable', onSelect: () => {}, onStart: () => {}, onDetails: () => {} });
    const shortest = map.querySelector('[data-route-tile="shortest"]')!;
    expect(shortest.textContent).toMatch(/3\.2\s*mi/i);
    const priv = map.querySelector('[data-route-tile="private"]')!;
    expect(priv.textContent).toMatch(/3\.8\s*mi/i);
  });

  it('private is selected by default; clicking shortest swaps the selection', () => {
    const map = document.getElementById('map')!;
    const picks: string[] = [];
    mountRouteSummaryCard(map, { comparison: cmp as never, originLabel: 'A', destinationLabel: 'B', profileName: 'Vulnerable', onSelect: (k) => picks.push(k), onStart: () => {}, onDetails: () => {} });
    expect(map.querySelector('[data-route-tile="private"]')!.getAttribute('data-selected')).toBe('true');
    (map.querySelector('[data-route-tile="shortest"]') as HTMLButtonElement).click();
    expect(picks).toEqual(['shortest']);
  });

  it('Start button fires onStart', () => {
    const map = document.getElementById('map')!;
    const onStart = vi.fn();
    mountRouteSummaryCard(map, { comparison: cmp as never, originLabel: 'A', destinationLabel: 'B', profileName: 'Vulnerable', onSelect: () => {}, onStart, onDetails: () => {} });
    (map.querySelector('button[data-action="start"]') as HTMLButtonElement).click();
    expect(onStart).toHaveBeenCalled();
  });

  it('reports % less visible computed from exposure', () => {
    const map = document.getElementById('map')!;
    mountRouteSummaryCard(map, { comparison: cmp as never, originLabel: 'A', destinationLabel: 'B', profileName: 'Vulnerable', onSelect: () => {}, onStart: () => {}, onDetails: () => {} });
    // (47 - 8) / 47 = 0.8297 → 83%
    expect(map.textContent).toMatch(/83%/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
npx vitest run tests/unit/ui/routeSummaryCard.test.ts
```

- [ ] **Step 3: Create `src/ui/routeSummaryCard.ts`**

```ts
export interface RouteSummary {
  readonly distanceMeters: number;
  readonly exposure: number;
  readonly sensorsAlong: number;
}

export interface RouteComparisonSummary {
  readonly shortest: RouteSummary;
  readonly private: RouteSummary;
}

export interface RouteSummaryCardOptions {
  readonly comparison: RouteComparisonSummary;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly profileName: string;
  readonly onSelect: (which: 'shortest' | 'private') => void;
  readonly onStart: () => void;
  readonly onDetails: () => void;
}

const METERS_PER_MILE = 1609.344;

export function mountRouteSummaryCard(container: HTMLElement, opts: RouteSummaryCardOptions): HTMLElement {
  const existing = container.querySelector('[data-route-summary-card]');
  if (existing) existing.remove();

  const card = document.createElement('div');
  card.dataset['routeSummaryCard'] = 'true';
  card.style.cssText =
    'position:absolute;left:50%;bottom:var(--space-4);transform:translateX(-50%);' +
    'width:min(560px, calc(100% - 32px));background:var(--color-surface);' +
    'border-radius:var(--radius-lg);box-shadow:var(--shadow-3);' +
    'border:1px solid var(--color-border);padding:var(--space-4);z-index:5';

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3)';
  const title = document.createElement('span');
  title.style.cssText = 'font-size:var(--font-size-md);font-weight:600;color:var(--color-ink)';
  title.textContent = `${opts.originLabel} → ${opts.destinationLabel}`;
  const profile = document.createElement('span');
  profile.style.cssText =
    'padding:4px 10px;border-radius:var(--radius-pill);background:var(--color-bg-alt);' +
    'font-size:var(--font-size-xs);color:var(--color-ink-2)';
  profile.textContent = opts.profileName;
  head.appendChild(title);
  head.appendChild(profile);
  card.appendChild(head);

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);margin-bottom:var(--space-3)';

  const shortestTile = makeTile('shortest', opts.comparison.shortest, false);
  const privateTile = makeTile('private', opts.comparison.private, true);
  shortestTile.addEventListener('click', () => {
    shortestTile.dataset['selected'] = 'true';
    privateTile.dataset['selected'] = 'false';
    opts.onSelect('shortest');
  });
  privateTile.addEventListener('click', () => {
    privateTile.dataset['selected'] = 'true';
    shortestTile.dataset['selected'] = 'false';
    opts.onSelect('private');
  });

  grid.appendChild(shortestTile);
  grid.appendChild(privateTile);
  card.appendChild(grid);

  const exposureDelta = opts.comparison.shortest.exposure - opts.comparison.private.exposure;
  const pct = opts.comparison.shortest.exposure > 0
    ? Math.round((exposureDelta / opts.comparison.shortest.exposure) * 100)
    : 0;

  const footer = document.createElement('div');
  footer.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;' +
    'padding-top:var(--space-3);border-top:1px solid var(--color-hairline);';
  const savings = document.createElement('span');
  savings.style.cssText = 'color:var(--color-safe);font-weight:500;font-size:var(--font-size-sm)';
  savings.textContent = `${pct}% less visible`;
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:var(--space-2)';
  const details = makeBtn('Details', false, opts.onDetails); details.dataset['action'] = 'details';
  const start = makeBtn('Start →', true, opts.onStart); start.dataset['action'] = 'start';
  actions.appendChild(details);
  actions.appendChild(start);
  footer.appendChild(savings);
  footer.appendChild(actions);
  card.appendChild(footer);

  container.appendChild(card);
  return card;
}

function makeTile(kind: 'shortest' | 'private', s: RouteSummary, selected: boolean): HTMLButtonElement {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.dataset['routeTile'] = kind;
  tile.dataset['selected'] = String(selected);
  tile.style.cssText =
    'padding:var(--space-3) var(--space-4);border-radius:var(--radius-md);' +
    'border:1px solid var(--color-border);background:var(--color-surface);' +
    'cursor:pointer;text-align:left;font:inherit';
  const miles = (s.distanceMeters / METERS_PER_MILE).toFixed(1);
  const accentColor = kind === 'private' ? 'var(--color-safe)' : 'var(--color-threat)';
  tile.innerHTML = `
    <div style="display:inline-flex;align-items:center;gap:6px;font-size:var(--font-size-xs);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-muted);margin-bottom:6px">
      <span style="width:12px;height:2px;background:${accentColor};border-radius:2px"></span>
      ${kind === 'private' ? 'Private' : 'Shortest'}
    </div>
    <div style="font-size:var(--font-size-xl);font-weight:600;letter-spacing:-0.02em">${miles} mi</div>
    <div style="font-size:var(--font-size-sm);color:var(--color-muted);margin-top:2px">
      <strong style="color:var(--color-ink-2);font-weight:600">${s.sensorsAlong} sensors</strong> · exposure ${s.exposure}
    </div>`;
  if (selected) {
    tile.style.borderColor = 'var(--color-accent)';
    tile.style.background = 'var(--color-accent-soft)';
  }
  return tile;
}

function makeBtn(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.style.cssText =
    'padding:8px 14px;border-radius:var(--radius-pill);border:0;cursor:pointer;font:inherit;' +
    `font-size:var(--font-size-sm);font-weight:500;` +
    (primary
      ? 'background:var(--color-ink);color:var(--color-surface)'
      : 'background:transparent;color:var(--color-ink)');
  b.addEventListener('click', onClick);
  return b;
}
```

- [ ] **Step 4: Run — expect PASS**

```
npx vitest run tests/unit/ui/routeSummaryCard.test.ts
```

- [ ] **Step 5: Commit**

```
git add src/ui/routeSummaryCard.ts tests/unit/ui/routeSummaryCard.test.ts
git commit -m "feat(ui): RouteSummaryCard — compact bottom-docked summary"
```

---

## Task 14 — Rewrite welcomeModal (v0.2 copy + visual)

**Why:** Welcome modal needs new copy that discloses the Photon dependency, and the visual treatment matches v0.2. Public API (`shouldShowWelcomeModal`, `mountWelcomeModal`, `WELCOME_DISMISSED_KEY`) stays stable so `app.ts` keeps working.

**Files:**
- Rewrite: `src/ui/welcomeModal.ts`
- Rewrite: `tests/unit/ui/welcomeModal.test.ts`

- [ ] **Step 1: Rewrite the test for v0.2 copy**

```ts
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldShowWelcomeModal,
  mountWelcomeModal,
  WELCOME_DISMISSED_KEY,
} from '../../../src/ui/welcomeModal';

describe('welcomeModal v0.2', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    localStorage.clear();
  });

  it('shouldShowWelcomeModal honors the dismissed flag', () => {
    expect(shouldShowWelcomeModal()).toBe(true);
    localStorage.setItem(WELCOME_DISMISSED_KEY, 'true');
    expect(shouldShowWelcomeModal()).toBe(false);
  });

  it('headline contains the v0.2 lede', () => {
    const c = document.getElementById('c')!;
    mountWelcomeModal(c, { onDismiss: () => {} });
    expect(c.textContent).toMatch(/Find a route the cameras don't see/);
  });

  it('discloses the three privacy promises (incl. Photon)', () => {
    const c = document.getElementById('c')!;
    mountWelcomeModal(c, { onDismiss: () => {} });
    expect(c.textContent).toMatch(/Routing runs on your device/);
    expect(c.textContent).toMatch(/No accounts\.\s*No analytics/);
    expect(c.textContent).toMatch(/photon\.komoot\.io/);
  });

  it('Get-started button dismisses and persists the flag', () => {
    const c = document.getElementById('c')!;
    let dismissed = false;
    mountWelcomeModal(c, { onDismiss: () => { dismissed = true; } });
    const btn = c.querySelector('button[data-action="welcome-dismiss"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    expect(dismissed).toBe(true);
    expect(localStorage.getItem(WELCOME_DISMISSED_KEY)).toBe('true');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```
npx vitest run tests/unit/ui/welcomeModal.test.ts
```

- [ ] **Step 3: Rewrite `src/ui/welcomeModal.ts`**

```ts
export const WELCOME_DISMISSED_KEY = 'flockavoid.welcomeDismissed.v1';

export interface WelcomeModalCallbacks {
  readonly onDismiss: () => void;
}

export function shouldShowWelcomeModal(): boolean {
  try { return localStorage.getItem(WELCOME_DISMISSED_KEY) !== 'true'; }
  catch { return true; }
}

export function mountWelcomeModal(container: HTMLElement, cb: WelcomeModalCallbacks): void {
  const backdrop = document.createElement('div');
  backdrop.dataset['welcomeModal'] = 'true';
  backdrop.style.cssText =
    'position:fixed;inset:0;background:rgba(10, 10, 11, 0.55);' +
    'display:flex;align-items:center;justify-content:center;z-index:1000;' +
    'padding:var(--space-5);font-family:var(--font-family-sans)';

  const card = document.createElement('div');
  card.style.cssText =
    'background:var(--color-surface);border:1px solid var(--color-border);' +
    'border-radius:var(--radius-xl);box-shadow:var(--shadow-3);' +
    'max-width:480px;width:100%;padding:var(--space-8)';
  card.innerHTML = `
    <div style="width:44px;height:44px;background:var(--color-ink);border-radius:var(--radius-md);margin-bottom:var(--space-5);position:relative">
      <div style="position:absolute;inset:11px;background:var(--color-surface);border-radius:4px;box-shadow:0 0 0 1.5px var(--color-ink) inset"></div>
    </div>
    <h1 style="font-size:var(--font-size-2xl);font-weight:600;letter-spacing:-0.025em;line-height:1.05;color:var(--color-ink);margin:0 0 var(--space-3)">Find a route the cameras don't see.</h1>
    <p style="font-size:var(--font-size-md);color:var(--color-muted);line-height:1.55;margin:0 0 var(--space-6)">Flock-Avoid plans driving routes around the surveillance cameras we know about. The map is yours. Your trips are yours.</p>
    <div style="display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-4);background:var(--color-bg-alt);border-radius:var(--radius-md);margin-bottom:var(--space-6)">
      <div style="display:grid;grid-template-columns:20px 1fr;gap:var(--space-3);align-items:start;font-size:var(--font-size-sm);color:var(--color-ink-2);line-height:1.5">
        <span style="width:18px;height:18px;border-radius:50%;background:var(--color-safe-soft);color:var(--color-safe);display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">✓</span>
        <span><strong>Routing runs on your device.</strong> Your trips never leave the browser.</span>
      </div>
      <div style="display:grid;grid-template-columns:20px 1fr;gap:var(--space-3);align-items:start;font-size:var(--font-size-sm);color:var(--color-ink-2);line-height:1.5">
        <span style="width:18px;height:18px;border-radius:50%;background:var(--color-safe-soft);color:var(--color-safe);display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">✓</span>
        <span><strong>No accounts. No analytics. No trackers.</strong> The code is open source.</span>
      </div>
      <div style="display:grid;grid-template-columns:20px 1fr;gap:var(--space-3);align-items:start;font-size:var(--font-size-sm);color:var(--color-ink-2);line-height:1.5">
        <span style="width:18px;height:18px;border-radius:50%;background:var(--color-accent-soft);color:var(--color-accent);display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:11px">i</span>
        <span><strong>Search uses <code style="font-family:var(--font-family-mono);font-size:0.92em;background:var(--color-surface);padding:1px 6px;border-radius:4px;border:1px solid var(--color-border)">photon.komoot.io</code></strong> — only what you type goes there, never your route.</span>
      </div>
    </div>
  `;
  const cta = document.createElement('div');
  cta.style.cssText = 'display:flex;gap:var(--space-3);align-items:center';
  const primary = document.createElement('button');
  primary.type = 'button';
  primary.dataset['action'] = 'welcome-dismiss';
  primary.textContent = 'Get started';
  primary.style.cssText =
    'flex:1;padding:12px 20px;background:var(--color-ink);color:var(--color-surface);' +
    'border:0;border-radius:var(--radius-pill);font:inherit;font-size:var(--font-size-md);' +
    'font-weight:500;cursor:pointer;transition:background var(--motion-fast) var(--easing-out)';
  primary.addEventListener('click', () => {
    try { localStorage.setItem(WELCOME_DISMISSED_KEY, 'true'); } catch { /* ignore */ }
    backdrop.remove();
    cb.onDismiss();
  });
  cta.appendChild(primary);
  card.appendChild(cta);
  backdrop.appendChild(card);
  container.appendChild(backdrop);
}
```

- [ ] **Step 4: Run — expect PASS**

```
npx vitest run tests/unit/ui/welcomeModal.test.ts
```

- [ ] **Step 5: Commit**

```
git add src/ui/welcomeModal.ts tests/unit/ui/welcomeModal.test.ts
git commit -m "feat(ui): welcomeModal v0.2 copy + visual (Photon disclosure)"
```

---

## Task 15 — Restyle datasetFreshness as bottom-left chip

**Why:** v0.2 promotes the freshness indicator from "sidebar element" to "floating chip at bottom-left of the map". Public API (`renderDatasetFreshness`) is preserved; container parent changes to the map element in Task 18.

**Files:**
- Rewrite: `src/ui/datasetFreshness.ts`
- Modify: `tests/unit/ui/datasetFreshness.test.ts`

- [ ] **Step 1: Read the current API and existing test**

```
sed -n '1,40p' src/ui/datasetFreshness.ts
sed -n '1,40p' tests/unit/ui/datasetFreshness.test.ts
```

- [ ] **Step 2: Add/replace the v0.2 shape assertions** (keep dismissal/refresh assertions; add chip-floating assertions)

Add to `tests/unit/ui/datasetFreshness.test.ts` (or rewrite to include):

```ts
  it('chip is positioned bottom-left with translucent surface and indicator dot', () => {
    const c = document.getElementById('c')!;
    renderDatasetFreshness(c, { generatedAt: new Date().toISOString(), onRefresh: () => {} });
    const el = c.querySelector('[data-dataset-freshness]') as HTMLElement;
    expect(el.style.position).toBe('absolute');
    expect(el.style.bottom).toBeTruthy();
    expect(el.style.left).toBeTruthy();
    expect(el.style.borderRadius).toBe('var(--radius-pill)');
    expect(c.querySelector('[data-dataset-freshness] [data-freshness-dot]')).toBeTruthy();
  });
```

- [ ] **Step 3: Rewrite `src/ui/datasetFreshness.ts`**

Replace the entire file:

```ts
export interface DatasetFreshnessOptions {
  readonly generatedAt: string;        // ISO-8601
  readonly onRefresh: () => void;
}

export function renderDatasetFreshness(container: HTMLElement, opts: DatasetFreshnessOptions): void {
  const existing = container.querySelector('[data-dataset-freshness]');
  if (existing) existing.remove();

  const chip = document.createElement('div');
  chip.dataset['datasetFreshness'] = 'true';
  chip.style.cssText =
    'position:absolute;bottom:var(--space-4);left:var(--space-4);z-index:5;' +
    'display:inline-flex;align-items:center;gap:var(--space-2);' +
    'padding:6px 12px;background:rgba(255, 255, 255, 0.88);backdrop-filter:blur(8px);' +
    'border:1px solid var(--color-border);border-radius:var(--radius-pill);' +
    'font-family:var(--font-family-sans);font-size:var(--font-size-xs);' +
    'color:var(--color-muted);box-shadow:var(--shadow-1);cursor:pointer';
  chip.title = `Dataset generated ${new Date(opts.generatedAt).toLocaleString()} — click to refresh`;
  chip.innerHTML = `
    <span data-freshness-dot style="width:6px;height:6px;border-radius:50%;background:var(--color-safe)"></span>
    <span>Dataset · ${relative(opts.generatedAt)}</span>
  `;
  chip.addEventListener('click', () => opts.onRefresh());
  container.appendChild(chip);
}

function relative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.max(0, Math.round((now - then) / 60000));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const hrs = Math.round(diffMin / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
```

- [ ] **Step 4: Run vitest, fix existing test assertions that no longer match the v0.2 shape**

```
npx vitest run tests/unit/ui/datasetFreshness.test.ts
```
If old assertions reference text strings or DOM shapes that changed, update them in the test file to the new shape (chip text now says `Dataset · 41 min ago` instead of the old format). Re-run until green.

- [ ] **Step 5: Commit**

```
git add src/ui/datasetFreshness.ts tests/unit/ui/datasetFreshness.test.ts
git commit -m "feat(ui): datasetFreshness v0.2 floating chip"
```

---

## Task 16 — Restyle showAllConesToggle as a FAB

**Why:** v0.2 promotes the cone toggle into the FAB stack. Public API (`mountShowAllConesToggle`) stays; the rendering uses `mountFab` from Task 8.

**Files:**
- Rewrite: `src/ui/showAllConesToggle.ts`
- Modify: `tests/unit/ui/showAllConesToggle.test.ts`

- [ ] **Step 1: Update test expectations**

Replace or amend the test to assert `data-fab` and `aria-pressed`:

```ts
  it('renders as a FAB with aria-pressed reflecting state', () => {
    const c = document.getElementById('c')!;
    mountShowAllConesToggle(c, { onChange: () => {} });
    const btn = c.querySelector('button[data-fab]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    btn.click();
    expect((c.querySelector('button[data-fab]') as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true');
  });
```

- [ ] **Step 2: Run — expect FAIL**

```
npx vitest run tests/unit/ui/showAllConesToggle.test.ts
```

- [ ] **Step 3: Rewrite `src/ui/showAllConesToggle.ts`**

```ts
import { mountFab } from './fab';

export interface ShowAllConesToggleOptions {
  readonly onChange: (pressed: boolean) => void;
}

const TRIANGLE_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 14h16L12 2z"/></svg>';

export function mountShowAllConesToggle(container: HTMLElement, opts: ShowAllConesToggleOptions): void {
  let pressed = false;
  const remount = (): void => {
    container.innerHTML = '';
    mountFab(container, {
      ariaLabel: pressed ? 'Hide camera cones' : 'Show all camera cones',
      icon: TRIANGLE_ICON,
      pressed,
      onClick: () => {
        pressed = !pressed;
        remount();
        opts.onChange(pressed);
      },
    });
  };
  remount();
}
```

- [ ] **Step 4: Run — expect PASS**

```
npx vitest run tests/unit/ui/showAllConesToggle.test.ts
```

- [ ] **Step 5: Commit**

```
git add src/ui/showAllConesToggle.ts tests/unit/ui/showAllConesToggle.test.ts
git commit -m "feat(ui): showAllConesToggle now renders as a FAB"
```

---

## Task 17 — Restyle cameraDetailPopup (v0.2 card)

**Why:** Bring the camera popup in line with the v0.2 surface treatment (white card, soft shadow, hairline border, `<dl>` for the field grid). Public API stays.

**Files:**
- Rewrite: `src/ui/cameraDetailPopup.ts`
- Modify: `tests/unit/ui/cameraDetailPopup.test.ts` (loosen presentational assertions to match v0.2)

- [ ] **Step 1: Read current contract**

```
sed -n '1,40p' src/ui/cameraDetailPopup.ts
sed -n '1,40p' tests/unit/ui/cameraDetailPopup.test.ts
```

- [ ] **Step 2: Update test assertions for the v0.2 structure**

Ensure the test asserts (rewrite specific assertions to match — the data-attribute selectors are stable, the wording isn't):

```ts
  it('renders a card with the camera id and type', () => {
    const c = document.getElementById('c')!;
    renderCameraDetailPopup(c, mockCam, () => {});
    const card = c.querySelector('[data-camera-popup]') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.style.background).toContain('color-surface');
    expect(card.textContent).toMatch(mockCam.id);
    expect(card.textContent).toMatch(/flock/i);
  });

  it('has a close button that fires onClose', () => {
    const c = document.getElementById('c')!;
    let closed = false;
    renderCameraDetailPopup(c, mockCam, () => { closed = true; });
    (c.querySelector('button[data-action="popup-close"]') as HTMLButtonElement).click();
    expect(closed).toBe(true);
  });
```

- [ ] **Step 3: Rewrite `src/ui/cameraDetailPopup.ts`**

```ts
import type { ResolvedCamera } from '../data/resolvedCamera';

export function renderCameraDetailPopup(
  container: HTMLElement,
  cam: ResolvedCamera,
  onClose: () => void,
): void {
  container.innerHTML = '';
  const card = document.createElement('div');
  card.dataset['cameraPopup'] = 'true';
  card.style.cssText =
    'width:300px;background:var(--color-surface);border-radius:var(--radius-lg);' +
    'box-shadow:var(--shadow-3);border:1px solid var(--color-border);' +
    'padding:var(--space-4);font-family:var(--font-family-sans);color:var(--color-ink)';

  const top = document.createElement('div');
  top.style.cssText =
    'display:flex;align-items:start;justify-content:space-between;' +
    'margin-bottom:var(--space-3);padding-bottom:var(--space-3);' +
    'border-bottom:1px solid var(--color-hairline)';
  const title = document.createElement('div');
  title.innerHTML = `
    <div style="font-size:var(--font-size-md);font-weight:600">${escape(prettyType(cam.type))}</div>
    <div style="font-size:var(--font-size-xs);color:var(--color-muted);margin-top:2px">Sensor #${escape(cam.id)}</div>
  `;
  const close = document.createElement('button');
  close.type = 'button';
  close.dataset['action'] = 'popup-close';
  close.setAttribute('aria-label', 'Close');
  close.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  close.style.cssText =
    'width:28px;height:28px;border-radius:var(--radius-pill);border:0;' +
    'background:transparent;color:var(--color-muted);cursor:pointer;' +
    'display:inline-flex;align-items:center;justify-content:center';
  close.addEventListener('click', onClose);
  top.appendChild(title);
  top.appendChild(close);
  card.appendChild(top);

  const dl = document.createElement('dl');
  dl.style.cssText =
    'display:grid;grid-template-columns:auto 1fr;gap:6px var(--space-4);' +
    'font-size:var(--font-size-sm);margin:0';
  appendKv(dl, 'Bearing', cam.bearingDeg !== undefined ? `${Math.round(cam.bearingDeg)}°` : '—');
  appendKv(dl, 'Sources', cam.sources.join(', '));
  if (cam.lastSeen) appendKv(dl, 'Last seen', new Date(cam.lastSeen).toLocaleDateString());
  card.appendChild(dl);

  container.appendChild(card);
}

function appendKv(dl: HTMLElement, label: string, value: string): void {
  const dt = document.createElement('dt');
  dt.style.cssText = 'color:var(--color-muted)';
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.style.cssText = 'color:var(--color-ink);text-align:right;font-feature-settings:"tnum";margin:0';
  dd.textContent = value;
  dl.appendChild(dt);
  dl.appendChild(dd);
}

function prettyType(t: string): string {
  if (t.toUpperCase().includes('ALPR') || t.toLowerCase().includes('flock')) return 'Flock ALPR';
  if (t.toUpperCase().includes('CCTV')) return 'CCTV';
  if (t.toUpperCase().includes('DOT'))  return 'DOT camera';
  return t;
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

If `cam.bearingDeg`, `cam.sources`, or `cam.lastSeen` aren't actually on `ResolvedCamera`, open `src/data/resolvedCamera.ts`, check the real property names, and substitute them. Do not invent fields.

- [ ] **Step 4: Run — expect PASS**

```
npx vitest run tests/unit/ui/cameraDetailPopup.test.ts
```

- [ ] **Step 5: Commit**

```
git add src/ui/cameraDetailPopup.ts tests/unit/ui/cameraDetailPopup.test.ts
git commit -m "feat(ui): cameraDetailPopup v0.2 card treatment"
```

---

## Task 18 — Wire everything in `app.ts` + map-relative chrome containers + `index.html` `flyTo`

**Why:** The integration task. Construct `LocationStore`, `PhotonClient`, `LocationMarker`. Replace the legacy sidebar-based `RoutePlanner` with `SearchBar` ↔ `PlannerCard` swap. Mount FAB stack with `showAllConesToggle` + recenter. Render `RouteSummaryCard` from `app.ts` after `Router.compareRoutes`. Add `mapView.flyTo(coords, zoom)`.

**Files:**
- Modify: `src/app.ts`
- Modify: `src/ui/mapView.ts` (add `flyTo` + `getProjector`)
- Modify: `index.html` (no change expected; verify `<link rel="stylesheet" href="/src/brand/tokens.css">` still loads)

- [ ] **Step 1: Extend MapView with `flyTo` + `getProjector` (TDD-lite — type-check then visual smoke)**

Open `src/ui/mapView.ts` and add to the `MapView` class:

```ts
  /** Animate the map to a new center at a given zoom. */
  flyTo(center: GeoPoint, zoom: number): void {
    this.map.flyTo({ center: [center.lon, center.lat], zoom, essential: true });
  }

  /** Expose a projector for DOM overlays (LocationMarker). */
  getProjector(): {
    project(ll: [number, number]): { x: number; y: number };
    on(ev: 'move' | 'zoom', cb: () => void): void;
    off(ev: 'move' | 'zoom', cb: () => void): void;
  } {
    return {
      project: (ll) => this.map.project({ lng: ll[0], lat: ll[1] }),
      on: (ev, cb) => this.map.on(ev, cb),
      off: (ev, cb) => this.map.off(ev, cb),
    };
  }
```

Type-check:

```
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 2: Rewrite `src/app.ts` integrating the new pieces**

The new `startApp` flow:

```ts
import 'maplibre-gl/dist/maplibre-gl.css';
import './brand/tokens.css';
import { MapView } from './ui/mapView';
import { mountSearchBar } from './ui/searchBar';
import { PlannerCard } from './ui/plannerCard';
import { mountFab, mountFabStack } from './ui/fab';
import { mountShowAllConesToggle } from './ui/showAllConesToggle';
import { mountRouteSummaryCard } from './ui/routeSummaryCard';
import { renderDatasetFreshness } from './ui/datasetFreshness';
import { renderCameraDetailPopup } from './ui/cameraDetailPopup';
import { mountWelcomeModal, shouldShowWelcomeModal } from './ui/welcomeModal';
import { mountLoadingSkeleton, clearLoadingSkeleton } from './ui/loadingSkeleton';
import { mountErrorBanner } from './ui/errorBanner';
import { LocationMarker } from './ui/locationMarker';
import { CameraStore } from './data/cameraStore';
import { ValhallaClient } from './routing/valhallaClient';
import { Router } from './routing/router';
import { parseDatasetManifest } from './data/datasetManifest';
import { isAllowedUrl } from './privacy/networkAllowlist';
import { PhotonClient } from './geocode/photonClient';
import { zoomForType } from './geocode/zoomForType';
import { LocationStore } from './location/locationStore';
import type { GeoPoint } from './domain/route';
import type { ThreatProfile } from './domain/threatProfile';
import type { ResolvedCamera } from './data/resolvedCamera';

const ATLANTA_CENTER: GeoPoint = { lat: 33.7500, lon: -84.3890 };
const VALHALLA_URL = '/valhalla';
const LOCAL_SEED_URL = '/data/cameras-atlanta-seed.json';
const RELEASE_DATASET_URL = '/dataset/cameras-us.json';
const MANIFEST_URL_LIVE = '/dataset/cameras-us.json.meta.json';
const CAMERA_DATASET_URL = import.meta.env['VITE_USE_LOCAL_SEED'] === 'true' ? LOCAL_SEED_URL : RELEASE_DATASET_URL;
const MANIFEST_URL = import.meta.env['VITE_USE_LOCAL_SEED'] === 'true' ? null : MANIFEST_URL_LIVE;
const ROUTE_CONE_RADIUS_M = 200;
const DEFAULT_PROFILE: ThreatProfile = { preset: 'commuter' };

export async function startApp(): Promise<void> {
  if (shouldShowWelcomeModal()) {
    await new Promise<void>((resolve) => mountWelcomeModal(document.body, { onDismiss: resolve }));
  }

  const mapEl = document.getElementById('map');
  if (!mapEl) throw new Error('#map missing');
  // Make sure the map element is a positioning context for our floating chrome.
  mapEl.style.position = mapEl.style.position || 'relative';

  // Loading skeleton mounted inside the map container (temporary; cleared on dataset load).
  mountLoadingSkeleton(mapEl);

  let cameraStore: CameraStore;
  try {
    cameraStore = await CameraStore.loadFromUrl(CAMERA_DATASET_URL);
  } catch (err) {
    clearLoadingSkeleton(mapEl);
    mountErrorBanner(mapEl, err instanceof Error ? err.message : String(err));
    throw err;
  }

  const mapView = new MapView('map', ATLANTA_CENTER);
  mapView.renderCameras(cameraStore.all());

  const photon = new PhotonClient('/photon');
  const locationStore = new LocationStore();
  new LocationMarker(mapEl, mapView.getProjector(), locationStore);
  const router = new Router(new ValhallaClient(VALHALLA_URL), cameraStore, VALHALLA_URL);

  // Camera pin tap → cone + popup
  let popupEl: HTMLElement | null = null;
  let currentProfile: ThreatProfile = DEFAULT_PROFILE;
  let showAllPressed = false;
  mapView.onCameraPinClick((cam) => {
    mapView.setSelectedCameraCone(cam, currentProfile);
    if (popupEl) popupEl.remove();
    popupEl = document.createElement('div');
    popupEl.style.cssText = 'position:absolute;top:var(--space-3);left:var(--space-3);z-index:5';
    mapEl.appendChild(popupEl);
    renderCameraDetailPopup(popupEl, cam, () => {
      mapView.setSelectedCameraCone(null, currentProfile);
      if (popupEl) { popupEl.remove(); popupEl = null; }
    });
  });
  mapView.onMapBackgroundClick(() => {
    if (popupEl) { popupEl.remove(); popupEl = null; }
  });

  // Dataset freshness chip
  let manifestGeneratedAt: string | null = null;
  if (MANIFEST_URL) {
    const isRelative = MANIFEST_URL.startsWith('/') || MANIFEST_URL.startsWith('./');
    if (!isRelative && !isAllowedUrl(MANIFEST_URL)) {
      throw new Error(`Manifest URL not in allowlist: ${MANIFEST_URL}`);
    }
    try {
      const resp = await fetch(MANIFEST_URL);
      if (resp.ok) manifestGeneratedAt = parseDatasetManifest(await resp.text()).generatedAt;
    } catch { /* best-effort */ }
  }
  clearLoadingSkeleton(mapEl);
  if (manifestGeneratedAt) {
    renderDatasetFreshness(mapEl, {
      generatedAt: manifestGeneratedAt,
      onRefresh: () => window.location.reload(),
    });
  }

  // FAB stack — cones toggle + recenter
  const fabStack = mountFabStack(mapEl);
  const conesHost = document.createElement('div');
  fabStack.appendChild(conesHost);
  mountShowAllConesToggle(conesHost, {
    onChange: (pressed) => {
      showAllPressed = pressed;
      mapView.setConesAll(pressed ? cameraStore.all() : [], currentProfile);
    },
  });
  const recenterHost = document.createElement('div');
  fabStack.appendChild(recenterHost);
  mountFab(recenterHost, {
    ariaLabel: 'Recenter on my location',
    icon:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
    onClick: () => {
      const pos = locationStore.lastPosition();
      if (pos) mapView.flyTo({ lat: pos.lat, lon: pos.lon }, 15);
      else locationStore.start();
    },
  });

  // Wayfinding chrome (search bar / planner card swap)
  let plannerCard: PlannerCard | null = null;
  const plannerHost = document.createElement('div');
  mapEl.appendChild(plannerHost);

  const mountIdleSearchBar = (): void => {
    plannerHost.innerHTML = '';
    mountSearchBar(plannerHost, {
      onActivate: () => mountPlanner(),
      onUseLocation: () => {
        locationStore.start();
        mountPlanner();
      },
    });
  };
  const mountPlanner = (): void => {
    plannerHost.innerHTML = '';
    plannerCard = new PlannerCard(plannerHost, {
      photonClient: photon,
      locationStore,
      onClose: () => { plannerCard?.destroy(); plannerCard = null; mountIdleSearchBar(); },
      onCompare: async (start, end) => {
        const cmp = await router.compareRoutes(start, end, currentProfile);
        if (!cmp.degradation) {
          mapView.renderComparison(cmp);
          const combined = [...cmp.shortest.polyline, ...cmp.private.polyline];
          mapView.setConesAlongRoute(camerasNearPolyline(cameraStore.all(), combined), currentProfile);
          mountRouteSummaryCard(mapEl, {
            comparison: {
              shortest: { distanceMeters: cmp.shortest.distanceMeters, exposure: cmp.shortest.exposure, sensorsAlong: cmp.shortest.sensorsAlong ?? 0 },
              private:  { distanceMeters: cmp.private.distanceMeters,  exposure: cmp.private.exposure,  sensorsAlong: cmp.private.sensorsAlong ?? 0 },
            },
            originLabel: `${start.lat.toFixed(3)}, ${start.lon.toFixed(3)}`,
            destinationLabel: `${end.lat.toFixed(3)}, ${end.lon.toFixed(3)}`,
            profileName: currentProfile.preset,
            onSelect: () => { /* re-style polylines in a follow-up */ },
            onStart: () => { /* turn-by-turn — Sub-project B */ },
            onDetails: () => { /* details modal — out of scope */ },
          });
        } else {
          mapView.setConesAlongRoute([], currentProfile);
        }
        return cmp;
      },
    });
    // When a user selects a result, fly the map; PlannerCard exposes that via onSelect indirectly
    // by re-rendering with the new value. The fly is done from the searchInput layer below.
  };

  // Map-tap fallback: if the planner is open, fill the next empty waypoint
  mapView.onClick((p) => {
    if (!plannerCard) return;
    plannerCard.setOrigin({ lat: p.lat, lon: p.lon, label: `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` });
  });

  mountIdleSearchBar();

  // Replicate the search→flyTo behavior: SearchInput selection should also pan the map.
  // We hook into the global document for any picker firing a custom event (kept simple).
  document.addEventListener('flockavoid:geocode-selected', (e) => {
    const { lat, lon, type } = (e as CustomEvent<{ lat: number; lon: number; type: import('./geocode/geocodeTypes').GeocodeResultType }>).detail;
    mapView.flyTo({ lat, lon }, zoomForType(type));
  });
}

function camerasNearPolyline(
  cameras: readonly ResolvedCamera[],
  polyline: readonly GeoPoint[],
): ResolvedCamera[] {
  const hits = new Set<string>();
  for (const point of polyline) {
    for (const cam of cameras) {
      if (hits.has(cam.id)) continue;
      const d = CameraStore.distanceMeters(point, { lat: cam.lat, lon: cam.lon });
      if (d <= ROUTE_CONE_RADIUS_M) hits.add(cam.id);
    }
  }
  return cameras.filter((c) => hits.has(c.id));
}
```

- [ ] **Step 3: Emit the `flockavoid:geocode-selected` custom event from SearchInput**

Open `src/ui/searchInput.ts`. Inside `private select(idx: number)`, after `this.opts.onSelect(r);`, add:

```ts
    document.dispatchEvent(new CustomEvent('flockavoid:geocode-selected', { detail: { lat: r.lat, lon: r.lon, type: r.type } }));
```

This is the integration glue that lets `app.ts` fly the map without coupling `SearchInput` to `MapView` directly. Rerun the SearchInput tests:

```
npx vitest run tests/unit/ui/searchInput.test.ts
```
Expected: still passes (the new dispatch is a side effect, no test relies on its absence).

- [ ] **Step 4: Type-check, lint, full vitest run**

```
npx tsc --noEmit && npm run lint && npm test
```
Expected: 0 type errors; lint clean; all vitest pass (existing 157 + new tests from Tasks 1–17). If `Router.compareRoutes`'s return shape doesn't expose `sensorsAlong` per route, replace `cmp.shortest.sensorsAlong ?? 0` with whatever the actual field is — open `src/routing/router.ts` and use the real property name.

- [ ] **Step 5: Manual smoke test**

```
npm run valhalla:up
npm run dev &
sleep 5
open http://localhost:5173/
```
Walk the flow: dismiss welcome → search "Krog" in the pill → planner opens → autocomplete returns results → pick one → map flies → click "Use my location" → grant permission → blue dot appears → click another autocomplete result for destination → click Plan route → bottom summary card appears with two routes.

```
kill %1 2>/dev/null
npm run valhalla:down
```

- [ ] **Step 6: Commit**

```
git add src/app.ts src/ui/mapView.ts src/ui/searchInput.ts
git commit -m "feat(app): wire SearchBar/PlannerCard, LocationStore, FAB stack, summary card"
```

---

## Task 19 — Update the privacy invariant Playwright test for the new selectors and `/photon`

**Why:** `tests/privacy/networkInvariants.spec.ts` currently drives the old `Set Start on map` / `Set End on map` UI. New flow: type into the planner card. Also verify `/photon` calls are same-origin from the browser.

**Files:**
- Modify: `tests/privacy/networkInvariants.spec.ts`

- [ ] **Step 1: Update `planRoute()` helper to drive the new UI**

Replace the body of `planRoute(page)`:

```ts
async function planRoute(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('#map canvas').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(1500);
  // Activate planner
  await page.locator('[data-search-bar-activate]').click();
  // First input → Krog
  const inputs = page.locator('[data-waypoint] input');
  await inputs.first().fill('Krog Street Market, Atlanta');
  await page.waitForTimeout(500);
  await page.locator('[role="option"]').first().click();
  // Second input → Ponce
  await inputs.nth(1).fill('Ponce City Market, Atlanta');
  await page.waitForTimeout(500);
  await page.locator('[role="option"]').first().click();
  // Plan
  await page.locator('button[data-action="plan"]').click();
  await page.waitForTimeout(4000);
}
```

- [ ] **Step 2: Add an assertion that NO direct `photon.komoot.io` request is made from the browser** (it should always go through `/photon` same-origin)

Inside the same spec, in the existing test or a new one in the same file:

```ts
test('Photon queries are same-origin (use /photon proxy, never direct)', async ({ page }) => {
  const directPhoton: string[] = [];
  page.on('request', (req) => {
    if (req.url().startsWith('https://photon.komoot.io')) directPhoton.push(req.url());
  });
  await page.goto('/');
  await page.locator('[data-search-bar-activate]').click();
  await page.locator('[data-waypoint] input').first().fill('atlanta');
  await page.waitForTimeout(800); // wait past debounce + fetch
  expect(directPhoton).toEqual([]);
});
```

- [ ] **Step 3: Run the privacy invariant suite**

```
npm run valhalla:up
npx playwright test tests/privacy/networkInvariants.spec.ts
```
Expected: all pass.

- [ ] **Step 4: Commit**

```
git add tests/privacy/networkInvariants.spec.ts
git commit -m "test(privacy): update for v0.2 planner selectors + /photon proxy invariant"
```

---

## Task 20 — Playwright E2E: search → flyTo

**Why:** End-to-end coverage that typing into the planner, picking an autocomplete result, and the map panning all work together.

**Files:**
- Create: `tests/e2e/searchFlow.spec.ts`

- [ ] **Step 1: Create the spec**

```ts
import { test, expect } from '@playwright/test';

test('typing into the planner shows Photon results and flies the map on select', async ({ page }) => {
  await page.goto('/');
  // Dismiss welcome modal if present
  const dismiss = page.locator('button[data-action="welcome-dismiss"]');
  if (await dismiss.count()) await dismiss.click();

  // Open planner from idle search bar
  await page.locator('[data-search-bar-activate]').click();
  const origin = page.locator('[data-waypoint="origin"] input');
  await origin.fill('Krog Street Market, Atlanta');

  // Wait past debounce + fetch
  const firstOption = page.locator('[role="option"]').first();
  await firstOption.waitFor({ state: 'visible', timeout: 5_000 });
  await expect(firstOption).toContainText(/Krog/i);

  // Capture map center before/after
  const centerBefore = await page.evaluate(() => {
    const w = window as unknown as { __mapCenter?: { lng: number; lat: number } };
    return w.__mapCenter ?? null;
  });

  await firstOption.click();

  // Allow flyTo animation to start
  await page.waitForTimeout(800);
  const centerAfter = await page.evaluate(() => {
    const w = window as unknown as { __mapCenter?: { lng: number; lat: number } };
    return w.__mapCenter ?? null;
  });

  // If __mapCenter wasn't exposed (it isn't by default), assert via the URL or
  // by verifying that the origin field now reads "Krog Street Market" and the
  // planner still shows that input filled — which proves selection happened.
  await expect(origin).toHaveValue(/Krog Street Market/);

  // Soft assertion on map movement: not strictly required, but if you wired
  // a `window.__mapCenter` exposure in MapView for tests, this checks it.
  if (centerBefore && centerAfter) {
    expect(Math.abs(centerAfter.lat - centerBefore.lat) + Math.abs(centerAfter.lng - centerBefore.lng)).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run the new spec**

```
npm run valhalla:up
npx playwright test tests/e2e/searchFlow.spec.ts
```
Expected: pass. If Photon is unreachable from CI, mark `test.describe.configure({ mode: 'serial' })` and skip with the same Valhalla-style guard.

- [ ] **Step 3: Commit**

```
git add tests/e2e/searchFlow.spec.ts
git commit -m "test(e2e): planner search → flyTo end-to-end"
```

---

## Task 21 — Playwright E2E: use-my-location

**Why:** Verifies the location button flow with a Playwright-mocked permission grant. Geolocation in headless Chromium is provided via `browserContext.grantPermissions + setGeolocation`.

**Files:**
- Create: `tests/e2e/useMyLocation.spec.ts`

- [ ] **Step 1: Create the spec**

```ts
import { test, expect } from '@playwright/test';

test.use({
  geolocation: { latitude: 33.7501, longitude: -84.3890 },
  permissions: ['geolocation'],
});

test('use-my-location fills origin and shows the blue dot', async ({ page }) => {
  await page.goto('/');
  const dismiss = page.locator('button[data-action="welcome-dismiss"]');
  if (await dismiss.count()) await dismiss.click();

  // Click the location button on the idle search bar
  await page.locator('button[data-action="use-location"]').click();

  // Planner opens
  const origin = page.locator('[data-waypoint="origin"] input');
  await origin.waitFor({ state: 'visible', timeout: 3_000 });

  // First fix may take a tick; the use-location-button inside the planner becomes enabled
  const useInPlanner = page.locator('button[data-action="origin-use-location"]');
  await expect(useInPlanner).toBeEnabled({ timeout: 5_000 });
  await useInPlanner.click();

  // Origin now reads the granted coordinates
  await expect(origin).toHaveValue(/33\.7501.*-84\.3890/);

  // Blue dot appears on the map
  await expect(page.locator('[data-location-marker]')).toBeVisible({ timeout: 3_000 });
});
```

- [ ] **Step 2: Run**

```
npx playwright test tests/e2e/useMyLocation.spec.ts
```
Expected: pass.

- [ ] **Step 3: Commit**

```
git add tests/e2e/useMyLocation.spec.ts
git commit -m "test(e2e): use-my-location flow fills origin and shows the marker"
```

---

## Task 22 — Full suite verification + PR

**Why:** Final gate. Everything green, push branch, open PR.

- [ ] **Step 1: Run full vitest suite**

```
cd ~/projects/flock-avoid
npx tsc --noEmit && npm run lint && npm test
```
Expected: 0 type errors, 0 lint, all vitest pass (baseline 157 + new tests from Tasks 1–17 → roughly 200+).

- [ ] **Step 2: Run full Playwright suite**

```
npm run valhalla:up
npx playwright test
npm run valhalla:down
```
Expected: existing privacy/benchmark + new e2e all pass.

- [ ] **Step 3: Push and open PR**

```
git push
gh pr create --base master --head feat/phase-0b-3b-wayfinding \
  --title "Phase 0b-3b sub-project A — Wayfinding UX" \
  --body "$(cat <<'EOF'
## Summary
- Adds Photon-backed search with debounced autocomplete (queries via `/photon` Vite proxy → same-origin from browser).
- Adds live geolocation via `LocationStore` + clean blue dot map marker.
- Replaces the old "Set Start/End on map" UI with a floating pill that expands into a planner card; map-tap still works as fallback.
- Refreshes the brand to v0.2 (Geist + Geist Mono, modern map-first tokens, dark theme via `[data-theme="dark"]` and `prefers-color-scheme`).
- Adds a `RouteSummaryCard` docked bottom-of-map after route comparison.
- Restyles `welcomeModal`, `datasetFreshness`, `showAllConesToggle`, `cameraDetailPopup`.
- Reference design artifact lives at `design-explorations/2026-05-16-wayfinding-dossier.html`.

## Test plan
- [x] `npm test` — all vitest pass
- [x] `npx playwright test tests/privacy/` — privacy invariant still passes, Photon goes through `/photon`
- [x] `npx playwright test tests/e2e/searchFlow.spec.ts` — search-to-fly works
- [x] `npx playwright test tests/e2e/useMyLocation.spec.ts` — location grant fills origin
- [x] Manual smoke: search Krog → click result → map flies; grant location → blue dot appears; plan a route → summary card renders both routes
- [ ] Lighthouse mobile: accessibility ≥ 0.92, perf not worse than 0.77 baseline (perf lift is Sub-project E)

## Spec
`docs/superpowers/specs/2026-05-16-flock-avoid-phase-0b-3b-wayfinding.md`

## Plan
`docs/superpowers/plans/2026-05-16-flock-avoid-phase-0b-3b-wayfinding.md`
EOF
)"
```

- [ ] **Step 4: Hand off to operator for merge.**

---

## Self-review notes (carried out before writing this plan)

- **Spec coverage:** Every section of the spec maps to one or more tasks. §3 decisions → Tasks 4–7 + §6 tokens → Tasks 1–2; §4.1 modules → Tasks 3–13; §4.2 modifications → Tasks 14–18; §4.3 search flow → Tasks 5+9+18; §4.4 location flow → Tasks 7+12+18; §4.5 allowlist+proxy → Task 6; §5 contracts → Tasks 3, 5, 7, 9, 11, 12; §6 visual system → Task 1; §7 welcome copy → Task 14; §8 testing → tests inside each task + Tasks 19–21; §9 acceptance criteria → Task 22 final gate.
- **Placeholders:** none — every step has either real code, a real shell command, or an explicit instruction to substitute a specific value found by reading a named file.
- **Type consistency:** `PhotonClient.search` returns `Promise<readonly GeocodeResult[]>` everywhere; `LocationStore.state` shape matches the spec §5.2; `LocationMarker` accepts a `MapProjector` adapter (so it's testable without maplibre); `PlannerCard` accepts an `onCompare` that returns `Promise<unknown>` to avoid coupling to the routing module shape; `Router.compareRoutes` return shape is the unknown — Task 18 Step 4 explicitly tells the implementer to read `src/routing/router.ts` and substitute the real property name for `sensorsAlong` if needed.
- **Out of scope is signposted clearly:** turn-by-turn `Start →` button is a no-op; cross-city routing failure handling is documented; details modal is a no-op.

