# Flock-Avoid — Phase 0b-3b · Sub-project D: PWA + offline

**Status:** Draft for review
**Author:** Steven (with Claude as AI cofounder)
**Date:** 2026-05-22
**Parent spec:** [`2026-05-15-flock-avoid-design.md`](./2026-05-15-flock-avoid-design.md)
**Prior sub-projects:**
- Sub-project A — Wayfinding UX (PR #3 / PR #4 stacked, branch `feat/phase-0b-3b-wayfinding`)
- Sub-project B — Turn-by-turn directions (PR #5 stacked on A, branch `feat/phase-0b-3b-directions`)
- Sub-project C — Full-US Valhalla setup (PR #6 stacked on B, branch `feat/phase-0b-3b-full-us-valhalla`)
**Stacks on:** `feat/phase-0b-3b-full-us-valhalla`
**Branch:** `feat/phase-0b-3b-pwa`

---

## 1. Why this exists

A driver who actually uses Flock-Avoid in the field is in a car. The use sites that matter most — driving past a known camera deployment, planning around a checkpoint, glancing at the map while the cell signal degrades to one bar — are precisely the moments when "fetch the app shell from the network" is least reliable. A privacy-positioned tool that gives up the moment LTE drops is a tool that gets uninstalled.

Sub-project D makes Flock-Avoid an installable Progressive Web App that loads from a cached app shell with no network, and that keeps recently-viewed map tiles and the camera dataset on disk so the visible parts of the user's working area survive a temporary disconnection. Routing itself still requires the network (the Valhalla container is not a browser-side asset and is out of scope to embed), but the rest of the experience — opening the app, panning the map you were just looking at, seeing the cameras, reading the directions panel for the route you just planned — should keep working.

This is also the smallest discrete unit of "feels like a real map app." Installability ("Add to Home Screen"), an app icon, a splash color, an offline app shell — these are the missing baseline that separates a website from something a user puts on their phone home screen.

## 2. Scope

**In:**

- A web app manifest at `/manifest.webmanifest` covering: app name (`Flock-Avoid`), short name (`Flock-Avoid`), theme color and background color drawn from the v0.2 palette, `display: standalone`, `start_url: /`, `scope: /`, icons in the required sizes (192px and 512px, plus a maskable variant), and an SVG icon for browsers that prefer it.
- Hand-authored icon files committed to `public/icons/`. A one-shot generator script at `scripts/build-pwa-icons.ts` documents how they were produced from the v0.2 logo geometry; the script uses only the Node standard library (`zlib`, `Buffer`) — no PNG library dependency.
- An `apple-touch-icon` link in `index.html` plus a `<link rel="manifest">` and a `meta name="theme-color"` pinned to the v0.2 accent surface. (The existing `theme-color` already exists; this PR updates it to match v0.2 brand tokens.)
- A hand-rolled service worker at `/sw.js`, plain JavaScript so it is served directly from `public/sw.js` and Vite copies it verbatim. The SW uses runtime caching only — no precache manifest, no per-build URL injection, no build-time SW transform. This keeps the implementation legible and avoids tying SW behavior to Vite's hashed-asset URLs.
- A registration module at `src/pwa/registerServiceWorker.ts` that registers `/sw.js` on first idle, opt-in by feature detection, and exposes an event for "new version available."
- An update-prompt UI at `src/pwa/updatePrompt.ts` — a small bottom-docked toast in the v0.2 visual language ("A new version is available. Reload"), shown only when the SW signals an update. Dismissible.
- Two pure helper modules unit-testable in vitest:
  - `src/pwa/cacheStrategy.ts` — pure function `pickStrategy(url) → 'app-shell' | 'tiles' | 'dataset' | 'pass-through'`. The SW mirrors this logic; the unit test pins the categorization.
  - `src/pwa/cacheEviction.ts` — pure function `pickEvictionTargets(keys, max) → keys[]` that returns the FIFO-oldest entries to delete when a cache exceeds its bound.
- Manifest correctness test (`tests/unit/pwa/manifest.test.ts`) that parses `public/manifest.webmanifest` and asserts the fields a browser actually consumes (name, short_name, start_url, scope, display, theme_color, background_color, icons — sizes, type, purpose).
- Service worker behavior test (`tests/unit/pwa/serviceWorker.test.ts`) that loads `public/sw.js` in a sandbox with a stubbed Cache + fetch and exercises the install/activate/fetch handlers against the pure cases (app shell hit, app shell miss, tile cache fill, eviction trigger, allowlist refusal of unknown hosts).
- A Playwright check (`tests/e2e/pwa.spec.ts`) that the SW registers in a real browser, the manifest is reachable, and the app boots cleanly with a registered SW (no console errors).
- An extension of the existing Playwright privacy invariant test (`tests/privacy/networkInvariants.spec.ts`) — same harness, additional assertion — that the SW does not introduce any external request to a non-allowlisted host. (The SW only fetches what the page already fetches; this assertion proves it.)

**Out (this sub-project):**

- **Offline routing.** Valhalla runs in a Docker container; embedding it in the browser is a different product. If the user is offline, `/valhalla` requests fail. The planner card surfaces that failure via the existing degradation path — no new offline-specific UI for routing.
- **Background sync, push notifications, periodic sync, any Service Worker API that initiates outbound traffic.** Privacy is the product; the SW listens, it does not speak unprompted.
- **Web Share API integration, share targets, file handling, protocol handlers.** Out of scope.
- **An "install" prompt UI.** Browsers handle this themselves (Chrome's install icon in the URL bar, Safari's Share → Add to Home Screen). Hand-writing a `beforeinstallprompt` capture and a custom "Install" button is a future polish; the manifest alone is enough to be installable. Doing it in this PR adds chrome that competes with the wayfinding chrome we just shipped in Sub-project A.
- **Workbox, vite-plugin-pwa, or any other PWA library.** Hard requirement from the project: no new third-party deps. The hand-rolled SW is intentionally small.
- **Tile pre-bundling / offline-area download.** Caching what the user has already looked at is in scope. Letting the user say "download Atlanta for offline" is a much bigger UX — picking a region, predicting tile counts, surfacing the disk cost — and is its own sub-project.
- **Camera dataset pre-bundling on first install.** Same reason. The dataset is ~25 MB; we fetch it on first run, and the SW caches it after that so subsequent loads are offline-tolerant. Pre-fetching at install time costs the user bandwidth they may not want to spend until they actually open the app.
- **Service worker delta updates / module imports inside the SW.** The SW is a single self-contained file. Diff-friendly, easy to reason about.

## 3. Decisions captured during design

| Question | Decision | Why |
|---|---|---|
| Hand-rolled SW or `vite-plugin-pwa` / Workbox? | Hand-rolled. No new dep. | The product mandate is zero browser-side deps beyond MapLibre. The SW is well under 200 lines; a library would more than double the build's third-party surface for behavior that's straightforward to write. |
| Precache an asset manifest vs. runtime caching only? | Runtime caching only. | Precaching requires knowing the hashed asset URLs Vite emits at build time, which would require either a SW build step or a Vite plugin (banned). Runtime caching with a network-first navigation strategy gives the same offline outcome on second visit, with a much smaller blast radius for getting the implementation wrong. |
| Cache map tiles? | Yes — stale-while-revalidate, bounded LRU-ish FIFO at 250 entries. | The user's primary navigation pattern is panning around a small working area; tiles are the heaviest network cost; offline tolerance is the whole point. 250 tiles at ~10 KB each is ~2.5 MB — a reasonable bound that does not silently grow forever. |
| Cache the camera dataset? | Yes — stale-while-revalidate. | Same reason: it's a single ~25 MB file the app loads on every cold start. After the first fetch, the SW serves the cached copy immediately and revalidates in the background. |
| Cache `/valhalla` responses? | No. Never intercept routing requests in the SW. | Routes are sensitive — they describe where the user is and where they are going. Even though they live only on the device, caching them in a SW-managed cache that survives across sessions is an unforced privacy hazard. The SW lets routing requests pass straight through; if the network is down, the existing degradation path runs. |
| Cache `/photon` responses? | No. Never intercept geocoder requests. | Same reason: the URL contains user-typed search strings ("3204 Maple Street"). A cached search history in the SW is functionally the same as an "accounts and history" feature we explicitly do not have. |
| Cache `/dataset/*` manifest (`.meta.json`)? | Yes, separately from the dataset itself, with a short max-age policy at the cache strategy layer. | The manifest is what tells the freshness chip when the dataset was generated. Stale-while-revalidate is fine. |
| Icon strategy — SVG, PNG, or both? | Both. Manifest references PNG (192, 512, plus maskable variants) for installability across iOS Safari + Android Chrome + desktop; one SVG icon ships as an alternate for browsers that prefer scalable. | iOS Safari requires PNG for `apple-touch-icon`; older Android browsers and the Chrome install prompt prefer PNG too. SVG-only manifests work in modern Chrome but fail elsewhere. |
| How to generate the PNG icons without a new npm dep? | A one-shot generator script `scripts/build-pwa-icons.ts` runs via the existing `tsx` dev-dep, uses Node's built-in `zlib` to write a minimal PNG, and commits the four binary files to `public/icons/`. The script is committed so the icons are reproducible, but it is not on the build path. | No new runtime or build dep. The PNG output is deterministic; re-running the script produces byte-equivalent files. |
| Where does `/sw.js` live in source? | `public/sw.js` — plain JavaScript, copied verbatim to `dist/sw.js` by Vite. | A SW at the root scope must be served from the root URL. Vite's `public/` directory passes through to `dist/` unchanged. Plain JS avoids any build-time transform of SW code. |
| Versioning the cache | Hard-coded `CACHE_VERSION` constant at the top of `public/sw.js`. Bumping it invalidates all caches on activate. | Simplest possible. The version is the only place a release manager needs to think. No build-time injection, no semver coupling. |
| Update prompt UX | Tiny bottom-docked toast in the v0.2 visual language, two actions ("Reload" / "Later"), shown only when the SW reports `waiting`. | Mirrors the `datasetFreshness` chip aesthetic. Non-blocking. The user can keep working on a route and reload when convenient. |
| Where does the SW message the page about updates? | `navigator.serviceWorker.addEventListener('controllerchange', …)` plus a custom `'flockavoid:sw-update-ready'` DOM event the page listens for. | Decouples SW lifecycle from UI; the toast module only knows about the DOM event. Testable in isolation. |
| Should the SW also enforce the network allowlist client-side? | No, but it must demonstrably not violate it. | The allowlist is enforced by the Playwright privacy invariant; the SW does not initiate any fetch the page didn't already initiate, so by construction the invariant holds. The unit test pins this explicitly by asserting `pickStrategy` returns `'pass-through'` for non-allowlisted hosts (i.e. it would not be cached). |
| Should we add `start_url: /?source=pwa` to attribute installs? | No. | Attribution analytics is a step toward identifying users. Even a no-op query parameter that adds nothing to the request normalises that pattern. The start URL is `/` — clean. |

## 4. Architecture

### 4.1 What changes

```
index.html                              MODIFY · add <link rel="manifest">, apple-touch-icon link,
                                                  align theme-color with v0.2 accent
public/
  manifest.webmanifest                  NEW    · web app manifest
  sw.js                                 NEW    · hand-rolled service worker (plain JS, runtime caching)
  icons/
    icon.svg                            NEW    · SVG version of the v0.2 brand mark
    icon-192.png                        NEW    · 192x192 PNG
    icon-512.png                        NEW    · 512x512 PNG
    icon-maskable-192.png               NEW    · 192x192 PNG with safe-zone padding (maskable)
    icon-maskable-512.png               NEW    · 512x512 PNG with safe-zone padding (maskable)

src/
  main.ts                               MODIFY · call registerServiceWorker() on idle, after app boot
  pwa/
    registerServiceWorker.ts            NEW    · feature-detection + lifecycle bridge
    updatePrompt.ts                     NEW    · toast UI for "new version available"
    cacheStrategy.ts                    NEW    · pure URL → strategy classifier (mirrors SW logic)
    cacheEviction.ts                    NEW    · pure FIFO-bounded eviction picker

scripts/
  build-pwa-icons.ts                    NEW    · one-shot, dep-free PNG generator (committed for reproducibility)

tests/
  unit/pwa/cacheStrategy.test.ts        NEW    · pin URL → strategy mapping
  unit/pwa/cacheEviction.test.ts        NEW    · pin FIFO eviction behavior
  unit/pwa/manifest.test.ts             NEW    · parse + assert manifest fields
  unit/pwa/serviceWorker.test.ts        NEW    · load sw.js into a sandbox, exercise lifecycle handlers
  unit/pwa/updatePrompt.test.ts         NEW    · jsdom render + dismiss / reload click handling
  e2e/pwa.spec.ts                       NEW    · SW registers, manifest reachable, no console errors
  privacy/networkInvariants.spec.ts     MODIFY · extend with explicit "SW introduces no new host" assertion

docs/
  superpowers/specs/2026-05-22-flock-avoid-phase-0b-3b-pwa.md   NEW   · this spec
  superpowers/plans/2026-05-22-flock-avoid-phase-0b-3b-pwa.md   NEW   · companion TDD plan
```

### 4.2 What does NOT change

- `src/privacy/networkAllowlist.ts` — unchanged. The SW caches same-origin assets and the small set of hosts the page already contacts (OSM raster tiles). No new browser-facing host.
- `vite.config.ts` — unchanged. No PWA plugin, no SW build pass.
- `package.json` dependencies — unchanged. The icon generator and SW both rely only on what's already there.
- The existing app entry path (`src/main.ts → src/app.ts`) — `registerServiceWorker()` is called asynchronously after the app mounts; it cannot block startup or cause a failed registration to take the app down.
- `src/routing/*`, `src/data/*`, `src/ui/*` — untouched. The SW operates outside the app's domain layer.
- Existing tests (other than the privacy invariant extension) — unchanged. The PWA test suite is additive.

### 4.3 Caching strategy table

| URL pattern | Strategy | Cache name | Bound | Rationale |
|---|---|---|---|---|
| Navigations (`Accept: text/html`) | Network-first; cache fallback. On success, write to cache. | `app-shell-v{N}` | 1 (replace index) | Offline visits get the last-known-good HTML. Online visits always get the latest. |
| Same-origin `.js`, `.mjs`, `.css`, `.woff2`, `.svg`, `.ico` | Stale-while-revalidate. | `app-shell-v{N}` | unbounded (per build version) | Hashed Vite outputs are immutable. The cache is invalidated on the next `CACHE_VERSION` bump. |
| `https://*.tile.openstreetmap.org/**` | Stale-while-revalidate, opaque responses cached as-is. | `osm-tiles-v{N}` | 250 entries (FIFO eviction) | Bounded so a long browsing session doesn't fill disk. ~2.5 MB worst case. |
| Same-origin `/data/**`, `/dataset/**` (excluding `.meta.json`) | Stale-while-revalidate. | `dataset-v{N}` | 4 entries | The dataset is one big file; the bound exists so that if the URL ever changes we don't accumulate orphans. |
| Same-origin `/data/**.meta.json`, `/dataset/**.meta.json` | Stale-while-revalidate. | `dataset-meta-v{N}` | 4 entries | Small; short-lived freshness signal. |
| `/valhalla/**` | Pass-through (no SW handling). | — | — | Privacy: routes describe where the user is going. Never persisted by the SW. |
| `/photon/**` | Pass-through (no SW handling). | — | — | Privacy: search queries are user text. Never persisted by the SW. |
| Any other cross-origin URL not in the above patterns | Pass-through. | — | — | Including unknown / future endpoints. If the page somehow contacts a new host, the SW does nothing — it does not add the host to a cache, it does not silence the failure. |

`{N}` is `CACHE_VERSION` declared once at the top of `public/sw.js`. The activate handler deletes any cache whose name does not start with the four known prefixes for the current version. The result: a SW version bump cleanly retires all old caches.

### 4.4 Service worker lifecycle

```
install  → take no precache action. immediately self.skipWaiting() — the new SW becomes "waiting"
           the moment its install completes (it does not take control until activate).
activate → enumerate all cache names; delete any that don't match the current CACHE_VERSION prefix set.
           then self.clients.claim() so the new SW controls open pages on next navigation event.
fetch    → switch on pickStrategy(request.url):
             'app-shell' → networkFirst(request, APP_SHELL_CACHE)
             'tiles'     → staleWhileRevalidate(request, OSM_TILES_CACHE, MAX_TILES)
             'dataset'   → staleWhileRevalidate(request, DATASET_CACHE, MAX_DATASET)
             'dataset-meta' → staleWhileRevalidate(request, DATASET_META_CACHE, MAX_DATASET)
             'pass-through' → do not call event.respondWith; let the browser handle it normally.
message  → handle one message type: { type: 'SKIP_WAITING' } → self.skipWaiting().
           used by the update-prompt's "Reload" button to fast-forward the new SW.
```

The page side:
```
on app boot, idle-callback:
  if 'serviceWorker' in navigator:
    register('/sw.js', { scope: '/' })
    when registration.installing transitions to 'installed' AND navigator.controller exists:
      → dispatch 'flockavoid:sw-update-ready' on document
    when 'controllerchange' fires → window.location.reload() (only after user clicks Reload)
```

The toast listens for `flockavoid:sw-update-ready` and renders. Reload sends `{ type: 'SKIP_WAITING' }` to the waiting SW, which calls `skipWaiting()`, which fires `controllerchange`, which reloads.

### 4.5 Icon geometry

The v0.2 brand mark, as already rendered in the welcome modal: a 44×44 ink-colored square with rounded corners, containing a smaller white square inset by ~11 px. The PNG icons mirror this on a 1024-unit canvas scaled to the target size:

- `icon-192.png`, `icon-512.png`: full-bleed brand mark on a white background, suitable for the manifest's `any` purpose.
- `icon-maskable-192.png`, `icon-maskable-512.png`: same mark, scaled to ~64% so the safe zone passes the maskable spec's 40% inner-circle test. Background is the v0.2 ink color so the mark reads against any device-imposed mask.
- `icon.svg`: a single small SVG with the same geometry; offered as `image/svg+xml` in the manifest for browsers that prefer scalable.

The generator script computes the geometry from these constants — the icons are reproducible from the source numbers, not hand-traced.

### 4.6 Update prompt visual

Matches `datasetFreshness`: bottom-docked, hairline border, soft shadow, no glassmorphism. Right-aligned to avoid colliding with the dataset-freshness chip at bottom-left.

Content (literal):

> A new version is available.   [ Reload ]  [ Later ]

`Reload` posts `SKIP_WAITING` and listens for `controllerchange` before reloading. `Later` removes the toast; the next page navigation picks up the new SW on its own.

## 5. Privacy posture

This sub-project is privacy-positive (more offline tolerance = less reliance on the network) and explicitly does not regress the existing posture:

- **No new browser-facing host in `src/privacy/networkAllowlist.ts`.** The SW caches the same set of origins the page already contacts.
- **No background sync, no push notifications, no periodic sync.** The SW does not initiate any outbound request on its own initiative. Every `fetch()` inside the SW is in response to a `fetch` event the page raised first.
- **No analytics, no install attribution, no telemetry.** `start_url` is `/`, with no tracking parameter.
- **Routing and geocoding requests are pass-through.** They never touch the SW caches. A user who plans a route to a sensitive address leaves no trace of that route in the SW cache.
- **The privacy invariant test is extended,** not loosened: the existing assertion that every external request goes to an allowlisted host still runs, and now the harness re-runs that check after the SW has been registered and is active. If the SW ever introduces a request to a new host, the test fails.
- **No new request body fields.** The SW does not modify outgoing requests.
- **The cache storage is local.** Cache API entries are scoped to the origin and accessible only to the SW + same-origin page. They are not transmitted anywhere.

## 6. Testing approach

**Unit (vitest):**
- `cacheStrategy.test.ts` — pin URL → strategy for the navigations, hashed assets, fonts, OSM tiles, dataset, manifest, `/valhalla`, `/photon`, and unknown cross-origin URLs.
- `cacheEviction.test.ts` — pin FIFO behavior: returns the right oldest-N keys when over the bound; returns `[]` when within bound; tolerates empty input.
- `manifest.test.ts` — parse `public/manifest.webmanifest`; assert the fields a browser actually consumes; assert each referenced icon file exists on disk.
- `serviceWorker.test.ts` — load `public/sw.js` as text, evaluate in a sandboxed scope with a stubbed `caches`, `fetch`, `self`. Exercise:
  - install handler: does not throw, does not precache anything.
  - activate handler: removes a cache whose name lacks the current version prefix; keeps current-version caches.
  - fetch handler: app-shell hit returns cached; app-shell miss falls back to network and writes to cache; tile cache fill respects bound; pass-through paths do not call `event.respondWith`.
- `updatePrompt.test.ts` — jsdom; the toast renders when the event fires; `Reload` posts the message; `Later` removes the toast.

**E2E (Playwright):**
- `tests/e2e/pwa.spec.ts` — opens the app, waits for SW registration, asserts `/manifest.webmanifest` is reachable and parses to JSON, asserts no SW-registration console errors.

**Privacy (Playwright):**
- `tests/privacy/networkInvariants.spec.ts` — existing assertions unchanged. Add: after the planner flow completes, wait for the SW to be `controlling` the page, repeat a hard reload, and assert that no new external host appears in the request log on the second pass (i.e. the SW serving from cache did not introduce a phone-home).

**Build:**
- `npm run build` must succeed and emit `dist/manifest.webmanifest`, `dist/sw.js`, and `dist/icons/*.png` (Vite copies `public/` verbatim).

**What this PR explicitly does NOT add:**
- A Lighthouse PWA-score CI gate. Useful and probably the next sub-project's first chore; out of scope here.
- An installability assertion (`getInstallabilityErrors`). That's a Chromium-internal devtool; the manifest + SW + HTTPS-or-localhost combination is the spec contract, and our test does the parts we can verify in headless Playwright.
- Cross-browser PWA matrix. Playwright runs Chromium by default; iOS Safari and Firefox PWA support are environmental concerns documented for follow-up.

## 7. Acceptance criteria

This sub-project is "done" when:

1. `public/manifest.webmanifest` exists with the documented fields, references icons that exist on disk, and parses as valid JSON.
2. `public/sw.js` exists as plain JavaScript and registers cleanly in Chromium on `npm run dev` and in the `dist/` production build.
3. The four PNG icon files and the SVG icon exist under `public/icons/` and are referenced from the manifest with the correct sizes and types.
4. `index.html` references the manifest, the apple-touch-icon, and the v0.2 theme color.
5. On a cold load with the dev server running, the app shell loads, the SW registers, and a second reload with the network disabled (DevTools "Offline") still renders the cached shell.
6. With the network online, panning the map fills `osm-tiles-v{N}`; this is verifiable by inspecting `caches.keys()` in DevTools.
7. The privacy invariant test still passes — no new external host introduced by the SW.
8. `npx tsc --noEmit` clean. `npm run lint` clean (no new warnings; the pre-existing `GeocodeError` warning from PR #3 is acceptable). `npm test` passes (existing + new). `npx playwright test tests/privacy/ tests/e2e/` passes. `npm run build` succeeds and emits `dist/sw.js` + `dist/manifest.webmanifest` + `dist/icons/*`.
9. The update prompt is rendered when the SW reports a `waiting` worker; clicking `Reload` reloads the page on `controllerchange`; clicking `Later` removes the toast without reloading.
10. The Atlanta benchmark is no worse than it was before this PR (the known pre-existing failure from PR #4's sibling fix is not regressed by anything in this PR).

## 8. Out of scope explicitly

These are **not** part of Sub-project D:

- **Offline routing.** Out of scope for the foreseeable; Valhalla is a server-side dependency.
- **Offline-area downloads.** A user-facing "save this metro for offline" feature. Future sub-project.
- **Custom install button / `beforeinstallprompt` capture.** Browsers handle install affordances natively; doing this ourselves competes with the wayfinding chrome and is a polish-tier change.
- **Background sync / push notifications / periodic sync.** Hard product line.
- **PWA Lighthouse CI gate.** Useful next step; not here.
- **Workbox / vite-plugin-pwa.** Dependency mandate.
- **Camera dataset pre-bundling at install time.** Costs bandwidth before the user has decided to use the app.
- **PMTiles / vector basemap migration.** Separate sub-project; the current raster tile basemap is what this PR caches.
- **Splash screens for iOS specifically.** iOS supports a `apple-touch-startup-image` system that requires per-device assets; we ship the manifest and `apple-touch-icon` baseline and defer the splash matrix.

## 9. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Service worker caches a stale `index.html` and the user can never see a new release. | Medium without care; Low as designed | Navigations use `network-first` with cache fallback. The cache is only consulted when the network fails. A user who is online always gets the freshest HTML. |
| A bug in the SW causes a request the page expects to succeed to fail silently or return a stale body. | Medium | Pass-through is the default for anything outside the four explicit strategies. The unit test pins this with the "unknown URL → pass-through" case. |
| Cache fills the user's disk because the eviction bound is wrong or never triggers. | Low | `pickEvictionTargets` is unit-tested. The bound is small (250 tiles, 4 dataset entries). The activate handler also drops all old-version caches on a SW upgrade. |
| The SW intercepts a `/valhalla` or `/photon` request and caches sensitive content. | Low | `pickStrategy` returns `'pass-through'` for both — unit-tested. The SW's fetch handler treats `'pass-through'` as "do not call respondWith." |
| The privacy invariant test passes locally but the SW silently introduces a phone-home (e.g. to a CDN that hosts icons). | Low | All icons and the manifest are same-origin. The privacy test runs against a real Chromium with the SW active. |
| Adding a `<link rel="manifest">` to `index.html` confuses an existing test that asserts page structure. | Low | The existing tests select by `id` and `data-` attributes, not by `<link>` count. Verified during implementation. |
| The PNG generator script's output is non-deterministic and the committed icons drift on regeneration. | Low | The script uses fixed inputs and no random padding. Re-running produces byte-equivalent files; documented in the script header. |
| The SW registers in dev and persists across branches, causing weird "ghost" cached content during local development. | Low | The dev script is documented to use DevTools → Application → Unregister, and `CACHE_VERSION` bumps clear caches automatically. A dev-mode toggle is overkill. |
| iOS Safari has historically been quirky about PWA installability. | Documented | The manifest + apple-touch-icon gets us "Add to Home Screen"; iOS-specific splash images are an explicit follow-up. |
| A reviewer expects Workbox semantics (precache manifest, runtime routes, expiration plugin) and is surprised by the hand-rolled approach. | Low | The spec is explicit about the choice. The SW is small enough to be read end-to-end in one sitting. |

## 10. Open questions

| Q | Default unless told otherwise |
|---|---|
| Should `start_url` include a session parameter for install attribution? | No — clean `/`. Privacy. |
| Should the SW expose a `clearAllCaches()` message handler for debug? | No — devtools `caches.delete()` covers it; we don't ship debug surface to production. |
| Should we cache the maplibre-gl worker chunk explicitly? | It's same-origin, hashed, and matches the JS pattern, so yes implicitly via `app-shell` — no special handling needed. Verified during implementation. |
| Should we set `display_override: ['standalone', 'minimal-ui']`? | No — `display: standalone` is enough. Override list is for advanced fallback control; we don't need it. |
| Should the update prompt also offer to "show me what changed"? | No — there's no changelog feed yet; adding one is its own scope. The toast is a single short sentence. |
| Should we bump `CACHE_VERSION` automatically from `package.json` at build time? | Not yet. Manual bump is acceptable; the SW is small enough that automated bumping adds machinery for a small problem. |
| Should we add a `screenshots` array to the manifest for richer install prompts? | Not in this PR. Requires actual screenshots of the production UI at fixed sizes; we'll do that the same time we set the Lighthouse gate. |
| Should we ship a `<meta name="apple-mobile-web-app-capable" content="yes">` shim? | Yes, it's a single-line zero-risk addition that improves iOS standalone behavior. Included in `index.html`. |

---

**Next step after spec approval:** implement task-by-task per the companion plan (`docs/superpowers/plans/2026-05-22-flock-avoid-phase-0b-3b-pwa.md`).
