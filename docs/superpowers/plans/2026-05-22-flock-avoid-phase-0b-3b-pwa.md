# Phase 0b-3b · Sub-project D — PWA + Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Flock-Avoid an installable Progressive Web App with a hand-rolled service worker that keeps the app shell, recent map tiles, and the camera dataset usable offline — without adding any new browser-facing host, any phone-home, or any third-party dependency.

**Spec:** `docs/superpowers/specs/2026-05-22-flock-avoid-phase-0b-3b-pwa.md`
**Branch:** `feat/phase-0b-3b-pwa` (stacked on `feat/phase-0b-3b-full-us-valhalla`)
**Baseline:** vitest + Playwright (privacy + e2e) green on `feat/phase-0b-3b-full-us-valhalla`. Atlanta benchmark in a known pre-existing red state (PR #4 sibling fix not yet merged down); do not regress further.

---

## File Structure (created or modified by this plan)

```
index.html                              MODIFY · manifest link, apple-touch-icon, v0.2 theme-color

public/
  manifest.webmanifest                  NEW
  sw.js                                 NEW    · plain JS, runtime caching only
  icons/
    icon.svg                            NEW
    icon-192.png                        NEW    · generated, committed
    icon-512.png                        NEW    · generated, committed
    icon-maskable-192.png               NEW    · generated, committed
    icon-maskable-512.png               NEW    · generated, committed

scripts/
  build-pwa-icons.ts                    NEW    · deterministic PNG generator (Node zlib only)

src/
  main.ts                               MODIFY · register SW after app boot, mount update prompt host
  pwa/
    registerServiceWorker.ts            NEW
    updatePrompt.ts                     NEW
    cacheStrategy.ts                    NEW    · pure URL → strategy classifier
    cacheEviction.ts                    NEW    · pure FIFO-bounded eviction picker

tests/
  unit/pwa/
    cacheStrategy.test.ts               NEW
    cacheEviction.test.ts               NEW
    manifest.test.ts                    NEW
    serviceWorker.test.ts               NEW
    updatePrompt.test.ts                NEW
  e2e/pwa.spec.ts                       NEW
  privacy/networkInvariants.spec.ts     MODIFY · add SW-active second-pass assertion

docs/
  superpowers/specs/2026-05-22-flock-avoid-phase-0b-3b-pwa.md       (spec, exists)
  superpowers/plans/2026-05-22-flock-avoid-phase-0b-3b-pwa.md       (this file)
```

**Dependency graph (task order):**

```
01 (pure helpers + tests)
   ├── cacheStrategy.ts + test
   └── cacheEviction.ts + test
02 (icon generator + committed PNGs) ── independent of code
03 (manifest.webmanifest + manifest.test)  ── needs 02 (icon files exist)
04 (sw.js + serviceWorker.test) ── needs 01 (strategy + eviction logic)
05 (registerServiceWorker.ts) ── needs 04 (registers /sw.js)
06 (updatePrompt.ts + test) ── independent of SW
07 (index.html updates) ── needs 03 (manifest path), 02 (icon paths)
08 (src/main.ts wiring) ── needs 05, 06
09 (Playwright e2e/pwa.spec.ts) ── needs 03, 04, 05, 07, 08
10 (privacy invariant extension) ── needs 04, 05, 08
11 (verification: tsc, lint, vitest, playwright, build) ── needs all above
12 (commit, push, PR) ── needs 11 passing
```

---

## Pre-flight (before Task 1)

- [ ] Confirm you are on `feat/phase-0b-3b-pwa` (created off `feat/phase-0b-3b-full-us-valhalla`).
- [ ] Run baseline:
      `npx tsc --noEmit` → 0 errors.
      `npm run lint` → 0 errors (one pre-existing warning in `tests/unit/geocode/photonClient.test.ts` is acceptable; do not introduce new ones).
      `npm test` → all 255+ tests pass.
- [ ] Confirm Vite serves `public/` verbatim by spot-checking `npm run dev` then `curl http://localhost:5173/data/cameras-atlanta-seed.json -I` → 200. (No new file needed yet; this just confirms the channel.)
- [ ] If baseline fails, STOP and report; do not start until green.

---

## Task 1 — Pure helpers: `cacheStrategy.ts` + `cacheEviction.ts` (TDD)

**Why:** The two units of testable PWA logic. The service worker mirrors `cacheStrategy.ts`'s decisions and `cacheEviction.ts`'s FIFO trim — both are pure, fast to test, and the SW's correctness reduces to "does it call these helpers's equivalents on the right inputs."

**Files:**
- Create: `src/pwa/cacheStrategy.ts`
- Create: `src/pwa/cacheEviction.ts`
- Create: `tests/unit/pwa/cacheStrategy.test.ts`
- Create: `tests/unit/pwa/cacheEviction.test.ts`

- [ ] **Step 1: Write `tests/unit/pwa/cacheStrategy.test.ts` first (RED).** Pin the categorization:
  - Navigation request (HTML accept) → `'app-shell'`.
  - Same-origin `/src/main.ts`, `/assets/index-abc.js`, `/assets/index-abc.css` → `'app-shell'`.
  - Same-origin `/fonts/Geist-Regular.woff2` → `'app-shell'`.
  - Same-origin `/data/cameras-atlanta-seed.json` → `'dataset'`.
  - Same-origin `/dataset/cameras-us.json` → `'dataset'`.
  - Same-origin `/dataset/cameras-us.json.meta.json` → `'dataset-meta'`.
  - Same-origin `/data/cameras-us.json.meta.json` → `'dataset-meta'`.
  - `https://a.tile.openstreetmap.org/14/8763/5350.png` → `'tiles'`.
  - Same-origin `/valhalla/route` → `'pass-through'`.
  - Same-origin `/photon/api?q=anything` → `'pass-through'`.
  - Cross-origin to an unknown host (`https://example.com/foo`) → `'pass-through'`.
- [ ] **Step 2: Implement `src/pwa/cacheStrategy.ts` (GREEN).**
      Export a single pure function `pickStrategy({ url, accept, sameOrigin }: { url: string; accept: string | null; sameOrigin: boolean }): CacheStrategy`.
      Export the union type:
      ```ts
      export type CacheStrategy =
        | 'app-shell'
        | 'tiles'
        | 'dataset'
        | 'dataset-meta'
        | 'pass-through';
      ```
      Implementation order (matches the SW's switch):
      1. If `!sameOrigin`: only OSM tile hosts match `'tiles'`; everything else is `'pass-through'`.
      2. If sameOrigin and the URL path matches `/valhalla` or `/photon`: `'pass-through'`.
      3. If sameOrigin and the URL path matches `**.meta.json` under `/data/` or `/dataset/`: `'dataset-meta'`.
      4. If sameOrigin and the URL path matches `/data/` or `/dataset/`: `'dataset'`.
      5. Else (sameOrigin: navigations, JS, CSS, fonts, SVG, ico): `'app-shell'`.
- [ ] **Step 3: Refactor (IMPROVE).** Use a small `const` table of `{ pattern: RegExp; strategy }` for readability. Keep the function pure and exported types non-default.
- [ ] **Step 4: Write `tests/unit/pwa/cacheEviction.test.ts` first (RED).** Pin:
  - `pickEvictionTargets([], 100)` → `[]`.
  - `pickEvictionTargets(['a','b','c'], 5)` → `[]` (within bound).
  - `pickEvictionTargets(['a','b','c','d','e'], 5)` → `[]` (at bound).
  - `pickEvictionTargets(['a','b','c','d','e','f'], 5)` → `['a']` (one over).
  - `pickEvictionTargets(['a','b','c','d','e','f','g','h'], 5)` → `['a','b','c']` (three over).
  - `pickEvictionTargets(['x'], 0)` → `['x']` (max 0 evicts all).
- [ ] **Step 5: Implement `src/pwa/cacheEviction.ts` (GREEN).**
      ```ts
      export function pickEvictionTargets(keys: readonly string[], max: number): readonly string[] {
        const overflow = keys.length - max;
        if (overflow <= 0) return [];
        return keys.slice(0, overflow);
      }
      ```
      Exported as a named export. Pure. No side effects.
- [ ] **Step 6: Run `npm test -- tests/unit/pwa`** → both new specs green.

**Done when:** both helpers exist, both test files exist, the new vitest specs are green, `npx tsc --noEmit` clean.

---

## Task 2 — Icon generator script + committed PNG output

**Why:** PWA manifests need real PNG icons for installability on iOS Safari and the broader Android Chrome ecosystem. We avoid a PNG library dep by hand-writing the bytes with Node's built-in `zlib`. The generator is committed so the icons are reproducible from source, but the generated files are also committed so the build never runs the generator.

**Files:**
- Create: `scripts/build-pwa-icons.ts`
- Create (binary): `public/icons/icon.svg`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-192.png`, `public/icons/icon-maskable-512.png`

- [ ] **Step 1: Write `scripts/build-pwa-icons.ts`.** Top-of-file comment:
      ```
      // One-shot icon generator for Flock-Avoid PWA.
      // Run with: npx tsx scripts/build-pwa-icons.ts
      // Output: public/icons/{icon-192,icon-512,icon-maskable-192,icon-maskable-512}.png + icon.svg
      //
      // Geometry mirrors the v0.2 brand mark used in the welcome modal:
      //   outer: square, ink color (#0a0a0b), radius 12% of size
      //   inner: square, surface color (#ffffff), inset 25% of size
      //
      // Uses only Node built-ins (zlib, Buffer, fs) — no PNG library dependency.
      ```
      The script writes:
      - Five files total.
      - `'any'` icons render full-bleed brand mark on a white background.
      - `'maskable'` icons render the same mark scaled to ~64% with an ink-colored background, ensuring the safe-zone (40% inner circle) is monochrome enough to survive any device mask.
      - `icon.svg` is a small hand-authored SVG with the same geometry.
      Encode PNG by hand: PNG signature, IHDR chunk, single IDAT chunk with deflated raw RGBA scanlines, IEND chunk. CRC32 is computed inline (~30 lines of table-driven code).
- [ ] **Step 2: Run the generator.**
      `npx tsx scripts/build-pwa-icons.ts`
      Confirm five files in `public/icons/` with non-zero sizes.
- [ ] **Step 3: Verify the PNGs.**
      `file public/icons/*.png` → each reports `PNG image data, 192 x 192, 8-bit/color RGBA` (or `512 x 512`).
      Open one in Preview / xdg-open if available — the brand mark renders as expected.
- [ ] **Step 4: Re-run the generator to confirm determinism.**
      `npx tsx scripts/build-pwa-icons.ts` again, then `git status` — no diff on the five binary files. (If there is a diff, the script has nondeterminism; fix and re-run.)

**Done when:** the five icon files exist, are tracked by git, and `git status` shows clean after a re-run of the generator.

---

## Task 3 — Web app manifest + manifest correctness test (TDD)

**Why:** The contract a browser reads for installability. We pin the fields a real browser consumes so a future drive-by edit cannot silently break installability.

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `tests/unit/pwa/manifest.test.ts`

- [ ] **Step 1: Write `tests/unit/pwa/manifest.test.ts` first (RED).** Assertions:
  - Reads `public/manifest.webmanifest` from disk via `fs.readFileSync`.
  - Parses as JSON.
  - `name === 'Flock-Avoid'`
  - `short_name === 'Flock-Avoid'`
  - `start_url === '/'`
  - `scope === '/'`
  - `display === 'standalone'`
  - `theme_color === '#0a0a0b'` (ink) and `background_color === '#ffffff'` (paper). Rationale: ink frames the standalone status bar; white is what the user sees during cold launch.
  - `icons` is an array of at least four entries with `src`, `sizes`, `type`, and `purpose` populated.
  - For each `src` in the icon array, assert the file exists under `public/`.
  - At least one icon has `purpose: 'any'` at 192 and at 512.
  - At least one icon has `purpose: 'maskable'` at 192 and at 512.
  - At least one entry is `type: 'image/svg+xml'`.
- [ ] **Step 2: Write `public/manifest.webmanifest` (GREEN).**
      ```json
      {
        "name": "Flock-Avoid",
        "short_name": "Flock-Avoid",
        "description": "Plan driving routes that avoid mass-surveillance cameras.",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "orientation": "any",
        "theme_color": "#0a0a0b",
        "background_color": "#ffffff",
        "lang": "en-US",
        "icons": [
          { "src": "/icons/icon.svg",                 "sizes": "any",      "type": "image/svg+xml", "purpose": "any" },
          { "src": "/icons/icon-192.png",             "sizes": "192x192",  "type": "image/png",     "purpose": "any" },
          { "src": "/icons/icon-512.png",             "sizes": "512x512",  "type": "image/png",     "purpose": "any" },
          { "src": "/icons/icon-maskable-192.png",    "sizes": "192x192",  "type": "image/png",     "purpose": "maskable" },
          { "src": "/icons/icon-maskable-512.png",    "sizes": "512x512",  "type": "image/png",     "purpose": "maskable" }
        ]
      }
      ```
- [ ] **Step 3: Run `npm test -- tests/unit/pwa/manifest`** → green.

**Done when:** the manifest exists, parses, references files that exist, and the unit test pins every documented field.

---

## Task 4 — Service worker (`public/sw.js`) + lifecycle test (TDD)

**Why:** The runtime caching core. Plain JavaScript so Vite serves it from `dist/sw.js` unchanged. Behavior mirrors the pure helpers; the test exercises it in a sandboxed environment with stubbed `caches` + `fetch`.

**Files:**
- Create: `public/sw.js`
- Create: `tests/unit/pwa/serviceWorker.test.ts`

- [ ] **Step 1: Write `tests/unit/pwa/serviceWorker.test.ts` first (RED).**
      The test reads `public/sw.js` from disk, evaluates it in a fresh `vm` context with stubs:
      - `self` — an object with `addEventListener`, `skipWaiting()`, `clients.claim()`, and a `location` set to `'https://app.local/sw.js'`.
      - `caches` — a `Map<string, Map<string, Response>>`-backed stub implementing `open(name)`, `keys()`, `delete(name)`, `match(req)` matching the methods the SW actually uses.
      - `fetch` — a stub that returns a configurable Response or throws on demand.
      The test captures the registered handlers via the `addEventListener` stub, then invokes them in sequence:
  - **install handler:** does not throw; does not call `caches.open` with any name; calls `self.skipWaiting()`.
  - **activate handler:** when prior caches include `app-shell-v0`, `osm-tiles-v0`, and `app-shell-v1` (current), deletes the two `v0` entries, keeps the `v1` one; calls `self.clients.claim()`.
  - **fetch handler (app-shell hit):** with a stubbed `caches.match` returning a cached HTML response, the handler's `respondWith` argument resolves to that response.
  - **fetch handler (app-shell miss):** with `caches.match` returning `undefined` and `fetch` returning a 200 HTML, the handler's `respondWith` resolves to the network response AND writes it to the `app-shell-v{N}` cache.
  - **fetch handler (tile fill triggers eviction):** seed the tiles cache with 250 entries; issue a new tile request that misses cache; assert the new tile is added and the oldest entry was deleted.
  - **fetch handler (pass-through):** for `/valhalla/route`, `/photon/api`, and `https://example.com/foo`, the handler does NOT call `respondWith`.
  - **message handler:** posting `{ data: { type: 'SKIP_WAITING' } }` calls `self.skipWaiting()`.
- [ ] **Step 2: Implement `public/sw.js` (GREEN).** Single file, plain JS, no ES modules (some browsers still ship SW environments without module support; pure JS is universally portable). Structure:
      ```js
      // public/sw.js — Flock-Avoid hand-rolled service worker.
      //
      // Strategies:
      //   navigations + same-origin assets  → app-shell-v{N}      (network-first; cache fallback)
      //   tile.openstreetmap.org/**         → osm-tiles-v{N}      (SWR, FIFO-bounded 250)
      //   /data /dataset (non-meta)         → dataset-v{N}        (SWR, FIFO-bounded 4)
      //   /data /dataset *.meta.json        → dataset-meta-v{N}   (SWR, FIFO-bounded 4)
      //   /valhalla, /photon, unknown hosts → pass-through
      //
      // Never initiates a fetch the page didn't initiate first.

      const CACHE_VERSION = 1;
      const APP_SHELL_CACHE    = `app-shell-v${CACHE_VERSION}`;
      const OSM_TILES_CACHE    = `osm-tiles-v${CACHE_VERSION}`;
      const DATASET_CACHE      = `dataset-v${CACHE_VERSION}`;
      const DATASET_META_CACHE = `dataset-meta-v${CACHE_VERSION}`;
      const KNOWN_CACHES = new Set([APP_SHELL_CACHE, OSM_TILES_CACHE, DATASET_CACHE, DATASET_META_CACHE]);
      const MAX_TILES = 250;
      const MAX_DATASET = 4;
      const OSM_TILE_HOST_RE = /^[abc]?\.?tile\.openstreetmap\.org$/;

      function pickStrategy(url, accept, sameOrigin) { /* mirror src/pwa/cacheStrategy.ts */ }
      function pickEvictionTargets(keys, max) { /* mirror src/pwa/cacheEviction.ts */ }

      self.addEventListener('install', (event) => { event.waitUntil(self.skipWaiting()); });
      self.addEventListener('activate', (event) => { event.waitUntil(activate()); });
      self.addEventListener('fetch', (event) => { handleFetch(event); });
      self.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
      });

      async function activate() {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => !KNOWN_CACHES.has(k)).map((k) => caches.delete(k)));
        await self.clients.claim();
      }

      function handleFetch(event) {
        const req = event.request;
        const url = new URL(req.url);
        const sameOrigin = url.origin === self.location.origin;
        const accept = req.headers.get('accept');
        const strategy = pickStrategy(req.url, accept, sameOrigin);
        switch (strategy) {
          case 'app-shell':    event.respondWith(networkFirst(req, APP_SHELL_CACHE)); return;
          case 'tiles':        event.respondWith(staleWhileRevalidate(req, OSM_TILES_CACHE, MAX_TILES)); return;
          case 'dataset':      event.respondWith(staleWhileRevalidate(req, DATASET_CACHE, MAX_DATASET)); return;
          case 'dataset-meta': event.respondWith(staleWhileRevalidate(req, DATASET_META_CACHE, MAX_DATASET)); return;
          case 'pass-through': return;
        }
      }

      async function networkFirst(req, cacheName) { /* network try, cache write on success, cache fallback on failure */ }
      async function staleWhileRevalidate(req, cacheName, max) { /* serve cached, fetch in background, trim to max */ }
      async function trimCache(cacheName, max) { /* uses pickEvictionTargets */ }
      ```
- [ ] **Step 3: Mirror `pickStrategy` from the unit-tested helper.**
      The SW's copy is plain JS; correctness is pinned by the SW's own test plus the helper's test plus a parity assertion (see Step 4).
- [ ] **Step 4: Add a parity assertion in the unit test.**
      The serviceWorker test loads BOTH `src/pwa/cacheStrategy.ts`'s compiled output (via the existing TypeScript pipeline used in tests) AND the SW's inline copy, and asserts they agree on a fixed list of URL examples. This guards against the two implementations drifting.
      (Simpler alternative: don't duplicate — but the SW can't import the TS module without a build step. Parity assertion is the cheap alternative.)
- [ ] **Step 5: Run `npm test -- tests/unit/pwa/serviceWorker`** → green.

**Done when:** the SW exists as plain JS, the unit test covers install/activate/fetch/message + the four-strategy switch + bounded tile eviction + pass-through preservation + parity with the TS helper.

---

## Task 5 — `src/pwa/registerServiceWorker.ts`

**Why:** A small, focused module the page calls once. Feature-detects, registers, listens for updates, dispatches a DOM event when an update is ready. Decoupled from any UI.

**Files:**
- Create: `src/pwa/registerServiceWorker.ts`

- [ ] **Step 1: Implement.**
      ```ts
      export const SW_UPDATE_EVENT = 'flockavoid:sw-update-ready';

      export interface ServiceWorkerRegistrar {
        readonly register: () => Promise<void>;
      }

      export function createServiceWorkerRegistrar(
        scope: { navigator: Navigator | undefined; document: Document | undefined },
      ): ServiceWorkerRegistrar {
        return {
          register: async () => {
            const nav = scope.navigator;
            const doc = scope.document;
            if (!nav || !('serviceWorker' in nav) || !doc) return;
            try {
              const reg = await nav.serviceWorker.register('/sw.js', { scope: '/' });
              if (reg.waiting && nav.serviceWorker.controller) {
                doc.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT, { detail: { registration: reg } }));
              }
              reg.addEventListener('updatefound', () => {
                const installing = reg.installing;
                if (!installing) return;
                installing.addEventListener('statechange', () => {
                  if (installing.state === 'installed' && nav.serviceWorker.controller) {
                    doc.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT, { detail: { registration: reg } }));
                  }
                });
              });
            } catch (err) {
              // Registration failures must not break the app. Log and move on.
              // eslint-disable-next-line no-console
              console.warn('Service worker registration failed', err);
            }
          },
        };
      }
      ```
- [ ] **Step 2: Confirm `npx tsc --noEmit`** clean.
- [ ] **Step 3: No new test needed beyond the e2e** — the function is mostly browser-API plumbing; the meaningful behavior (registration succeeds, update event fires) is exercised by the Playwright e2e in Task 9.

**Done when:** the file compiles, exports `createServiceWorkerRegistrar` and `SW_UPDATE_EVENT`, and is unused by the app pending Task 8 wiring.

---

## Task 6 — Update prompt UI (`src/pwa/updatePrompt.ts`) + test (TDD)

**Why:** The user-visible affordance for "a new version is available." Matches the v0.2 visual language: bottom-docked, hairline border, soft shadow, no glassmorphism.

**Files:**
- Create: `src/pwa/updatePrompt.ts`
- Create: `tests/unit/pwa/updatePrompt.test.ts`

- [ ] **Step 1: Write `tests/unit/pwa/updatePrompt.test.ts` first (RED).** Uses jsdom (per the existing convention in `vitest.config.ts` `environmentMatchGlobs`). Assertions:
  - `mountUpdatePrompt(container, callbacks)` returns a controller with `show()` and `dismiss()`.
  - Calling `show()` renders a `[data-update-prompt]` element inside `container` with two buttons: `[data-action="reload"]` and `[data-action="later"]`.
  - The element is bottom-docked (style.position === 'fixed' or 'absolute' with `bottom` set) and right-aligned (avoids the dataset-freshness chip at bottom-left).
  - Calling `show()` twice renders only one prompt (no duplicates).
  - Clicking `[data-action="reload"]` invokes `callbacks.onReload()`.
  - Clicking `[data-action="later"]` invokes `callbacks.onDismiss()` and removes the element.
  - `dismiss()` programmatically removes the element if present; safe to call when absent.
- [ ] **Step 2: Implement `src/pwa/updatePrompt.ts` (GREEN).**
      Visual: surface background, `--color-border` 1px border, `--shadow-2`, `--radius-md`, `--space-3` padding. Text reads exactly: *"A new version is available."*. Buttons styled per the existing PlannerCard / RouteSummaryCard secondary-button style. Right-aligned at `bottom: var(--space-4); right: var(--space-4)`.
- [ ] **Step 3: Add the helper to dispatch a SKIP_WAITING message** in `src/pwa/registerServiceWorker.ts` exported as `requestSkipWaiting(reg: ServiceWorkerRegistration): void`. The update prompt's `onReload` calls this then `window.location.reload()` in the `controllerchange` handler.

      Actually: simpler is for the prompt module to receive `onReload` as a callback from the caller (main.ts), and main.ts handles the `controllerchange` reload. Keep `updatePrompt.ts` UI-only; the SW lifecycle stays in `registerServiceWorker.ts` and the wiring in `main.ts`.
- [ ] **Step 4: Run `npm test -- tests/unit/pwa/updatePrompt`** → green.

**Done when:** the test pins the rendered DOM, the prompt matches the v0.2 visual language, and there is no UI cross-coupling to SW APIs.

---

## Task 7 — `index.html` — manifest, apple-touch-icon, theme color alignment

**Why:** The browser reads the manifest link tag from the document head. iOS needs `apple-touch-icon`. The current `theme-color` (`#3a5fff`) predates v0.2; align it with the manifest's `theme_color` so the standalone status bar matches the design system.

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add three tags inside `<head>`:**
      ```html
      <link rel="manifest" href="/manifest.webmanifest">
      <link rel="apple-touch-icon" href="/icons/icon-192.png">
      <meta name="apple-mobile-web-app-capable" content="yes">
      ```
- [ ] **Step 2: Update `<meta name="theme-color">`** from `#3a5fff` to `#0a0a0b` so it matches the manifest's `theme_color` and the v0.2 ink palette.
- [ ] **Step 3: Add `<meta name="apple-mobile-web-app-title" content="Flock-Avoid">`** so iOS uses the right home-screen label.
- [ ] **Step 4: Do not change** the existing `<title>`, the `#app` / `#sidebar` / `#map` structure, or the inline `style=` attributes on `<body>` / `<div id="app">` / `<div id="sidebar">` / `<div id="map">`. Sub-project A relies on them; do not regress.

**Done when:** the head contains the manifest link, the apple-touch-icon, the apple mobile meta tags, and an updated theme-color, and the rest of the file is unchanged.

---

## Task 8 — `src/main.ts` — register the SW + mount the update prompt

**Why:** The wiring point. Registration happens after the app boots (no race with `startApp`), via `requestIdleCallback` (or a `setTimeout` fallback) so we never block the critical path. The update prompt mounts on demand when the SW dispatches its event.

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Update `src/main.ts`** to (after the existing `startApp().catch(...)`):
      ```ts
      import { createServiceWorkerRegistrar, SW_UPDATE_EVENT } from './pwa/registerServiceWorker';
      import { mountUpdatePrompt } from './pwa/updatePrompt';
      ```
      Then after `void startApp().catch(...)`:
      ```ts
      const registrar = createServiceWorkerRegistrar({ navigator, document });
      const startRegistration = (): void => { void registrar.register(); };
      if ('requestIdleCallback' in window) {
        (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(startRegistration);
      } else {
        setTimeout(startRegistration, 1);
      }

      document.addEventListener(SW_UPDATE_EVENT, (e) => {
        const reg = (e as CustomEvent<{ registration: ServiceWorkerRegistration }>).detail.registration;
        const prompt = mountUpdatePrompt(document.body, {
          onReload: () => {
            if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            // controllerchange fires when the new SW takes over; reload to pick it up.
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              window.location.reload();
            }, { once: true });
          },
          onDismiss: () => prompt.dismiss(),
        });
        prompt.show();
      });
      ```
- [ ] **Step 2: Confirm `npx tsc --noEmit`** clean. The `requestIdleCallback` cast keeps the TS happy without a lib bump.
- [ ] **Step 3: Confirm `npm run lint`** clean.

**Done when:** main.ts compiles, registers the SW on idle, and mounts the update prompt only when the SW raises its event.

---

## Task 9 — Playwright e2e (`tests/e2e/pwa.spec.ts`)

**Why:** Real-browser verification that registration succeeds, the manifest is reachable, and the app boots without console errors when the SW is active.

**Files:**
- Create: `tests/e2e/pwa.spec.ts`

- [ ] **Step 1: Write the spec.** Three tests:
  1. **manifest is reachable + parses:**
     ```ts
     test('serves a valid web app manifest', async ({ page }) => {
       const resp = await page.request.get('/manifest.webmanifest');
       expect(resp.ok()).toBe(true);
       const json = await resp.json();
       expect(json.name).toBe('Flock-Avoid');
       expect(json.start_url).toBe('/');
       expect(json.display).toBe('standalone');
     });
     ```
  2. **service worker registers without errors:**
     ```ts
     test('registers the service worker without console errors', async ({ page }) => {
       const errors: string[] = [];
       page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
       await page.goto('/');
       await dismissWelcomeModalIfPresent(page);
       // Wait for the registration to settle (idle-callback + register() round trip).
       await page.waitForFunction(async () => {
         if (!('serviceWorker' in navigator)) return false;
         const reg = await navigator.serviceWorker.getRegistration();
         return Boolean(reg && (reg.active || reg.installing || reg.waiting));
       }, null, { timeout: 5000 });
       expect(errors.filter((e) => /service.?worker/i.test(e))).toHaveLength(0);
     });
     ```
  3. **service worker is fetched and parses:**
     ```ts
     test('serves /sw.js with a non-empty body', async ({ page }) => {
       const resp = await page.request.get('/sw.js');
       expect(resp.ok()).toBe(true);
       expect((await resp.text()).length).toBeGreaterThan(100);
       expect(resp.headers()['content-type']).toMatch(/javascript/);
     });
     ```
- [ ] **Step 2: Run `npx playwright test tests/e2e/pwa.spec.ts`** → all three green.
- [ ] **Step 3: Confirm no other e2e specs regressed.**
      `npx playwright test tests/e2e/` → green.

**Done when:** the three tests pass and the existing e2e suite still passes.

---

## Task 10 — Extend `tests/privacy/networkInvariants.spec.ts`

**Why:** Pin the SW privacy posture in the real-browser harness that already enforces the network allowlist. The existing test runs once. We add an SW-active second pass that re-runs the same allowlist check.

**Files:**
- Modify: `tests/privacy/networkInvariants.spec.ts`

- [ ] **Step 1: Add one new `test(...)` block** at the bottom:
      ```ts
      test('after SW registration, no new external host appears on second navigation', async ({ page, context }) => {
        await page.goto('/');
        await dismissWelcomeModalIfPresent(page);

        // Wait for SW to be active.
        await page.waitForFunction(async () => {
          if (!('serviceWorker' in navigator)) return false;
          const reg = await navigator.serviceWorker.getRegistration();
          return Boolean(reg && reg.active);
        }, null, { timeout: 10000 });

        const violations: string[] = [];
        page.on('request', (req) => {
          const url = req.url();
          if (url.startsWith('data:') || url.startsWith('blob:')) return;
          if (!isExternal(url)) return;
          if (!isAllowedUrl(url)) violations.push(url);
        });

        // Hard reload — SW is now controlling and serving from cache where it can.
        await page.reload({ waitUntil: 'networkidle' });
        await dismissWelcomeModalIfPresent(page);
        await page.waitForTimeout(1500);

        expect(violations, `SW-introduced disallowed external requests: ${JSON.stringify(violations, null, 2)}`).toHaveLength(0);
      });
      ```
- [ ] **Step 2: Do NOT modify the existing tests.** The route-body and Photon-proxy assertions stay exactly as they are.
- [ ] **Step 3: Run `npx playwright test tests/privacy/`** → all green (existing 3 tests + new 1).

**Done when:** the new test passes and the original assertions continue to pass.

---

## Task 11 — Verification gauntlet

**Why:** Guard against breakage. Every gate that protects the existing product must still be green.

- [ ] **Step 1: TypeScript.** `npx tsc --noEmit` → 0 errors.
- [ ] **Step 2: Lint.** `npm run lint` → 0 errors. Pre-existing warning from PR #3 (`tests/unit/geocode/photonClient.test.ts` unused `GeocodeError`) is acceptable; do not introduce new ones.
- [ ] **Step 3: Vitest.** `npm test` → all green (existing 255 + the new PWA suite ≈ 270+).
- [ ] **Step 4: Playwright privacy + e2e.**
      `npx playwright test tests/privacy/ tests/e2e/` → all green (the privacy invariant suite now includes the SW second-pass test).
- [ ] **Step 5: Production build emits SW + manifest + icons.**
      `npm run build` → succeeds.
      `ls dist/sw.js dist/manifest.webmanifest dist/icons/*.png dist/icons/icon.svg` → all present.
      The `dist/index.html` includes the `<link rel="manifest">` and `apple-touch-icon` tags.
- [ ] **Step 6: Atlanta benchmark is no worse than baseline.**
      Note: the Atlanta benchmark suite may already be red on this branch due to a pre-existing merge-order issue (PR #4's benchmark fix is a sibling branch not yet merged down). This PR must not make it worse. A diff of pre-PR vs post-PR `npx playwright test tests/benchmark/routes/atlanta.spec.ts` output shows no new failures.

**Done when:** every check above passes.

---

## Task 12 — Commit, push, open PR

- [ ] **Step 1: Stage by logical chunk.** Suggested commits, in order:
  1. `feat(pwa): pure cache-strategy + eviction helpers` — `src/pwa/cacheStrategy.ts` + `src/pwa/cacheEviction.ts` + their tests.
  2. `feat(pwa): icon generator + committed PNG/SVG assets` — `scripts/build-pwa-icons.ts` + `public/icons/*`.
  3. `feat(pwa): web app manifest + correctness test` — `public/manifest.webmanifest` + `tests/unit/pwa/manifest.test.ts`.
  4. `feat(pwa): hand-rolled service worker + sandbox test` — `public/sw.js` + `tests/unit/pwa/serviceWorker.test.ts`.
  5. `feat(pwa): SW registrar + update prompt UI` — `src/pwa/registerServiceWorker.ts` + `src/pwa/updatePrompt.ts` + `tests/unit/pwa/updatePrompt.test.ts`.
  6. `feat(app): wire SW registration + manifest + theme color` — `src/main.ts` + `index.html`.
  7. `test(e2e+privacy): SW registers; no new external host introduced` — `tests/e2e/pwa.spec.ts` + the additional assertion in `tests/privacy/networkInvariants.spec.ts`.
  8. `docs: Phase 0b-3b Sub-project D — PWA + offline spec + plan` — the spec and plan files.
- [ ] **Step 2: No emojis in any commit message.** Project convention.
- [ ] **Step 3: Push.**
      `git push -u origin feat/phase-0b-3b-pwa`.
- [ ] **Step 4: Open PR with `--base feat/phase-0b-3b-full-us-valhalla`.** Body sections:
  - **Why.** Privacy-first map app that gives up the moment LTE drops is a tool users uninstall. This PR makes the app shell + recent tiles + dataset offline-tolerant, and installable to the home screen.
  - **What changed.** Bullet list of the files in §"File Structure".
  - **Caching strategy.** Table from spec §4.3.
  - **Privacy posture.** No new browser-facing host. No background sync. No push. No analytics. Routing and geocoding requests are pass-through and never enter SW cache. Privacy invariant test extended with an SW-active second pass.
  - **Test results.** Output of every check in Task 11.
  - **Stacking.** "Stacks on PRs #3 / #4 / #5 / #6. Sibling task — live turn-by-turn navigation — runs in parallel off the same base; expect minor merge conflicts in `index.html` / `src/main.ts` on integration."

**Done when:** the PR is open against `feat/phase-0b-3b-full-us-valhalla`, the body is complete, and the URL is reported back to the requester.
