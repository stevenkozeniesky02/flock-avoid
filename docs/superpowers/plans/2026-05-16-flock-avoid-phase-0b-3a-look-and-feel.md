# Flock-Avoid — Phase 0b-3a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transition Flock-Avoid from "developer demo" to "first version of a real map product" — coherent Modern Privacy Tech brand, responsive bottom-sheet mobile layout, MapView rewritten with proper clustering + cone overlays, first-launch welcome modal with privacy promise.

**Architecture:** New `src/brand/` module owns design tokens (TS constants + CSS custom properties, single source of truth). New `src/ui/bottomSheet.ts` is the responsive container that switches between desktop sidebar and mobile draggable sheet via `matchMedia`. `MapView` is rewritten from DOM `maplibregl.Marker` instances to a GeoJSON cluster source with vector symbol layers — handles 10k+ cameras at any zoom. Cone overlays are three separate MapLibre fill layers (selected, along-route, all) that toggle independently. A `WelcomeModal` mounts before app interaction on first launch, dismissal stored in `localStorage`.

**Tech Stack:** Continues Phase 0a/0b-1/0b-2 stack — TypeScript 5.x, Vite 5, Vitest 2 (with jsdom for UI tests), MapLibre GL 4, Valhalla via Docker. Adds: self-hosted Inter font (woff2). No new runtime dependencies.

**Branch:** Create `feat/phase-0b-3a-look-and-feel` from `master` before Task 0.

**Out of scope (per spec):** Geocoding, directions, "from my location", cross-city centering, full-US Valhalla, PWA, deployment — all Phase 0b-3b. Custom illustrated logo, motion design, A11y audit, dark mode — Phase 1+.

---

## File Structure

```
src/
├── brand/                              # NEW
│   ├── tokens.ts                       # NEW: TS constants (colors, spacing, radii, shadows)
│   └── tokens.css                      # NEW: CSS custom properties under :root
├── ui/
│   ├── bottomSheet.ts                  # NEW: responsive sidebar/sheet container
│   ├── welcomeModal.ts                 # NEW: first-launch privacy promise modal
│   ├── cameraDetailPopup.ts            # NEW: popup when a camera pin is tapped
│   ├── showAllConesToggle.ts           # NEW: top-right map toggle button
│   ├── loadingSkeleton.ts              # NEW: shimmer placeholder during dataset load
│   ├── errorBanner.ts                  # NEW: extracted from routePlanner
│   ├── profilePicker.ts                # MODIFY: drop emoji, use SVG icons, brand tokens
│   ├── customProfileEditor.ts          # MODIFY: brand inputs + Apply button
│   ├── routePlanner.ts                 # MODIFY: brand cards; delegate errors to errorBanner
│   ├── mapView.ts                      # REWRITE: GeoJSON cluster source + cone layers + tap
│   └── datasetFreshness.ts             # MODIFY: brand tokens
├── app.ts                              # MODIFY: wire welcome modal, bottom sheet, skeleton
└── main.ts                             # MODIFY: import brand/tokens.css at bootstrap
index.html                              # MODIFY: theme-color meta, font preconnect removal,
                                        #         inline style cleanup
public/
└── fonts/                              # NEW: self-hosted Inter woff2
    ├── Inter-Regular.woff2
    ├── Inter-Medium.woff2
    ├── Inter-SemiBold.woff2
    └── Inter-Bold.woff2
tests/
├── unit/
│   ├── brand/
│   │   └── tokens.test.ts              # NEW: assert TS and CSS token sets agree
│   └── ui/
│       ├── welcomeModal.test.ts        # NEW
│       ├── bottomSheet.test.ts         # NEW
│       ├── cameraDetailPopup.test.ts   # NEW
│       ├── loadingSkeleton.test.ts     # NEW
│       └── errorBanner.test.ts         # NEW
└── benchmark/
    ├── helpers/
    │   └── benchmarkHarness.ts         # MODIFY: dismiss welcome modal at start of planRoute
    └── routes/atlanta.spec.ts          # (no change — harness handles it)
tests/privacy/networkInvariants.spec.ts # MODIFY: dismiss welcome modal at test start
```

---

## Task 0: Branch + baseline

**Files:** none (git only)

- [ ] **Step 1: Create branch + verify baseline**

```bash
cd /Users/steven/projects/flock-avoid
git checkout master
git pull --ff-only origin master 2>&1 | tail -3
git checkout -b feat/phase-0b-3a-look-and-feel
npm test 2>&1 | tail -3
```

Expected: 120 tests pass.

- [ ] **Step 2: Verify Valhalla is up (needed for benchmark tests later)**

```bash
curl -sf http://localhost:8002/status | head -c 80 || npm run valhalla:up
```

No commit at this step.

---

## Task 1: Brand tokens (TS + CSS, single source of truth)

**Files:**
- Create: `src/brand/tokens.ts`
- Create: `src/brand/tokens.css`
- Create: `tests/unit/brand/tokens.test.ts`

The TS constants are the canonical source. The CSS file is hand-mirrored. A test asserts the two stay in sync.

- [ ] **Step 1: Write failing test**

Create `tests/unit/brand/tokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND_TOKENS } from '../../../src/brand/tokens';

describe('brand tokens', () => {
  it('TS exports every documented spec token', () => {
    expect(BRAND_TOKENS.color['brand-primary']).toBe('#3a5fff');
    expect(BRAND_TOKENS.color['brand-primary-soft']).toBe('#eef1ff');
    expect(BRAND_TOKENS.color['brand-surface']).toBe('#ffffff');
    expect(BRAND_TOKENS.color['brand-canvas']).toBe('#f7f3ec');
    expect(BRAND_TOKENS.color['brand-ink']).toBe('#0d1a3a');
    expect(BRAND_TOKENS.color['brand-ink-muted']).toBe('#6b7280');
    expect(BRAND_TOKENS.color['brand-border']).toBe('#e5e8f0');
    expect(BRAND_TOKENS.color['state-success']).toBe('#15803d');
    expect(BRAND_TOKENS.color['state-success-soft']).toBe('#ecfdf5');
    expect(BRAND_TOKENS.color['state-danger']).toBe('#b91c1c');
    expect(BRAND_TOKENS.color['state-danger-soft']).toBe('#fef2f2');
    expect(BRAND_TOKENS.color['state-warning']).toBe('#b45309');
    expect(BRAND_TOKENS.color['state-warning-soft']).toBe('#fef3c7');
  });

  it('TS and CSS files agree on every token', () => {
    const cssPath = join(__dirname, '../../../src/brand/tokens.css');
    const cssRaw = readFileSync(cssPath, 'utf-8');
    for (const [key, value] of Object.entries(BRAND_TOKENS.color)) {
      const cssVarName = `--color-${key}`;
      expect(cssRaw, `missing ${cssVarName} in tokens.css`).toContain(`${cssVarName}: ${value}`);
    }
    for (const [key, value] of Object.entries(BRAND_TOKENS.space)) {
      expect(cssRaw).toContain(`--space-${key}: ${value}`);
    }
    for (const [key, value] of Object.entries(BRAND_TOKENS.radius)) {
      expect(cssRaw).toContain(`--radius-${key}: ${value}`);
    }
  });
});
```

- [ ] **Step 2: Run, confirm fails**

```bash
npx vitest run tests/unit/brand/tokens.test.ts
```

Expected: module not found.

- [ ] **Step 3: Create `src/brand/tokens.ts`**

```ts
export const BRAND_TOKENS = {
  color: {
    'brand-primary': '#3a5fff',
    'brand-primary-soft': '#eef1ff',
    'brand-surface': '#ffffff',
    'brand-canvas': '#f7f3ec',
    'brand-ink': '#0d1a3a',
    'brand-ink-muted': '#6b7280',
    'brand-border': '#e5e8f0',
    'state-success': '#15803d',
    'state-success-soft': '#ecfdf5',
    'state-danger': '#b91c1c',
    'state-danger-soft': '#fef2f2',
    'state-warning': '#b45309',
    'state-warning-soft': '#fef3c7',
  },
  space: {
    '1': '4px',
    '2': '8px',
    '3': '12px',
    '4': '16px',
    '6': '24px',
    '8': '32px',
  },
  radius: {
    'sm': '4px',
    'md': '6px',
    'lg': '10px',
    'xl': '16px',
  },
  shadow: {
    'sm': '0 1px 2px rgba(13, 26, 58, 0.06)',
    'md': '0 4px 12px rgba(13, 26, 58, 0.08)',
    'lg': '0 10px 30px rgba(13, 26, 58, 0.12)',
  },
  fontSize: {
    'xs': '0.75rem',
    'sm': '0.8125rem',
    'base': '0.875rem',
    'md': '1rem',
    'lg': '1.125rem',
    'xl': '1.375rem',
  },
} as const;
```

- [ ] **Step 4: Create `src/brand/tokens.css`**

```css
:root {
  /* color */
  --color-brand-primary: #3a5fff;
  --color-brand-primary-soft: #eef1ff;
  --color-brand-surface: #ffffff;
  --color-brand-canvas: #f7f3ec;
  --color-brand-ink: #0d1a3a;
  --color-brand-ink-muted: #6b7280;
  --color-brand-border: #e5e8f0;
  --color-state-success: #15803d;
  --color-state-success-soft: #ecfdf5;
  --color-state-danger: #b91c1c;
  --color-state-danger-soft: #fef2f2;
  --color-state-warning: #b45309;
  --color-state-warning-soft: #fef3c7;

  /* space */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;

  /* radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;
  --radius-xl: 16px;

  /* shadow */
  --shadow-sm: 0 1px 2px rgba(13, 26, 58, 0.06);
  --shadow-md: 0 4px 12px rgba(13, 26, 58, 0.08);
  --shadow-lg: 0 10px 30px rgba(13, 26, 58, 0.12);

  /* type */
  --font-family-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.8125rem;
  --font-size-base: 0.875rem;
  --font-size-md: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.375rem;
}
```

- [ ] **Step 5: Run, confirm passes (2 tests)**

- [ ] **Step 6: Commit**

```bash
git add src/brand/tokens.ts src/brand/tokens.css tests/unit/brand/tokens.test.ts
git commit -m "feat(brand): add color/space/radius/shadow tokens (TS + CSS, kept in sync via test)"
```

---

## Task 2: Self-host Inter font

**Files:**
- Create: `public/fonts/Inter-Regular.woff2`
- Create: `public/fonts/Inter-Medium.woff2`
- Create: `public/fonts/Inter-SemiBold.woff2`
- Create: `public/fonts/Inter-Bold.woff2`
- Modify: `src/brand/tokens.css` (add @font-face)

- [ ] **Step 1: Download Inter woff2 files**

```bash
mkdir -p public/fonts
curl -fsSL https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.woff2 -o public/fonts/Inter-Regular.woff2
curl -fsSL https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Medium.woff2 -o public/fonts/Inter-Medium.woff2
curl -fsSL https://github.com/rsms/inter/raw/master/docs/font-files/Inter-SemiBold.woff2 -o public/fonts/Inter-SemiBold.woff2
curl -fsSL https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Bold.woff2 -o public/fonts/Inter-Bold.woff2
ls -la public/fonts/
```

Expected: 4 files, each ~30KB. If the URLs are stale, fall back to `https://rsms.me/inter/font-files/Inter-Regular.woff2` (and Medium/SemiBold/Bold) — that's the canonical font designer's host. Verify the downloaded files are non-empty and start with `wOF2` (woff2 magic bytes):

```bash
for f in public/fonts/Inter-*.woff2; do
  head -c 4 "$f" | xxd | head -1
done
```

Expected: each line shows `77 4f 46 32` (= `wOF2`).

- [ ] **Step 2: Add @font-face to `src/brand/tokens.css`**

Append to `src/brand/tokens.css` (after the `:root` block):

```css
@font-face {
  font-family: 'Inter';
  font-weight: 400;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/Inter-Regular.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-weight: 500;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/Inter-Medium.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-weight: 600;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/Inter-SemiBold.woff2') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-weight: 700;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/Inter-Bold.woff2') format('woff2');
}
```

- [ ] **Step 3: Commit**

```bash
git add public/fonts/ src/brand/tokens.css
git commit -m "feat(brand): self-host Inter font (Regular/Medium/SemiBold/Bold)"
```

---

## Task 3: ErrorBanner extracted from RoutePlanner

**Files:**
- Create: `src/ui/errorBanner.ts`
- Create: `tests/unit/ui/errorBanner.test.ts`

This task extracts the inline error rendering from `routePlanner.ts` so other components can reuse it. The `RoutePlanner` itself isn't changed yet — Task 12 will switch it over.

- [ ] **Step 1: Write failing test**

Create `tests/unit/ui/errorBanner.test.ts`:

```ts
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountErrorBanner, clearErrorBanners } from '../../../src/ui/errorBanner';

describe('errorBanner', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    container = document.getElementById('c')!;
  });

  it('mountErrorBanner appends an element with the given message', () => {
    mountErrorBanner(container, 'Something went wrong');
    const banner = container.querySelector('[data-error-banner]') as HTMLElement;
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('Something went wrong');
  });

  it('clearErrorBanners removes all banners in the container', () => {
    mountErrorBanner(container, 'First error');
    mountErrorBanner(container, 'Second error');
    expect(container.querySelectorAll('[data-error-banner]')).toHaveLength(2);
    clearErrorBanners(container);
    expect(container.querySelectorAll('[data-error-banner]')).toHaveLength(0);
  });

  it('mountErrorBanner does NOT clear existing banners — it appends', () => {
    mountErrorBanner(container, 'First');
    mountErrorBanner(container, 'Second');
    expect(container.querySelectorAll('[data-error-banner]')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run, confirm fails (module not found)**

- [ ] **Step 3: Implement**

Create `src/ui/errorBanner.ts`:

```ts
export function mountErrorBanner(container: HTMLElement, message: string): void {
  const banner = document.createElement('div');
  banner.dataset['errorBanner'] = 'true';
  banner.style.cssText =
    'margin-top:var(--space-3);padding:var(--space-3);' +
    'background:var(--color-state-danger-soft);color:var(--color-state-danger);' +
    'border:1px solid var(--color-state-danger);border-radius:var(--radius-md);' +
    'font-size:var(--font-size-sm);font-family:var(--font-family-sans)';
  banner.textContent = `Routing failed: ${message}`;
  container.appendChild(banner);
}

export function clearErrorBanners(container: HTMLElement): void {
  container.querySelectorAll('[data-error-banner]').forEach((el) => el.remove());
}
```

- [ ] **Step 4: Run, confirm passes (3 tests)**

- [ ] **Step 5: Commit**

```bash
git add src/ui/errorBanner.ts tests/unit/ui/errorBanner.test.ts
git commit -m "feat(ui): extract errorBanner from routePlanner for reuse"
```

---

## Task 4: LoadingSkeleton

**Files:**
- Create: `src/ui/loadingSkeleton.ts`
- Create: `tests/unit/ui/loadingSkeleton.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/ui/loadingSkeleton.test.ts`:

```ts
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountLoadingSkeleton, clearLoadingSkeleton } from '../../../src/ui/loadingSkeleton';

describe('loadingSkeleton', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    container = document.getElementById('c')!;
  });

  it('mounts three placeholder rows', () => {
    mountLoadingSkeleton(container);
    const rows = container.querySelectorAll('[data-skeleton-row]');
    expect(rows.length).toBe(3);
  });

  it('clears cleanly', () => {
    mountLoadingSkeleton(container);
    clearLoadingSkeleton(container);
    expect(container.querySelectorAll('[data-skeleton-row]')).toHaveLength(0);
  });

  it('replaces previous skeleton if mounted twice', () => {
    mountLoadingSkeleton(container);
    mountLoadingSkeleton(container);
    expect(container.querySelectorAll('[data-skeleton-row]')).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run, confirm fails**

- [ ] **Step 3: Implement**

Create `src/ui/loadingSkeleton.ts`:

```ts
const ROW_HEIGHTS_PX = [40, 56, 56];

export function mountLoadingSkeleton(container: HTMLElement): void {
  clearLoadingSkeleton(container);
  const wrapper = document.createElement('div');
  wrapper.dataset['skeletonWrapper'] = 'true';
  wrapper.style.cssText = 'padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-3)';
  for (const h of ROW_HEIGHTS_PX) {
    const row = document.createElement('div');
    row.dataset['skeletonRow'] = 'true';
    row.style.cssText =
      `height:${h}px;border-radius:var(--radius-md);` +
      'background:linear-gradient(90deg, var(--color-brand-border) 25%, var(--color-brand-primary-soft) 50%, var(--color-brand-border) 75%);' +
      'background-size:200% 100%;animation:flockavoid-shimmer 1.4s ease-in-out infinite';
    wrapper.appendChild(row);
  }
  container.appendChild(wrapper);
  // Inject keyframes once (idempotent — checks for existing style tag)
  if (!document.getElementById('flockavoid-shimmer-keyframes')) {
    const style = document.createElement('style');
    style.id = 'flockavoid-shimmer-keyframes';
    style.textContent = '@keyframes flockavoid-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }';
    document.head.appendChild(style);
  }
}

export function clearLoadingSkeleton(container: HTMLElement): void {
  container.querySelectorAll('[data-skeleton-wrapper]').forEach((el) => el.remove());
}
```

- [ ] **Step 4: Run, confirm passes (3 tests)**

- [ ] **Step 5: Commit**

```bash
git add src/ui/loadingSkeleton.ts tests/unit/ui/loadingSkeleton.test.ts
git commit -m "feat(ui): add LoadingSkeleton (3 shimmer placeholder rows)"
```

---

## Task 5: WelcomeModal

**Files:**
- Create: `src/ui/welcomeModal.ts`
- Create: `tests/unit/ui/welcomeModal.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/ui/welcomeModal.test.ts`:

```ts
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldShowWelcomeModal,
  mountWelcomeModal,
  WELCOME_DISMISSED_KEY,
} from '../../../src/ui/welcomeModal';

describe('welcomeModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    localStorage.clear();
  });

  it('shouldShowWelcomeModal returns true when no flag set', () => {
    expect(shouldShowWelcomeModal()).toBe(true);
  });

  it('shouldShowWelcomeModal returns false when flag set', () => {
    localStorage.setItem(WELCOME_DISMISSED_KEY, 'true');
    expect(shouldShowWelcomeModal()).toBe(false);
  });

  it('mountWelcomeModal renders a modal with a "Get started" button', () => {
    const container = document.getElementById('c')!;
    mountWelcomeModal(container, { onDismiss: () => {} });
    expect(container.querySelector('[data-welcome-modal]')).toBeTruthy();
    expect(container.querySelector('button[data-action="welcome-dismiss"]')).toBeTruthy();
  });

  it('clicking "Get started" calls onDismiss and sets the localStorage flag', () => {
    const container = document.getElementById('c')!;
    let dismissed = false;
    mountWelcomeModal(container, { onDismiss: () => { dismissed = true; } });
    const btn = container.querySelector('button[data-action="welcome-dismiss"]') as HTMLButtonElement;
    btn.click();
    expect(dismissed).toBe(true);
    expect(localStorage.getItem(WELCOME_DISMISSED_KEY)).toBe('true');
  });

  it('modal contains the privacy promise text', () => {
    const container = document.getElementById('c')!;
    mountWelcomeModal(container, { onDismiss: () => {} });
    expect(container.textContent).toMatch(/location/i);
    expect(container.textContent).toMatch(/track/i);
  });
});
```

- [ ] **Step 2: Run, confirm fails**

- [ ] **Step 3: Implement**

Create `src/ui/welcomeModal.ts`:

```ts
export const WELCOME_DISMISSED_KEY = 'flockavoid.welcomeDismissed.v1';

export interface WelcomeModalCallbacks {
  readonly onDismiss: () => void;
}

export function shouldShowWelcomeModal(): boolean {
  try {
    return localStorage.getItem(WELCOME_DISMISSED_KEY) !== 'true';
  } catch {
    return true;
  }
}

export function mountWelcomeModal(
  container: HTMLElement,
  callbacks: WelcomeModalCallbacks,
): void {
  const backdrop = document.createElement('div');
  backdrop.dataset['welcomeModal'] = 'true';
  backdrop.style.cssText =
    'position:fixed;inset:0;background:rgba(13, 26, 58, 0.6);' +
    'display:flex;align-items:center;justify-content:center;z-index:1000;' +
    'font-family:var(--font-family-sans)';

  const card = document.createElement('div');
  card.style.cssText =
    'background:var(--color-brand-surface);border-radius:var(--radius-xl);' +
    'padding:var(--space-6);max-width:420px;width:calc(100% - var(--space-8));' +
    'box-shadow:var(--shadow-lg)';

  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-4)">
      <div style="width:24px;height:24px;background:var(--color-brand-primary);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px">F</div>
      <strong style="color:var(--color-brand-ink);font-size:var(--font-size-md)">flockavoid</strong>
    </div>
    <h2 style="margin:0 0 var(--space-3);font-size:var(--font-size-xl);color:var(--color-brand-ink);font-weight:700;line-height:1.2">
      Route around surveillance.
    </h2>
    <p style="margin:0 0 var(--space-4);color:var(--color-brand-ink-muted);font-size:var(--font-size-sm);line-height:1.5">
      A privacy-first map for avoiding ALPR cameras and other watchers.
    </p>
    <div style="background:var(--color-brand-primary-soft);border-radius:var(--radius-md);padding:var(--space-3);margin-bottom:var(--space-4)">
      <div style="font-size:var(--font-size-xs);font-weight:700;color:var(--color-brand-primary);letter-spacing:1px;margin-bottom:var(--space-1)">YOUR LOCATION STAYS LOCAL</div>
      <div style="font-size:var(--font-size-sm);color:var(--color-brand-ink);line-height:1.5">Routes compute on this device. We don't track your trips. Ever.</div>
    </div>
  `;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset['action'] = 'welcome-dismiss';
  btn.textContent = 'Get started';
  btn.style.cssText =
    'display:block;width:100%;padding:var(--space-3);background:var(--color-brand-primary);' +
    'color:#fff;border:0;border-radius:var(--radius-md);cursor:pointer;' +
    'font:inherit;font-size:var(--font-size-base);font-weight:600';
  btn.addEventListener('click', () => {
    try { localStorage.setItem(WELCOME_DISMISSED_KEY, 'true'); } catch { /* ignore */ }
    backdrop.remove();
    callbacks.onDismiss();
  });
  card.appendChild(btn);

  backdrop.appendChild(card);
  container.appendChild(backdrop);
}
```

- [ ] **Step 4: Run, confirm passes (5 tests)**

- [ ] **Step 5: Commit**

```bash
git add src/ui/welcomeModal.ts tests/unit/ui/welcomeModal.test.ts
git commit -m "feat(ui): WelcomeModal with privacy promise + localStorage dismissal"
```

---

## Task 6: BottomSheet responsive container

**Files:**
- Create: `src/ui/bottomSheet.ts`
- Create: `tests/unit/ui/bottomSheet.test.ts`

The BottomSheet wraps the sidebar contents. On desktop (≥720px), it renders as a 340px-wide fixed-left sidebar (current behavior). On mobile (<720px), it renders as a draggable bottom sheet with three snap positions.

- [ ] **Step 1: Write failing test**

Create `tests/unit/ui/bottomSheet.test.ts`:

```ts
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BottomSheet, BREAKPOINT_PX } from '../../../src/ui/bottomSheet';

function mockMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('BottomSheet', () => {
  let mount: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="m"></div>';
    mount = document.getElementById('m')!;
  });

  it('exposes BREAKPOINT_PX = 720', () => {
    expect(BREAKPOINT_PX).toBe(720);
  });

  it('renders as desktop sidebar above the breakpoint', () => {
    mockMatchMedia(false); // matches max-width:719px = false → desktop
    const sheet = new BottomSheet(mount);
    expect(sheet.getMode()).toBe('desktop');
    expect(mount.querySelector('[data-sheet-mode="desktop"]')).toBeTruthy();
  });

  it('renders as bottom sheet below the breakpoint', () => {
    mockMatchMedia(true); // matches max-width:719px = true → mobile
    const sheet = new BottomSheet(mount);
    expect(sheet.getMode()).toBe('mobile');
    expect(mount.querySelector('[data-sheet-mode="mobile"]')).toBeTruthy();
  });

  it('contentRoot() returns the element that callers mount their UI into', () => {
    mockMatchMedia(false);
    const sheet = new BottomSheet(mount);
    const root = sheet.contentRoot();
    expect(root).toBeInstanceOf(HTMLElement);
    expect(mount.contains(root)).toBe(true);
  });

  it('mobile mode renders a drag handle at the top of the sheet', () => {
    mockMatchMedia(true);
    new BottomSheet(mount);
    expect(mount.querySelector('[data-sheet-handle]')).toBeTruthy();
  });

  it('mobile mode starts in "half" snap position', () => {
    mockMatchMedia(true);
    const sheet = new BottomSheet(mount);
    expect(sheet.getSnapPosition()).toBe('half');
  });

  it('cycleSnap advances collapsed → half → full → collapsed', () => {
    mockMatchMedia(true);
    const sheet = new BottomSheet(mount);
    sheet.setSnapPosition('collapsed');
    sheet.cycleSnap();
    expect(sheet.getSnapPosition()).toBe('half');
    sheet.cycleSnap();
    expect(sheet.getSnapPosition()).toBe('full');
    sheet.cycleSnap();
    expect(sheet.getSnapPosition()).toBe('collapsed');
  });
});
```

- [ ] **Step 2: Run, confirm fails**

- [ ] **Step 3: Implement**

Create `src/ui/bottomSheet.ts`:

```ts
export const BREAKPOINT_PX = 720;

export type SheetMode = 'desktop' | 'mobile';
export type SnapPosition = 'collapsed' | 'half' | 'full';

const SNAP_HEIGHTS: Record<SnapPosition, string> = {
  collapsed: '88px',
  half: '45vh',
  full: '92vh',
};

const SNAP_CYCLE: readonly SnapPosition[] = ['collapsed', 'half', 'full'];

export class BottomSheet {
  private mode: SheetMode;
  private snap: SnapPosition = 'half';
  private wrapper: HTMLElement;
  private content: HTMLElement;

  constructor(private readonly mount: HTMLElement) {
    this.mode = this.detectMode();
    this.wrapper = document.createElement('div');
    this.wrapper.dataset['sheetMode'] = this.mode;
    this.content = document.createElement('div');
    this.content.dataset['sheetContent'] = 'true';
    this.render();
    this.installResizeListener();
  }

  contentRoot(): HTMLElement {
    return this.content;
  }

  getMode(): SheetMode {
    return this.mode;
  }

  getSnapPosition(): SnapPosition {
    return this.snap;
  }

  setSnapPosition(snap: SnapPosition): void {
    this.snap = snap;
    if (this.mode === 'mobile') {
      this.wrapper.style.height = SNAP_HEIGHTS[snap];
    }
  }

  cycleSnap(): void {
    const idx = SNAP_CYCLE.indexOf(this.snap);
    const next = SNAP_CYCLE[(idx + 1) % SNAP_CYCLE.length]!;
    this.setSnapPosition(next);
  }

  private detectMode(): SheetMode {
    if (typeof window === 'undefined' || !window.matchMedia) return 'desktop';
    return window.matchMedia(`(max-width:${BREAKPOINT_PX - 1}px)`).matches ? 'mobile' : 'desktop';
  }

  private render(): void {
    this.mount.innerHTML = '';
    this.wrapper.innerHTML = '';
    this.wrapper.dataset['sheetMode'] = this.mode;

    if (this.mode === 'desktop') {
      this.wrapper.style.cssText =
        'width:340px;height:100vh;border-right:1px solid var(--color-brand-border);' +
        'background:var(--color-brand-surface);overflow:auto;flex-shrink:0';
      this.wrapper.appendChild(this.content);
    } else {
      this.wrapper.style.cssText =
        `position:fixed;left:0;right:0;bottom:0;height:${SNAP_HEIGHTS[this.snap]};` +
        'background:var(--color-brand-surface);border-radius:var(--radius-xl) var(--radius-xl) 0 0;' +
        'box-shadow:var(--shadow-lg);overflow:hidden;display:flex;flex-direction:column;' +
        'transition:height 0.2s ease-out;z-index:5';
      const handleWrap = document.createElement('div');
      handleWrap.dataset['sheetHandle'] = 'true';
      handleWrap.style.cssText =
        'padding:var(--space-2) 0;display:flex;justify-content:center;cursor:pointer;flex-shrink:0';
      handleWrap.addEventListener('click', () => this.cycleSnap());
      const bar = document.createElement('div');
      bar.style.cssText =
        'width:36px;height:4px;border-radius:var(--radius-sm);background:var(--color-brand-border)';
      handleWrap.appendChild(bar);
      this.wrapper.appendChild(handleWrap);
      const scroll = document.createElement('div');
      scroll.style.cssText = 'overflow:auto;flex:1;padding:0 var(--space-4) var(--space-4)';
      scroll.appendChild(this.content);
      this.wrapper.appendChild(scroll);
    }
    this.mount.appendChild(this.wrapper);
  }

  private installResizeListener(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width:${BREAKPOINT_PX - 1}px)`);
    const onChange = (): void => {
      const next = this.detectMode();
      if (next !== this.mode) {
        this.mode = next;
        this.render();
      }
    };
    // Use both addEventListener (modern) and addListener (legacy fallback)
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
    } else if ((mq as MediaQueryList).addListener) {
      (mq as MediaQueryList).addListener(onChange);
    }
  }
}
```

- [ ] **Step 4: Run, confirm passes (7 tests)**

- [ ] **Step 5: Commit**

```bash
git add src/ui/bottomSheet.ts tests/unit/ui/bottomSheet.test.ts
git commit -m "feat(ui): responsive BottomSheet — desktop sidebar / mobile draggable sheet"
```

---

## Task 7: CameraDetailPopup

**Files:**
- Create: `src/ui/cameraDetailPopup.ts`
- Create: `tests/unit/ui/cameraDetailPopup.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/ui/cameraDetailPopup.test.ts`:

```ts
/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderCameraDetailPopup } from '../../../src/ui/cameraDetailPopup';
import type { ResolvedCamera } from '../../../src/data/resolvedCamera';
import { resolveCamera } from '../../../src/data/resolvedCamera';

describe('cameraDetailPopup', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    container = document.getElementById('c')!;
  });

  it('renders camera type, direction, range, fov', () => {
    const cam: ResolvedCamera = resolveCamera({
      id: 'atl-001',
      type: 'alpr_government',
      lat: 33.75,
      lon: -84.39,
      confidence: 0.9,
      source: 'deflock',
      direction: 90,
      rangeMeters: 35,
      fovDegrees: 30,
      directionConfidence: 'known',
      sources: ['deflock', 'osm'],
    });
    renderCameraDetailPopup(container, cam, () => {});
    const text = container.textContent ?? '';
    expect(text).toContain('alpr_government');
    expect(text).toContain('90');
    expect(text).toContain('35');
    expect(text).toContain('30');
  });

  it('surfaces the sources array as "Confirmed by"', () => {
    const cam: ResolvedCamera = resolveCamera({
      id: 'x',
      type: 'alpr_government',
      lat: 33.75,
      lon: -84.39,
      confidence: 0.9,
      source: 'deflock',
      sources: ['deflock', 'osm'],
    });
    renderCameraDetailPopup(container, cam, () => {});
    expect(container.textContent).toMatch(/Confirmed by/i);
    expect(container.textContent).toContain('deflock');
    expect(container.textContent).toContain('osm');
  });

  it('renders close button that fires the callback', () => {
    const cam: ResolvedCamera = resolveCamera({
      id: 'x',
      type: 'alpr_government',
      lat: 33.75,
      lon: -84.39,
      confidence: 0.9,
      source: 'deflock',
      sources: ['deflock'],
    });
    let closed = false;
    renderCameraDetailPopup(container, cam, () => { closed = true; });
    const btn = container.querySelector('button[data-action="close-popup"]') as HTMLButtonElement;
    btn.click();
    expect(closed).toBe(true);
  });

  it('shows "(direction unknown)" when directionConfidence is unknown', () => {
    const cam: ResolvedCamera = resolveCamera({
      id: 'x',
      type: 'cctv_municipal',
      lat: 33.75,
      lon: -84.39,
      confidence: 0.8,
      source: 'osm',
      sources: ['osm'],
    });
    renderCameraDetailPopup(container, cam, () => {});
    expect(container.textContent).toMatch(/direction unknown/i);
  });
});
```

- [ ] **Step 2: Run, confirm fails**

- [ ] **Step 3: Implement**

Create `src/ui/cameraDetailPopup.ts`:

```ts
import type { ResolvedCamera } from '../data/resolvedCamera';

export function renderCameraDetailPopup(
  container: HTMLElement,
  camera: ResolvedCamera,
  onClose: () => void,
): void {
  container.innerHTML = '';
  const card = document.createElement('div');
  card.dataset['cameraPopup'] = 'true';
  card.style.cssText =
    'background:var(--color-brand-surface);border-radius:var(--radius-lg);' +
    'padding:var(--space-3);box-shadow:var(--shadow-md);' +
    'font-family:var(--font-family-sans);font-size:var(--font-size-sm);' +
    'color:var(--color-brand-ink);min-width:220px';

  const directionLabel =
    camera.directionConfidence === 'unknown'
      ? '(direction unknown)'
      : `${camera.effectiveDirection}° (${bearingToCompass(camera.effectiveDirection)})`;

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-2)">
      <strong style="color:var(--color-brand-primary);font-size:var(--font-size-base)">${camera.type}</strong>
      <button type="button" data-action="close-popup" style="background:none;border:0;font-size:18px;color:var(--color-brand-ink-muted);cursor:pointer;line-height:1;padding:0">×</button>
    </div>
    <div style="color:var(--color-brand-ink-muted);font-size:var(--font-size-xs);margin-bottom:var(--space-1)">Direction: ${directionLabel}</div>
    <div style="color:var(--color-brand-ink-muted);font-size:var(--font-size-xs);margin-bottom:var(--space-2)">Range: ${camera.effectiveRangeMeters}m · FOV: ${camera.effectiveFovDegrees}°</div>
    <hr style="border:0;border-top:1px solid var(--color-brand-border);margin:var(--space-2) 0"/>
    <div style="font-size:var(--font-size-xs);color:var(--color-brand-ink-muted)">Confirmed by: ${(camera.sources ?? [camera.source]).join(' + ')}</div>
    <div style="font-size:var(--font-size-xs);color:var(--color-brand-ink-muted);opacity:0.6;margin-top:var(--space-1)">ID: ${camera.id}</div>
  `;
  const closeBtn = card.querySelector('button[data-action="close-popup"]') as HTMLButtonElement;
  closeBtn.addEventListener('click', onClose);
  container.appendChild(card);
}

function bearingToCompass(bearing: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(((bearing % 360) / 45)) % 8;
  return dirs[idx]!.toLowerCase();
}
```

- [ ] **Step 4: Run, confirm passes (4 tests)**

- [ ] **Step 5: Commit**

```bash
git add src/ui/cameraDetailPopup.ts tests/unit/ui/cameraDetailPopup.test.ts
git commit -m "feat(ui): CameraDetailPopup with sources, direction, range, FOV"
```

---

## Task 8: ShowAllConesToggle

**Files:**
- Create: `src/ui/showAllConesToggle.ts`

This is a small standalone button. No test file — it's a one-method component that just renders a button + calls a callback. Behavior is exercised by Playwright in Task 9d.

- [ ] **Step 1: Implement**

Create `src/ui/showAllConesToggle.ts`:

```ts
export interface ShowAllConesToggleCallbacks {
  readonly onChange: (pressed: boolean) => void;
}

export function mountShowAllConesToggle(
  container: HTMLElement,
  callbacks: ShowAllConesToggleCallbacks,
): { setPressed: (pressed: boolean) => void } {
  let pressed = false;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = 'Show all camera cones';
  btn.setAttribute('aria-pressed', 'false');
  btn.dataset['action'] = 'toggle-all-cones';
  paint(btn, pressed);
  btn.addEventListener('click', () => {
    pressed = !pressed;
    paint(btn, pressed);
    btn.setAttribute('aria-pressed', String(pressed));
    callbacks.onChange(pressed);
  });
  container.appendChild(btn);
  return {
    setPressed: (next: boolean): void => {
      pressed = next;
      paint(btn, pressed);
      btn.setAttribute('aria-pressed', String(pressed));
    },
  };
}

function paint(btn: HTMLButtonElement, pressed: boolean): void {
  const bg = pressed ? 'var(--color-brand-primary)' : 'var(--color-brand-surface)';
  const fg = pressed ? '#fff' : 'var(--color-brand-ink)';
  const border = pressed ? 'var(--color-brand-primary)' : 'var(--color-brand-border)';
  btn.style.cssText =
    `width:36px;height:36px;border-radius:var(--radius-md);background:${bg};` +
    `color:${fg};border:1px solid ${border};cursor:pointer;display:flex;` +
    `align-items:center;justify-content:center;box-shadow:var(--shadow-sm);` +
    'font-family:var(--font-family-sans);font-size:16px;font-weight:700';
  // Triangle/cone glyph
  btn.innerHTML = '◢';
}
```

- [ ] **Step 2: Verify compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/showAllConesToggle.ts
git commit -m "feat(ui): ShowAllConesToggle button (top-right map control)"
```

---

## Task 9a: MapView rewrite — GeoJSON cluster source + symbol layers

**Files:**
- Modify: `src/ui/mapView.ts`

This is the biggest single change. Replace the per-camera DOM `maplibregl.Marker` instances with a single GeoJSON source containing all cameras (`cluster: true`), plus three styled layers: cluster circles, individual pins, "?" badge symbols.

The existing `renderCameras(cameras)` method's signature stays the same. The existing `renderComparison(cmp)` for route polylines stays unchanged. Only the internals of camera rendering change.

- [ ] **Step 1: Replace the camera-rendering internals of `src/ui/mapView.ts`**

Read the current file. The constructor + `renderComparison` + `addRouteLayer` + `clearRoutes` + `onClick` stay. Replace `renderCameras` and add private helpers. The new shape:

```ts
import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import type { ResolvedCamera } from '../data/resolvedCamera';
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

const CAMERA_SOURCE = 'cameras';
const CLUSTER_LAYER = 'cameras-clusters';
const CLUSTER_COUNT_LAYER = 'cameras-cluster-counts';
const POINT_LAYER = 'cameras-points';
const UNKNOWN_BADGE_LAYER = 'cameras-unknown-badge';

export class MapView {
  private readonly map: MapLibreMap;
  private clickListener: ((p: GeoPoint) => void) | null = null;
  private cameraPinClickListener: ((cam: ResolvedCamera) => void) | null = null;
  private cameraIndex = new Map<string, ResolvedCamera>();

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

  /** Called from the planner side. Receives a per-camera click for the pin tap behavior. */
  onCameraPinClick(listener: (camera: ResolvedCamera) => void): void {
    this.cameraPinClickListener = listener;
  }

  /** Lookup a ResolvedCamera by id — useful when an external callsite has only the id. */
  getCameraById(id: string): ResolvedCamera | undefined {
    return this.cameraIndex.get(id);
  }

  renderCameras(cameras: readonly ResolvedCamera[]): void {
    this.cameraIndex.clear();
    for (const c of cameras) this.cameraIndex.set(c.id, c);

    const features = cameras.map((c) => ({
      type: 'Feature' as const,
      properties: {
        id: c.id,
        type: c.type,
        unknown_direction: c.directionConfidence === 'unknown' ? 1 : 0,
      },
      geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
    }));

    const featureCollection = { type: 'FeatureCollection' as const, features };

    const onStyleLoad = (): void => {
      if (this.map.getSource(CAMERA_SOURCE)) {
        (this.map.getSource(CAMERA_SOURCE) as maplibregl.GeoJSONSource).setData(featureCollection);
        return;
      }
      this.map.addSource(CAMERA_SOURCE, {
        type: 'geojson',
        data: featureCollection,
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 50,
      });
      this.map.addLayer({
        id: CLUSTER_LAYER,
        type: 'circle',
        source: CAMERA_SOURCE,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#3a5fff',
          'circle-radius': ['step', ['get', 'point_count'], 14, 50, 18, 200, 22, 1000, 28],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.5,
        },
      });
      this.map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: 'symbol',
        source: CAMERA_SOURCE,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 12,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#ffffff' },
      });
      this.map.addLayer({
        id: POINT_LAYER,
        type: 'circle',
        source: CAMERA_SOURCE,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#b91c1c',
          'circle-radius': 5,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      });
      this.map.addLayer({
        id: UNKNOWN_BADGE_LAYER,
        type: 'circle',
        source: CAMERA_SOURCE,
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'unknown_direction'], 1]],
        paint: {
          'circle-color': '#f9a825',
          'circle-radius': 3,
          'circle-translate': [6, -6],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      });

      // Cluster expansion on click
      this.map.on('click', CLUSTER_LAYER, (e) => {
        const features = this.map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER] });
        const clusterId = features[0]?.properties?.['cluster_id'];
        if (clusterId == null) return;
        const src = this.map.getSource(CAMERA_SOURCE) as maplibregl.GeoJSONSource;
        src.getClusterExpansionZoom(clusterId).then((zoom) => {
          const coords = (features[0]!.geometry as GeoJSON.Point).coordinates as [number, number];
          this.map.easeTo({ center: coords, zoom });
        }).catch(() => { /* ignore */ });
      });
      // Individual pin click
      this.map.on('click', POINT_LAYER, (e) => {
        const f = e.features?.[0];
        const id = f?.properties?.['id'] as string | undefined;
        if (id == null) return;
        const cam = this.cameraIndex.get(id);
        if (cam && this.cameraPinClickListener) this.cameraPinClickListener(cam);
      });
      // Cursor hints
      this.map.on('mouseenter', CLUSTER_LAYER, () => { this.map.getCanvas().style.cursor = 'pointer'; });
      this.map.on('mouseleave', CLUSTER_LAYER, () => { this.map.getCanvas().style.cursor = ''; });
      this.map.on('mouseenter', POINT_LAYER, () => { this.map.getCanvas().style.cursor = 'pointer'; });
      this.map.on('mouseleave', POINT_LAYER, () => { this.map.getCanvas().style.cursor = ''; });
    };

    if (this.map.isStyleLoaded()) {
      onStyleLoad();
    } else {
      this.map.once('load', onStyleLoad);
    }
  }

  renderComparison(cmp: RouteComparison): void {
    this.clearRoutes();
    this.addRouteLayer('shortest', cmp.shortest.polyline, '#b91c1c', true);
    if (!cmp.degradation) {
      this.addRouteLayer('private', cmp.private.polyline, '#15803d', false);
    }
    new maplibregl.Marker({ color: '#3a5fff' }).setLngLat([cmp.start.lon, cmp.start.lat]).addTo(this.map);
    new maplibregl.Marker({ color: '#3a5fff' }).setLngLat([cmp.end.lon, cmp.end.lat]).addTo(this.map);
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

Note: this also updates `renderComparison` to use brand colors (`#b91c1c` shortest, `#15803d` private) instead of the old `#d32f2f` and `#2e7d32`. The start/end pin color also moves to brand primary `#3a5fff`.

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
npm run lint
npx vite build 2>&1 | tail -5
```

All clean.

- [ ] **Step 3: Commit**

```bash
git add src/ui/mapView.ts
git commit -m "feat(ui): MapView rewrite — GeoJSON cluster source + symbol layers (was DOM markers)"
```

---

## Task 9b: MapView cone overlays (selected + show-all infrastructure)

**Files:**
- Modify: `src/ui/mapView.ts`

Adds cone fill layers + helper methods for the three cone-overlay states. Selected-camera cone uses the existing `buildConePolygon` + `coneForCamera` from `src/routing/`. The three cone layers are added during init but kept empty (`features: []`) until populated by their respective triggers.

- [ ] **Step 1: Extend `src/ui/mapView.ts` with cone layer helpers**

Add at top imports:

```ts
import type { ResolvedCamera } from '../data/resolvedCamera';
import type { ThreatProfile } from '../domain/threatProfile';
import { coneForCamera } from '../routing/coneFromProfile';
import { buildConePolygon } from '../routing/conePolygon';
```

(The first import may already be present from Task 9a.)

Add four new constants near the others:

```ts
const CONES_SELECTED_SOURCE = 'cones-selected';
const CONES_SELECTED_LAYER = 'cones-selected-fill';
const CONES_ROUTE_SOURCE = 'cones-along-route';
const CONES_ROUTE_LAYER = 'cones-along-route-fill';
const CONES_ALL_SOURCE = 'cones-all';
const CONES_ALL_LAYER = 'cones-all-fill';
```

Inside the `onStyleLoad` callback of `renderCameras`, after the existing layer adds, add three empty sources + paint layers:

```ts
      const emptyFC = { type: 'FeatureCollection' as const, features: [] };
      for (const [sourceId, layerId] of [
        [CONES_SELECTED_SOURCE, CONES_SELECTED_LAYER],
        [CONES_ROUTE_SOURCE, CONES_ROUTE_LAYER],
        [CONES_ALL_SOURCE, CONES_ALL_LAYER],
      ] as const) {
        if (!this.map.getSource(sourceId)) {
          this.map.addSource(sourceId, { type: 'geojson', data: emptyFC });
          this.map.addLayer({
            id: layerId,
            type: 'fill',
            source: sourceId,
            paint: {
              'fill-color': 'rgba(185, 28, 28, 0.18)',
              'fill-outline-color': 'rgba(185, 28, 28, 0.5)',
            },
          }, POINT_LAYER); // insert below the point layer so pins remain visible above
        }
      }
```

Add three new public methods on the class:

```ts
  /** Render a single camera's cone overlay (used when a pin is tapped). Clears when called with null. */
  setSelectedCameraCone(camera: ResolvedCamera | null, profile: ThreatProfile): void {
    this.setConeLayerData(CONES_SELECTED_SOURCE, camera ? [camera] : [], profile);
  }

  /** Render cones for cameras within `radiusMeters` of either route's polyline. */
  setConesAlongRoute(cameras: readonly ResolvedCamera[], profile: ThreatProfile): void {
    this.setConeLayerData(CONES_ROUTE_SOURCE, cameras, profile);
  }

  /** Render cones for every visible camera (the "show all" power-user toggle). */
  setConesAll(cameras: readonly ResolvedCamera[], profile: ThreatProfile): void {
    this.setConeLayerData(CONES_ALL_SOURCE, cameras, profile);
  }

  private setConeLayerData(
    sourceId: string,
    cameras: readonly ResolvedCamera[],
    profile: ThreatProfile,
  ): void {
    const src = this.map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const features = [];
    for (const cam of cameras) {
      const params = coneForCamera(cam, profile, () => Infinity);
      if (params === null) continue;
      const ring = buildConePolygon(params);
      features.push({
        type: 'Feature' as const,
        properties: { id: cam.id },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [ring.map(([lon, lat]) => [lon, lat] as [number, number])],
        },
      });
    }
    src.setData({ type: 'FeatureCollection', features });
  }
```

Also: clear the selected cone when the user clicks empty map background. In the existing constructor's `map.on('click', ...)` block, add:

```ts
    this.map.on('click', (e) => {
      // If the click didn't land on a cluster or pin, clear the selected cone.
      const features = this.map.queryRenderedFeatures(e.point, {
        layers: [CLUSTER_LAYER, POINT_LAYER].filter((id) => this.map.getLayer(id)),
      });
      if (features.length === 0) {
        const src = this.map.getSource(CONES_SELECTED_SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (src) src.setData({ type: 'FeatureCollection', features: [] });
      }
      if (this.clickListener) this.clickListener({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });
```

Replace the existing constructor `map.on('click', ...)` with this new version. (The constructor's `map.on('click', ...)` from Task 9a should be removed/replaced.)

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/mapView.ts
git commit -m "feat(ui): MapView cone layers — selected/along-route/all, plus tap-clear behavior"
```

---

## Task 9c: Wire cones-along-route after a route is planned

**Files:**
- Modify: `src/app.ts`

After `router.compareRoutes` completes successfully, find all cameras within 200m of either polyline and call `mapView.setConesAlongRoute(nearby, profile)`. This task only touches `app.ts` — the MapView API exists from Task 9b.

- [ ] **Step 1: Add a helper for "cameras near a polyline"**

Read the current `src/app.ts`. Add a helper function at the bottom (after `mountPlanner`):

```ts
import { CameraStore } from './data/cameraStore';
import type { ResolvedCamera } from './data/resolvedCamera';

const ROUTE_CONE_RADIUS_M = 200;

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

In `mountPlanner`, change the `onPlanRequested` callback. Find:

```ts
onPlanRequested: async (start, end) => {
  lastStart = start;
  lastEnd = end;
  const cmp = await router.compareRoutes(start, end, profile);
  if (!cmp.degradation) mapView.renderComparison(cmp);
  return cmp;
},
```

Replace with:

```ts
onPlanRequested: async (start, end) => {
  lastStart = start;
  lastEnd = end;
  const cmp = await router.compareRoutes(start, end, profile);
  if (!cmp.degradation) {
    mapView.renderComparison(cmp);
    const combinedPolyline = [...cmp.shortest.polyline, ...cmp.private.polyline];
    const nearby = camerasNearPolyline(cameraStore.all(), combinedPolyline);
    mapView.setConesAlongRoute(nearby, profile);
  } else {
    mapView.setConesAlongRoute([], profile);
  }
  return cmp;
},
```

`cameraStore` is captured from the outer `startApp` scope. Ensure `mountPlanner`'s signature accepts it (or it's already in scope via closure — check the existing code; if not, add `cameraStore` as a parameter).

- [ ] **Step 2: Verify build + tests**

```bash
npx tsc --noEmit
npm run lint
npm test 2>&1 | tail -3
```

- [ ] **Step 3: Commit**

```bash
git add src/app.ts
git commit -m "feat(app): render cones along the planned route (within 200m of either polyline)"
```

---

## Task 9d: ShowAllConesToggle wired to MapView

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1: Mount the toggle in `startApp`**

Add import:

```ts
import { mountShowAllConesToggle } from './ui/showAllConesToggle';
```

In `startApp`, after creating `mapView` and before `showPicker`, add:

```ts
  // Top-right map controls container
  const mapEl = document.getElementById('map');
  if (mapEl) {
    const controls = document.createElement('div');
    controls.style.cssText =
      'position:absolute;top:var(--space-3);right:var(--space-3);z-index:5;' +
      'display:flex;flex-direction:column;gap:var(--space-2)';
    mapEl.appendChild(controls);
    let currentProfile: ThreatProfile | null = null;
    const toggleHandle = mountShowAllConesToggle(controls, {
      onChange: (pressed) => {
        if (!currentProfile) return;
        mapView.setConesAll(pressed ? cameraStore.all() : [], currentProfile);
      },
    });
    // Expose so mountPlanner can update currentProfile when user picks/swaps
    (window as unknown as { __flockavoidProfile: (p: ThreatProfile) => void }).__flockavoidProfile = (p) => {
      currentProfile = p;
      // If toggle is already on, refresh with new profile's cone sizing
      // (we read the toggle's pressed state by querying the DOM)
      const btn = controls.querySelector('button[data-action="toggle-all-cones"]') as HTMLButtonElement | null;
      if (btn && btn.getAttribute('aria-pressed') === 'true') {
        mapView.setConesAll(cameraStore.all(), p);
      }
    };
    void toggleHandle; // toggleHandle.setPressed available for future profile-swap state restore
  }
```

The `#map` element needs `position:relative` for the absolute-positioned controls to anchor correctly. Verify that the existing `index.html` declares `#map` with `flex:1` (which doesn't establish positioning context). Add `position:relative` to its inline style.

In `mountPlanner`, call the global hook after the planner is mounted:

```ts
  // Notify the cones-all toggle of the current profile
  const updateProfile = (window as unknown as { __flockavoidProfile?: (p: ThreatProfile) => void }).__flockavoidProfile;
  if (updateProfile) updateProfile(profile);
```

(The global window hook is a pragmatic shortcut to avoid threading a profile-getter through 3 layers of callbacks. Phase 0b-3b's larger refactor will replace this with a proper state store.)

Modify `index.html` `#map` style to add `position:relative`:

```html
<div id="map" style="flex:1;position:relative"></div>
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/app.ts index.html
git commit -m "feat(app): mount ShowAllConesToggle in top-right map controls"
```

---

## Task 10: Restyle ProfilePicker

**Files:**
- Modify: `src/ui/profilePicker.ts`

Drop the emoji icons (`🚗 📣 🛡️ ⚙️`) in favor of simple SVG circles colored by accent. Apply brand tokens to the card styles.

- [ ] **Step 1: Replace `src/ui/profilePicker.ts`**

```ts
import {
  COMMUTER_PROFILE, ACTIVIST_PROFILE, VULNERABLE_PROFILE,
  type ThreatProfile,
} from '../domain/threatProfile';

interface Preset {
  profile: ThreatProfile;
  label: string;
  sub: string;
  swatchColor: string;
}

const PRESETS: Preset[] = [
  { profile: COMMUTER_PROFILE,   label: 'Commuter',   sub: 'Routes stay close to the shortest path.',         swatchColor: 'var(--color-state-success)' },
  { profile: ACTIVIST_PROFILE,   label: 'Activist',   sub: 'Detours around sensitive areas (~10–20% extra).', swatchColor: 'var(--color-state-warning)' },
  { profile: VULNERABLE_PROFILE, label: 'Vulnerable', sub: 'Max avoidance, accepts significant detours.',     swatchColor: 'var(--color-state-danger)' },
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
  heading.style.cssText =
    'margin:0 0 var(--space-3);font-family:var(--font-family-sans);' +
    'font-size:var(--font-size-lg);font-weight:600;color:var(--color-brand-ink)';
  container.appendChild(heading);

  for (const preset of PRESETS) {
    container.appendChild(presetCard(preset.label, preset.sub, preset.swatchColor, () => callbacks.onPresetPicked(preset.profile)));
  }
  container.appendChild(presetCard('Custom', 'Configure exactly how aggressively to avoid which cameras.', 'var(--color-brand-primary)', callbacks.onCustomPicked));
}

function presetCard(label: string, sub: string, swatchColor: string, onClick: () => void): HTMLElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.style.cssText =
    'display:flex;align-items:flex-start;gap:var(--space-3);width:100%;text-align:left;' +
    'padding:var(--space-3);margin-bottom:var(--space-2);' +
    'border:1px solid var(--color-brand-border);border-radius:var(--radius-md);' +
    'background:var(--color-brand-surface);cursor:pointer;font-family:var(--font-family-sans);' +
    'transition:border-color 0.15s, box-shadow 0.15s';
  card.addEventListener('mouseenter', () => {
    card.style.borderColor = 'var(--color-brand-primary)';
    card.style.boxShadow = 'var(--shadow-sm)';
  });
  card.addEventListener('mouseleave', () => {
    card.style.borderColor = 'var(--color-brand-border)';
    card.style.boxShadow = 'none';
  });
  card.innerHTML = `
    <div style="width:10px;height:10px;border-radius:50%;background:${swatchColor};margin-top:6px;flex-shrink:0"></div>
    <div style="flex:1">
      <div style="font-weight:600;color:var(--color-brand-ink);font-size:var(--font-size-base)">${label}</div>
      <div style="font-size:var(--font-size-xs);color:var(--color-brand-ink-muted);margin-top:var(--space-1)">${sub}</div>
    </div>
  `;
  card.addEventListener('click', onClick);
  return card;
}
```

- [ ] **Step 2: Verify build**

```bash
npx tsc --noEmit
npm run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/profilePicker.ts
git commit -m "feat(ui): restyle ProfilePicker — brand tokens, color-coded swatches replace emoji"
```

---

## Task 11: Restyle CustomProfileEditor

**Files:**
- Modify: `src/ui/customProfileEditor.ts`

Apply brand tokens to all inline styles. Use `accent-color` to brand the range inputs natively.

- [ ] **Step 1: Update style strings throughout `src/ui/customProfileEditor.ts`**

Read the current file. The structural code (loadStored, the render function's outline, sliderRow, weightRow, Apply button) stays. Only the inline `style.cssText` strings change. Replace:

- The container's heading: add `font-family:var(--font-family-sans);font-size:var(--font-size-lg);font-weight:600;color:var(--color-brand-ink)`
- The disclosure button: `background:var(--color-brand-primary-soft);color:var(--color-brand-ink);border-radius:var(--radius-md);font-family:var(--font-family-sans);font-size:var(--font-size-sm)` (keep the existing layout)
- `sliderRow`: label uses `color:var(--color-brand-ink);font-family:var(--font-family-sans);font-size:var(--font-size-sm)`. The input adds `accent-color:var(--color-brand-primary)` to its style.
- `weightRow`: same treatment as sliderRow at `font-size:var(--font-size-xs)` for the label.
- The "Save as my default" label: `color:var(--color-brand-ink-muted);font-size:var(--font-size-xs);font-family:var(--font-family-sans)`
- Apply button: `background:var(--color-brand-primary);color:#fff;border-radius:var(--radius-md);font-family:var(--font-family-sans);font-size:var(--font-size-base);font-weight:600;padding:var(--space-3)`

The exhaustive replacement of inline style strings. Read the file, identify each `style.cssText = '...'` assignment, and rewrite to use the tokens above. Keep all event handlers and logic unchanged.

After the rewrite, the file should still have the same exported `renderCustomProfileEditor` signature and pass all existing `tests/unit/ui/customProfileEditor.test.ts` tests.

- [ ] **Step 2: Run existing tests**

```bash
npx vitest run tests/unit/ui/customProfileEditor.test.ts
```

Expected: 6 tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/ui/customProfileEditor.ts
git commit -m "feat(ui): restyle CustomProfileEditor with brand tokens + accent-color sliders"
```

---

## Task 12: Restyle RoutePlanner + consume ErrorBanner

**Files:**
- Modify: `src/ui/routePlanner.ts`

Restyle all inline styles to brand tokens. Replace the existing inline error rendering (`renderError`, `clearError`) with calls to `errorBanner.ts` (Task 3).

- [ ] **Step 1: Replace `src/ui/routePlanner.ts`**

```ts
import type { GeoPoint, RouteComparison, RouteDegradation } from '../domain/route';
import type { ThreatProfile } from '../domain/threatProfile';
import { mountErrorBanner, clearErrorBanners } from './errorBanner';

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
    initial?: { readonly start: GeoPoint; readonly end: GeoPoint },
  ) {
    if (initial) {
      this.state.start = initial.start;
      this.state.end = initial.end;
    }
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
    heading.textContent = `Plan route — ${this.profile.preset}`;
    heading.style.cssText =
      'margin:0 0 var(--space-3);font-family:var(--font-family-sans);' +
      'font-size:var(--font-size-lg);font-weight:600;color:var(--color-brand-ink)';
    this.container.appendChild(heading);

    this.container.appendChild(this.pointRow('Start', this.state.start, 'start'));
    this.container.appendChild(this.pointRow('End', this.state.end, 'end'));

    const plan = document.createElement('button');
    plan.type = 'button';
    plan.textContent = 'Plan route';
    plan.disabled = !(this.state.start && this.state.end);
    plan.style.cssText =
      'display:block;width:100%;padding:var(--space-3);margin-top:var(--space-3);' +
      'background:var(--color-brand-primary);color:#fff;border:0;' +
      'border-radius:var(--radius-md);cursor:pointer;font-family:var(--font-family-sans);' +
      'font-size:var(--font-size-base);font-weight:600;opacity:1';
    if (plan.disabled) plan.style.opacity = '0.4';
    plan.addEventListener('click', () => void this.runPlan());
    this.container.appendChild(plan);
  }

  private pointRow(label: string, value: GeoPoint | null, kind: 'start' | 'end'): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText =
      'padding:var(--space-3);border:1px solid var(--color-brand-border);' +
      'border-radius:var(--radius-md);margin-bottom:var(--space-2);' +
      'font-family:var(--font-family-sans)';
    const text = value
      ? `${label}: ${value.lat.toFixed(4)}, ${value.lon.toFixed(4)}`
      : `${label}: not set`;
    row.innerHTML = `<div style="font-size:var(--font-size-sm);color:var(--color-brand-ink)">${text}</div>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent =
      this.state.awaiting === kind ? `Click map for ${label}…` : `Set ${label} on map`;
    btn.style.cssText =
      'margin-top:var(--space-2);padding:var(--space-1) var(--space-3);' +
      'background:var(--color-brand-surface);border:1px solid var(--color-brand-border);' +
      'border-radius:var(--radius-sm);cursor:pointer;font-family:var(--font-family-sans);' +
      'font-size:var(--font-size-xs);color:var(--color-brand-ink)';
    btn.addEventListener('click', () => {
      this.state.awaiting = kind;
      this.render();
    });
    row.appendChild(btn);
    return row;
  }

  private async runPlan(): Promise<void> {
    if (!this.state.start || !this.state.end) return;
    clearErrorBanners(this.container);
    try {
      const cmp = await this.callbacks.onPlanRequested(this.state.start, this.state.end);
      if (cmp.degradation) {
        this.renderDegradation(cmp.degradation);
      } else {
        this.renderComparison(cmp);
      }
    } catch (err) {
      mountErrorBanner(this.container, err instanceof Error ? err.message : String(err));
    }
  }

  private renderDegradation(degradation: RouteDegradation): void {
    const panel = document.createElement('div');
    panel.dataset['degradationPanel'] = 'true';
    panel.style.cssText =
      'margin-top:var(--space-4);padding:var(--space-3);' +
      'border:1px solid var(--color-state-warning);border-radius:var(--radius-md);' +
      'background:var(--color-state-warning-soft);font-family:var(--font-family-sans)';
    const heading = document.createElement('strong');
    heading.textContent = 'No private route possible with this profile';
    heading.style.cssText = `color:var(--color-state-warning);font-size:var(--font-size-base)`;
    panel.appendChild(heading);
    const body = document.createElement('p');
    body.style.cssText = 'margin:var(--space-2) 0;font-size:var(--font-size-sm);color:var(--color-brand-ink)';
    body.textContent = 'Try a different profile:';
    panel.appendChild(body);
    for (const preview of degradation.alternativePreviews) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset['profileSwap'] = preview.profile.preset;
      btn.style.cssText =
        'display:block;width:100%;padding:var(--space-2);margin-bottom:var(--space-1);' +
        'background:var(--color-brand-surface);border:1px solid var(--color-state-warning);' +
        'border-radius:var(--radius-sm);cursor:pointer;font-family:var(--font-family-sans);' +
        'text-align:left;font-size:var(--font-size-sm);color:var(--color-brand-ink)';
      btn.textContent = `Use ${cap(preview.profile.preset)} (would avoid ~${preview.camerasAvoidedEstimate} cameras)`;
      btn.addEventListener('click', () => this.callbacks.onProfileSwap?.(preview.profile));
      panel.appendChild(btn);
    }
    this.container.appendChild(panel);
  }

  private renderComparison(cmp: RouteComparison): void {
    const panel = document.createElement('div');
    panel.style.cssText =
      'margin-top:var(--space-4);padding-top:var(--space-4);' +
      'border-top:1px solid var(--color-brand-border);font-family:var(--font-family-sans)';
    panel.innerHTML = `
      <div style="padding:var(--space-3);border:2px solid var(--color-state-danger);border-radius:var(--radius-md);margin-bottom:var(--space-2);background:var(--color-state-danger-soft)">
        <div style="display:flex;justify-content:space-between">
          <strong style="color:var(--color-state-danger);font-size:var(--font-size-base)">Shortest</strong>
          <span style="color:var(--color-brand-ink);font-size:var(--font-size-base)">${formatDuration(cmp.shortest.durationSeconds)}</span>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--color-brand-ink-muted);margin-top:var(--space-1)">
          ${cmp.shortest.camerasOnRoute} cameras · score ${cmp.shortest.surveillanceScore.toFixed(0)}
        </div>
      </div>
      <div style="padding:var(--space-3);border:2px solid var(--color-state-success);border-radius:var(--radius-md);background:var(--color-state-success-soft);margin-bottom:var(--space-2)">
        <div style="display:flex;justify-content:space-between">
          <strong style="color:var(--color-state-success);font-size:var(--font-size-base)">Private</strong>
          <span style="color:var(--color-brand-ink);font-size:var(--font-size-base)">${formatDuration(cmp.private.durationSeconds)}</span>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--color-brand-ink-muted);margin-top:var(--space-1)">
          ${cmp.private.camerasOnRoute} cameras · score ${cmp.private.surveillanceScore.toFixed(0)}
        </div>
      </div>
      <div style="padding:var(--space-3);background:var(--color-state-success-soft);border-radius:var(--radius-md);text-align:center;font-size:var(--font-size-sm);color:var(--color-brand-ink)">
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

- [ ] **Step 2: Verify build + run existing Playwright benchmark**

```bash
npx tsc --noEmit
npm run lint
npx playwright test tests/benchmark/routes/atlanta.spec.ts 2>&1 | tail -5
```

(The benchmark may fail because the welcome modal isn't dismissed — Task 16 fixes that. For now, ignore Playwright failures in this task; only assert tsc + lint clean.)

- [ ] **Step 3: Commit**

```bash
git add src/ui/routePlanner.ts
git commit -m "feat(ui): RoutePlanner — restyled to brand tokens; delegates errors to errorBanner"
```

---

## Task 13: Restyle DatasetFreshness

**Files:**
- Modify: `src/ui/datasetFreshness.ts`

Just CSS tokens. No logic change.

- [ ] **Step 1: Replace styles in `src/ui/datasetFreshness.ts`**

Replace the function body's style strings:

```ts
export function renderDatasetFreshness(
  container: HTMLElement,
  props: DatasetFreshnessProps,
): void {
  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'display:flex;justify-content:space-between;align-items:center;' +
    'padding:var(--space-2) var(--space-3);font-size:var(--font-size-xs);' +
    'color:var(--color-brand-ink-muted);border-bottom:1px solid var(--color-brand-border);' +
    'margin-bottom:var(--space-2);font-family:var(--font-family-sans)';

  const label = document.createElement('span');
  label.textContent = `Data: ${describeAge(props.generatedAt)}`;
  wrapper.appendChild(label);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset['action'] = 'refresh-dataset';
  btn.textContent = 'refresh';
  btn.style.cssText =
    'padding:0 var(--space-1);font:inherit;font-size:var(--font-size-xs);' +
    'background:none;border:0;color:var(--color-brand-primary);' +
    'cursor:pointer;text-decoration:underline';
  btn.addEventListener('click', props.onRefresh);
  wrapper.appendChild(btn);

  container.appendChild(wrapper);
}
```

Keep `describeAge` unchanged.

- [ ] **Step 2: Verify tests still pass**

```bash
npx vitest run tests/unit/ui/datasetFreshness.test.ts
```

Expected: 2 tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/ui/datasetFreshness.ts
git commit -m "feat(ui): DatasetFreshness restyled with brand tokens"
```

---

## Task 14: Wire it together in app.ts + main.ts

**Files:**
- Modify: `src/app.ts`
- Modify: `src/main.ts`

Three changes: import the CSS tokens at bootstrap, mount the welcome modal before app interaction, switch the sidebar mount point to use `BottomSheet`, swap the camera-loaded path through `LoadingSkeleton`.

- [ ] **Step 1: Modify `src/main.ts` to import tokens.css**

Replace the existing main.ts contents:

```ts
import './brand/tokens.css';
import { startApp } from './app';

void startApp().catch((err) => {
  console.error('Failed to start app', err);
  const el = document.getElementById('app');
  if (el) el.textContent = `Startup error: ${(err as Error).message}`;
});
```

- [ ] **Step 2: Replace `src/app.ts` with the integrated wire-up**

Read the current file. The new structure: tokens are already imported by main.ts. `startApp` mounts the welcome modal first if it should show, then proceeds. The sidebar mount becomes a `BottomSheet` whose contentRoot is what the picker/planner/freshness components mount into.

```ts
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapView } from './ui/mapView';
import { renderProfilePicker } from './ui/profilePicker';
import { renderCustomProfileEditor } from './ui/customProfileEditor';
import { RoutePlanner } from './ui/routePlanner';
import { renderDatasetFreshness } from './ui/datasetFreshness';
import { renderCameraDetailPopup } from './ui/cameraDetailPopup';
import { mountWelcomeModal, shouldShowWelcomeModal } from './ui/welcomeModal';
import { mountLoadingSkeleton, clearLoadingSkeleton } from './ui/loadingSkeleton';
import { mountShowAllConesToggle } from './ui/showAllConesToggle';
import { BottomSheet } from './ui/bottomSheet';
import { CameraStore } from './data/cameraStore';
import { ValhallaClient } from './routing/valhallaClient';
import { Router } from './routing/router';
import { parseDatasetManifest } from './data/datasetManifest';
import { isAllowedUrl } from './privacy/networkAllowlist';
import type { GeoPoint } from './domain/route';
import type { ThreatProfile } from './domain/threatProfile';
import type { ResolvedCamera } from './data/resolvedCamera';

const ATLANTA_CENTER: GeoPoint = { lat: 33.7500, lon: -84.3890 };
const VALHALLA_URL = '/valhalla';
const LOCAL_SEED_URL = '/data/cameras-atlanta-seed.json';
const RELEASE_DATASET_URL = 'https://github.com/stevenkozeniesky02/flock-avoid/releases/latest/download/cameras-us.json';
const MANIFEST_URL_LIVE = 'https://github.com/stevenkozeniesky02/flock-avoid/releases/latest/download/cameras-us.json.meta.json';
const CAMERA_DATASET_URL = import.meta.env['VITE_USE_LOCAL_SEED'] === 'true'
  ? LOCAL_SEED_URL
  : RELEASE_DATASET_URL;
const MANIFEST_URL = import.meta.env['VITE_USE_LOCAL_SEED'] === 'true'
  ? null
  : MANIFEST_URL_LIVE;
const ROUTE_CONE_RADIUS_M = 200;

export async function startApp(): Promise<void> {
  const sidebarMount = document.getElementById('sidebar');
  if (!sidebarMount) throw new Error('#sidebar missing');

  // Welcome modal first
  if (shouldShowWelcomeModal()) {
    await new Promise<void>((resolve) => {
      mountWelcomeModal(document.body, { onDismiss: resolve });
    });
  }

  // Mount the responsive container; everything else mounts inside its contentRoot
  const bottomSheet = new BottomSheet(sidebarMount);
  const sidebar = bottomSheet.contentRoot();

  // Loading skeleton while the dataset loads
  mountLoadingSkeleton(sidebar);

  const cameraStore = await CameraStore.loadFromUrl(CAMERA_DATASET_URL);
  const mapView = new MapView('map', ATLANTA_CENTER);
  mapView.renderCameras(cameraStore.all());

  const router = new Router(new ValhallaClient(VALHALLA_URL), cameraStore, VALHALLA_URL);

  // Wire pin-tap → cone + popup
  let popupEl: HTMLElement | null = null;
  let currentProfile: ThreatProfile | null = null;
  mapView.onCameraPinClick((cam) => {
    if (!currentProfile) return;
    mapView.setSelectedCameraCone(cam, currentProfile);
    if (popupEl) popupEl.remove();
    popupEl = document.createElement('div');
    popupEl.style.cssText = 'position:absolute;top:var(--space-3);left:var(--space-3);z-index:5';
    document.getElementById('map')?.appendChild(popupEl);
    renderCameraDetailPopup(popupEl, cam, () => {
      mapView.setSelectedCameraCone(null, currentProfile!);
      if (popupEl) { popupEl.remove(); popupEl = null; }
    });
  });

  // Manifest fetch (best-effort) for freshness banner
  let manifestGeneratedAt: string | null = null;
  if (MANIFEST_URL) {
    if (!isAllowedUrl(MANIFEST_URL)) {
      throw new Error(`Manifest URL not in allowlist: ${MANIFEST_URL}`);
    }
    try {
      const resp = await fetch(MANIFEST_URL);
      if (resp.ok) {
        const manifest = parseDatasetManifest(await resp.text());
        manifestGeneratedAt = manifest.generatedAt;
      }
    } catch {
      // best-effort
    }
  }

  clearLoadingSkeleton(sidebar);

  // Freshness banner at the top of the sidebar
  if (manifestGeneratedAt) {
    const freshnessSlot = document.createElement('div');
    sidebar.insertBefore(freshnessSlot, sidebar.firstChild);
    renderDatasetFreshness(freshnessSlot, {
      generatedAt: manifestGeneratedAt,
      onRefresh: () => { window.location.reload(); },
    });
  }

  // Top-right map controls — "Show all cones" toggle
  const mapEl = document.getElementById('map');
  if (mapEl) {
    const controls = document.createElement('div');
    controls.style.cssText =
      'position:absolute;top:var(--space-3);right:var(--space-3);z-index:5;' +
      'display:flex;flex-direction:column;gap:var(--space-2)';
    mapEl.appendChild(controls);
    mountShowAllConesToggle(controls, {
      onChange: (pressed) => {
        if (!currentProfile) return;
        mapView.setConesAll(pressed ? cameraStore.all() : [], currentProfile);
      },
    });
  }

  const onProfileSelected = (profile: ThreatProfile): void => {
    currentProfile = profile;
  };

  showPicker(sidebar, mapView, router, cameraStore, onProfileSelected);
}

function showPicker(
  sidebar: HTMLElement,
  mapView: MapView,
  router: Router,
  cameraStore: CameraStore,
  onProfileSelected: (p: ThreatProfile) => void,
): void {
  // Preserve the freshness banner (first child) — only replace what's below it
  removeChildrenAfterFirst(sidebar);
  renderProfilePicker(sidebar, {
    onPresetPicked: (profile) => { onProfileSelected(profile); mountPlanner(sidebar, mapView, router, cameraStore, profile, onProfileSelected); },
    onCustomPicked: () => {
      removeChildrenAfterFirst(sidebar);
      renderCustomProfileEditor(sidebar, {
        onApply: (profile) => { onProfileSelected(profile); mountPlanner(sidebar, mapView, router, cameraStore, profile, onProfileSelected); },
      });
    },
  });
}

function mountPlanner(
  sidebar: HTMLElement,
  mapView: MapView,
  router: Router,
  cameraStore: CameraStore,
  profile: ThreatProfile,
  onProfileSelected: (p: ThreatProfile) => void,
  initial?: { start: GeoPoint; end: GeoPoint },
): void {
  removeChildrenAfterFirst(sidebar);
  let lastStart: GeoPoint | null = initial?.start ?? null;
  let lastEnd: GeoPoint | null = initial?.end ?? null;
  const planner = new RoutePlanner(
    sidebar,
    {
      onPlanRequested: async (start, end) => {
        lastStart = start;
        lastEnd = end;
        const cmp = await router.compareRoutes(start, end, profile);
        if (!cmp.degradation) {
          mapView.renderComparison(cmp);
          const combinedPolyline = [...cmp.shortest.polyline, ...cmp.private.polyline];
          const nearby = camerasNearPolyline(cameraStore.all(), combinedPolyline);
          mapView.setConesAlongRoute(nearby, profile);
        } else {
          mapView.setConesAlongRoute([], profile);
        }
        return cmp;
      },
      onProfileSwap: (newProfile) => {
        onProfileSelected(newProfile);
        if (lastStart && lastEnd) {
          mountPlanner(sidebar, mapView, router, cameraStore, newProfile, onProfileSelected, { start: lastStart, end: lastEnd });
        } else {
          mountPlanner(sidebar, mapView, router, cameraStore, newProfile, onProfileSelected);
        }
      },
    },
    profile,
    initial,
  );
  mapView.onClick((p) => planner.handleMapClick(p));
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

function removeChildrenAfterFirst(el: HTMLElement): void {
  while (el.childNodes.length > 1) el.removeChild(el.lastChild!);
}
```

`CameraStore.distanceMeters` is a static method on the class, so the single `import { CameraStore }` covers both the instance type and the static helper usage.

- [ ] **Step 3: Verify build**

```bash
npx tsc --noEmit
npm run lint
npx vite build 2>&1 | tail -5
```

All clean.

- [ ] **Step 4: Commit**

```bash
git add src/app.ts src/main.ts
git commit -m "feat(app): wire welcome modal + bottom sheet + skeleton + tap-pin → popup + cones-along-route"
```

---

## Task 15: Update index.html

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Update meta + remove redundant inline styles + add theme-color**

Replace `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#3a5fff" />
    <title>FlockAvoid — Route around surveillance</title>
  </head>
  <body style="margin:0;background:var(--color-brand-canvas);color:var(--color-brand-ink);font-family:var(--font-family-sans)">
    <div id="app" style="display:flex;height:100vh">
      <div id="sidebar" style="flex-shrink:0"></div>
      <div id="map" style="flex:1;position:relative"></div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Note: BottomSheet (Task 6) takes over the `#sidebar` mount — on desktop it renders 340px wide; on mobile it fixed-positions itself to the bottom of the viewport and the `#sidebar` mount's flex-shrink doesn't matter (the sheet renders out-of-flow). Keep `flex-shrink:0` so the desktop sidebar doesn't collapse if `#map` is greedy.

- [ ] **Step 2: Verify build**

```bash
npx vite build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "chore(html): theme-color meta + brand-canvas body + bigger title"
```

---

## Task 16: Update existing E2E tests to dismiss welcome modal

**Files:**
- Modify: `tests/benchmark/helpers/benchmarkHarness.ts`
- Modify: `tests/privacy/networkInvariants.spec.ts`

The welcome modal now blocks interaction on first launch. Each Playwright test that visits the app needs to dismiss it.

- [ ] **Step 1: Add dismiss helper to benchmarkHarness**

Read the current `tests/benchmark/helpers/benchmarkHarness.ts`. Add a helper at the top (after imports):

```ts
export async function dismissWelcomeModalIfPresent(page: import('@playwright/test').Page): Promise<void> {
  // Modal may or may not be present depending on the localStorage state of the Playwright context.
  // Use a short timeout so absence isn't a long wait.
  const btn = page.locator('button[data-action="welcome-dismiss"]');
  try {
    await btn.waitFor({ state: 'visible', timeout: 1500 });
    await btn.click();
  } catch {
    // Modal wasn't present — nothing to do
  }
}
```

In the existing `planRoute` function, after `await page.goto('/')`, add:

```ts
  await dismissWelcomeModalIfPresent(page);
```

- [ ] **Step 2: Use the helper in `networkInvariants.spec.ts`**

Read the current file. In every test, after `await page.goto('/')`, add (importing the helper):

```ts
import { dismissWelcomeModalIfPresent } from '../benchmark/helpers/benchmarkHarness';
// ...
await dismissWelcomeModalIfPresent(page);
```

For the `planRoute` helper that's also defined in this file, add the dismiss inline.

- [ ] **Step 3: Run Playwright**

```bash
npx playwright test 2>&1 | tail -15
```

Expected: All tests pass (Atlanta benchmark, privacy invariants); 36 city tests still skip.

- [ ] **Step 4: Commit**

```bash
git add tests/benchmark/helpers/benchmarkHarness.ts tests/privacy/networkInvariants.spec.ts
git commit -m "test: dismiss welcome modal at the start of each Playwright test"
```

---

## Task 17: Lighthouse smoke check

**Files:** none (verification only)

- [ ] **Step 1: Build the production bundle**

```bash
npm run build 2>&1 | tail -5
```

Expected: clean build.

- [ ] **Step 2: Start preview server + run Lighthouse**

(Operator step — needs Chrome installed.)

```bash
npm run preview &
sleep 3
npx --yes lighthouse http://localhost:4173 \
  --preset=desktop \
  --only-categories=accessibility,performance,best-practices \
  --output=json --output-path=./lighthouse-desktop.json \
  --chrome-flags="--headless"
npx --yes lighthouse http://localhost:4173 \
  --emulated-form-factor=mobile \
  --only-categories=accessibility,performance,best-practices \
  --output=json --output-path=./lighthouse-mobile.json \
  --chrome-flags="--headless"
kill %1
```

- [ ] **Step 3: Verify scores**

```bash
jq '.categories.accessibility.score, .categories.performance.score' lighthouse-mobile.json
jq '.categories.accessibility.score, .categories.performance.score' lighthouse-desktop.json
```

Target: accessibility ≥ 0.90 on both. Performance ≥ 0.90 on mobile preferred (it's a local preview server so network is unrealistic; accept ≥ 0.80 if 0.90 isn't reachable from the basic restyle). If accessibility < 0.90, surface as CONCERN and dispatch a follow-up fix task for the specific Lighthouse-reported issues (likely color-contrast or missing aria-labels).

- [ ] **Step 4: Add lighthouse JSON outputs to .gitignore**

```bash
grep -q "lighthouse-.*\.json" .gitignore || echo "lighthouse-*.json" >> .gitignore
git add .gitignore
git commit -m "chore: gitignore lighthouse output files"
```

No source commit — this task is verification + cleanup only.

---

## Done — Exit Checklist

Before merging `feat/phase-0b-3a-look-and-feel` to master, verify:

- [ ] `npm run lint` clean
- [ ] `npx tsc --noEmit` clean
- [ ] `npx vitest run` — all unit + integration tests pass (120 baseline + ~15 new = ~135)
- [ ] `npx playwright test` — all Atlanta benchmarks + privacy invariants pass; 36 city tests still skip
- [ ] Manual smoke: open `npm run dev` in a fresh incognito window → welcome modal appears; click "Get started" → branded UI appears with profile picker
- [ ] Manual smoke: resize browser to <720px width → sidebar collapses into a draggable bottom sheet at the bottom of the viewport
- [ ] Manual smoke: zoom out to regional view → cameras render as numbered indigo clusters; tap a cluster → zooms in; tap a single pin → cone + popup appears
- [ ] Manual smoke: plan a route → cones automatically appear around cameras within 200m of either route
- [ ] Manual smoke: top-right "Show all cones" toggle button activates the show-all overlay
- [ ] Lighthouse mobile + accessibility scores ≥ 0.90 against local preview build
- [ ] No new external network hosts in the privacy allowlist (Inter is self-hosted; no `fonts.googleapis.com` request)
- [ ] All Phase 0a / 0b-1 / 0b-2 tests still pass

If all pass, the spike has graduated to a real product look. Merge to master, then start Phase 0b-3b (Wayfinding + Deploy) brainstorm.
