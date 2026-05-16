# Flock-Avoid — Phase 0b-3a: Look + Feel

**Status:** Draft for review
**Author:** Steven (with Claude as AI cofounder)
**Date:** 2026-05-16
**Parent spec:** [`2026-05-15-flock-avoid-design.md`](./2026-05-15-flock-avoid-design.md)
**Prior phase:** Phase 0b-2 (merged to master; nightly DeFlock + OSM data pipeline live, dataset URL switched to GitHub Release)
**Next phase:** Phase 0b-3b — Wayfinding + Deploy (search, directions, full-US Valhalla, cross-city centering, PWA, public deployment)

---

## 1. Why this exists

The app works. The math is right (Phase 0b-1 cones), the data is live (Phase 0b-2 pipeline). Hands-on testing in Phase 0b-1 surfaced that the product looks like a developer tool — bare emoji cards, default form widgets, fixed-pixel markers that don't cluster or scale, no brand, no mobile layout, no onboarding. A normal person opening this would not know what it is.

Phase 0b-3a doesn't add product mechanics. It makes the existing mechanics feel like a product: a coherent brand, a proper mobile layout, a camera-visualization layer that handles density at any zoom, and a first-launch experience that sells the privacy promise before the user does anything.

The deferred sibling Phase 0b-3b adds the wayfinding the product needs to be actually useful (geocoding, directions, deploy). Splitting the two phases keeps each one shippable on its own.

## 2. Scope

**In:**
- Brand identity: color palette, typography, spacing/radius tokens, simple logo treatment
- Restyle every existing UI component to use the brand tokens (no functional changes to those components)
- Responsive layout — desktop sidebar collapses into a draggable mobile bottom sheet at narrow viewports; single codebase
- Map clustering at low zoom via MapLibre's built-in cluster source
- Camera pin tap → cone draws + detail popup (type, sources, direction, range)
- Auto-cone rendering for cameras within 200m of either planned route
- "Show all cones" power-user toggle (top-right map control)
- Welcome modal on first launch — privacy promise + brand intro + single CTA
- Loading skeleton during initial dataset fetch
- Reusable error banner component (extracted from RoutePlanner)
- `<meta name="theme-color">` so browser chrome matches the brand

**Out (Phase 0b-3b):**
- Geocoding / address search / autocomplete / place search
- Turn-by-turn directions list
- "From my location" via Geolocation API
- Cross-city map centering (map currently hardcoded to Atlanta)
- Full-US Valhalla setup (so non-Atlanta benchmarks can actually run)
- PWA manifest + service worker + offline support
- Public deployment (Cloudflare Pages / similar)

**Out (Phase 1):**
- Custom logo design (illustrator work) — Phase 0b-3a ships a simple typographic wordmark + accent badge
- Tooltips guided tour beyond the welcome modal
- Dark mode
- Animation system / motion design
- A11y audit (keyboard nav, screen-reader labels, color contrast verification) — basic conformance only

## 3. Brand System

### 3.1 Direction: Modern Privacy Tech

Reference points: Signal, Mullvad, Tailscale, Proton. Indigo as the primary brand color (trust + privacy-tech signaling), warm cream as the surface (rejects the cold gray of generic developer UIs), deep navy for primary text (high contrast without harsh black).

### 3.2 Color tokens

```
--brand-primary:      #3a5fff   (indigo accent — buttons, focus, links, brand badge)
--brand-primary-soft: #eef1ff   (tinted backgrounds — selected items, info panels)
--brand-surface:      #ffffff   (card / sheet / modal surfaces)
--brand-canvas:       #f7f3ec   (page background — warm cream)
--brand-ink:          #0d1a3a   (primary text — deep navy)
--brand-ink-muted:    #6b7280   (secondary text)
--brand-border:       #e5e8f0   (subtle borders)

--state-success:      #15803d   (private-route accent, "ok" states)
--state-success-soft: #ecfdf5
--state-danger:       #b91c1c   (shortest-route accent, errors)
--state-danger-soft:  #fef2f2
--state-warning:      #b45309   (degradation panel)
--state-warning-soft: #fef3c7
```

### 3.3 Typography

- **Font family:** Inter (system fallback: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`)
- **Loaded via:** local `@font-face` (self-hosted woff2; no Google Fonts → avoids `fonts.googleapis.com` privacy leak and the network-allowlist test failure that would cause)
- **Scale (rem-based, 16px root):**
  - `--font-size-xs`: 0.75rem (12px) — micro labels, badges
  - `--font-size-sm`: 0.8125rem (13px) — body
  - `--font-size-base`: 0.875rem (14px) — UI default
  - `--font-size-md`: 1rem (16px) — emphasis
  - `--font-size-lg`: 1.125rem (18px) — section headings
  - `--font-size-xl`: 1.375rem (22px) — modal titles
- **Weights:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold)

### 3.4 Spacing + radius + shadows

```
--space-1:  4px
--space-2:  8px
--space-3:  12px
--space-4:  16px
--space-6:  24px
--space-8:  32px

--radius-sm: 4px
--radius-md: 6px
--radius-lg: 10px
--radius-xl: 16px

--shadow-sm:  0 1px 2px rgba(13, 26, 58, 0.06)
--shadow-md:  0 4px 12px rgba(13, 26, 58, 0.08)
--shadow-lg:  0 10px 30px rgba(13, 26, 58, 0.12)
```

### 3.5 Logo

Simple typographic treatment for v0:
- **Wordmark:** "flockavoid" — Inter 700, `--brand-ink`, no special letterforms
- **Badge:** 24×24 rounded square `--brand-primary` containing a white "F" — Inter 800, used in sidebar header + welcome modal + browser favicon

A real illustrated logo is Phase 1 work. The typographic mark gets us shipping without an illustrator dependency and looks intentional, not lazy.

### 3.6 Where the tokens live

- `src/brand/tokens.ts` — TypeScript constants (for any inline-style usage that needs the values; e.g., the SVG marker icon color, MapLibre paint expressions)
- `src/brand/tokens.css` — CSS custom properties under `:root`, imported once at app bootstrap
- All components reference tokens via `var(--token-name)` in inline styles or via the TS constants where dynamic

## 4. Responsive Layout

### 4.1 BottomSheet component

A single component that adapts to viewport width:

- **≥720px viewport (desktop):** renders as a 340px-wide fixed-left sidebar. Same as current Phase 0b-2 behavior.
- **<720px viewport (mobile):** renders as a bottom sheet with three snap positions:
  - **Collapsed:** ~88px tall (just a drag handle + the freshness banner + current profile label, if set)
  - **Half:** 45% of viewport height (default after first interaction)
  - **Full:** 92% of viewport height (when expanded — covers most of the map)
- Drag handle at the top of the sheet; user drags to snap between positions; tap on the handle cycles forward (collapsed → half → full → collapsed).
- The map fills the remaining viewport behind the sheet at all positions.

### 4.2 What mounts inside the sheet

In order (top to bottom):
1. Freshness banner (existing `DatasetFreshness` component)
2. The screen for the current step:
   - Profile picker (when no profile selected)
   - Custom profile editor (when "Custom" was picked)
   - Route planner (when a profile is selected)

### 4.3 Map controls position

At narrow viewports, the bottom-sheet partially overlaps the map. Move the "show all cones" toggle and the existing MapLibre attribution to the **top-right** so they're never covered by the sheet.

## 5. Map Layer Redesign

### 5.1 From DOM markers to vector source

Current `MapView.renderCameras` creates one `maplibregl.Marker` (DOM element) per camera. This doesn't scale — at 10k cameras the DOM has 10k absolutely-positioned divs and the browser thrashes during pan/zoom. Phase 0b-3a replaces this with:

- A **GeoJSON source** holding all cameras (`cluster: true, clusterRadius: 50, clusterMaxZoom: 13`)
- A **cluster symbol layer** rendering numbered indigo circles
- A **single-camera circle layer** rendering individual pins (small filled circles, brand red `#b91c1c`)
- A **"?" badge symbol layer** for unknown-direction cameras (currently rendered as a yellow badge per Phase 0b-1)

### 5.2 Tap behavior

- Tap a cluster → `map.flyTo` zoomed to the cluster's expansion zoom (built-in MapLibre helper)
- Tap a single camera pin → mount `CameraDetailPopup` anchored at the pin AND draw the cone overlay as a temporary fill layer
- The selected-camera cone + popup clear when (a) the user taps empty map background, OR (b) the user taps a different camera (which mounts that camera's overlay + popup instead), OR (c) the user taps the popup's close button

### 5.3 Cone overlay layers

Three cone-rendering states stack as separate fill layers:

| Layer | When visible | Source |
|---|---|---|
| `cones-selected` | One camera is selected (last tap) | Single feature; cleared on next tap |
| `cones-along-route` | A route has been planned | All cameras within 200m of either polyline (computed at plan time) |
| `cones-all` | "Show all" toggle is on | Every camera in viewport (limited to viewport for perf) |

All three use the same fill paint (translucent brand red); they're separate layers so they can be toggled independently.

### 5.4 CameraDetailPopup contents

```
┌─────────────────────────────────────┐
│ ALPR · alpr_government              │  (type label)
│ Direction: 90° (east)               │
│ Range: 35m  ·  FOV: 30°             │
│ ─────────────────────────────────── │
│ Confirmed by: DeFlock + OSM         │  (sources array surfaced)
│ ID: atl-001                         │  (small, muted)
└─────────────────────────────────────┘
```

## 6. Welcome Modal

### 6.1 First-launch behavior

- On `startApp`, check `localStorage` for `flockavoid.welcomeDismissed.v1`
- If absent, mount `WelcomeModal` before anything else (the rest of the app initializes behind it but isn't interactive until dismiss)
- On "Get started" click, set the flag and unmount the modal

### 6.2 Modal content

```
┌─────────────────────────────────────────┐
│  [F] flockavoid                         │
│                                         │
│  Route around surveillance.             │
│  A privacy-first map for avoiding       │
│  ALPR cameras and other watchers.       │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ YOUR LOCATION STAYS LOCAL         │ │  (highlighted panel)
│  │ Routes compute on this device.    │ │
│  │ We don't track your trips. Ever.  │ │
│  └───────────────────────────────────┘ │
│                                         │
│  [ Get started ]                        │
└─────────────────────────────────────────┘
```

### 6.3 Reset path for dev / testing

`localStorage.removeItem('flockavoid.welcomeDismissed.v1'); location.reload()` re-shows the modal. Document in README "Tips" section.

## 7. Loading + Error UX

### 7.1 LoadingSkeleton

When `CameraStore.loadFromUrl` is in flight, the sidebar shows three shimmer-animated skeleton rows instead of empty whitespace. Replaces blank "FlockAvoid bootstrapping..." text from Task 1 of Phase 0a (still in place).

### 7.2 ErrorBanner

Extract from `RoutePlanner.renderError` into `src/ui/errorBanner.ts`:

```ts
export function mountErrorBanner(container: HTMLElement, message: string): void;
export function clearErrorBanners(container: HTMLElement): void;
```

Used by `RoutePlanner` (for routing failures) and now also by `app.ts` (for "dataset failed to load — try refresh" cases).

### 7.3 Toast (deferred)

A toast notification system is overkill for 0b-3a — the only transient feedback we need today is "dataset refreshed" after the freshness banner's refresh button. For v0 we just reload the page; toasts can land in Phase 1 if needed.

## 8. File Structure

```
src/
├── brand/                          # NEW
│   ├── tokens.ts                   # NEW: TypeScript color/spacing/radius constants
│   └── tokens.css                  # NEW: CSS custom properties under :root
├── ui/
│   ├── bottomSheet.ts              # NEW: responsive sidebar/sheet container
│   ├── welcomeModal.ts             # NEW
│   ├── cameraDetailPopup.ts        # NEW
│   ├── showAllConesToggle.ts       # NEW
│   ├── loadingSkeleton.ts          # NEW
│   ├── errorBanner.ts              # NEW: extract from routePlanner
│   ├── profilePicker.ts            # MODIFY: restyle, drop emoji, use SVG icons
│   ├── customProfileEditor.ts      # MODIFY: restyle inputs + Apply button
│   ├── routePlanner.ts             # MODIFY: restyle cards; consume errorBanner
│   ├── mapView.ts                  # REWRITE: GeoJSON cluster source + symbol layers + cone overlays + tap behavior
│   └── datasetFreshness.ts         # MODIFY: restyle to brand
├── app.ts                          # MODIFY: wire welcome modal, bottom sheet, loading skeleton
└── main.ts                         # MODIFY: import brand/tokens.css before app code
index.html                          # MODIFY: <meta name="theme-color">, remove inline styles that brand tokens replace
public/
└── fonts/                          # NEW: self-hosted Inter woff2 files
    ├── Inter-Regular.woff2
    ├── Inter-Medium.woff2
    ├── Inter-SemiBold.woff2
    └── Inter-Bold.woff2
public/data/cameras-atlanta-seed.json  # UNCHANGED
tests/
└── unit/
    ├── brand/
    │   └── tokens.test.ts          # NEW
    └── ui/
        ├── welcomeModal.test.ts    # NEW
        ├── bottomSheet.test.ts     # NEW
        ├── cameraDetailPopup.test.ts # NEW
        ├── loadingSkeleton.test.ts # NEW
        └── errorBanner.test.ts     # NEW
tests/
└── benchmark/
    └── routes/atlanta.spec.ts      # MODIFY: dismiss welcome modal at the top of each test
└── privacy/
    └── networkInvariants.spec.ts   # MODIFY: same, dismiss modal so it doesn't block clicks
```

## 9. Testing Strategy

| Layer | Coverage |
|---|---|
| **Unit (brand)** | All declared CSS custom properties are referenced somewhere AND every reference resolves to a declared property (catches typos / drift) |
| **Unit (ui/welcomeModal)** | Mounts when localStorage flag absent; doesn't mount when set; dismiss sets the flag |
| **Unit (ui/bottomSheet)** | Renders as sidebar above 720px; renders as bottom sheet below 720px; snap positions correct |
| **Unit (ui/cameraDetailPopup)** | Renders the camera's type, direction, range, sources |
| **Unit (ui/loadingSkeleton)** | Mounts/unmounts cleanly |
| **Unit (ui/errorBanner)** | Mount + clear contract works for multiple banners |
| **E2E (Playwright)** | Welcome modal appears on first launch, doesn't reappear after dismiss; resize viewport to mobile width and confirm bottom-sheet layout activates; cluster appears at low zoom, expands on tap |
| **Privacy (Playwright)** | No new external hosts contacted (Inter font is self-hosted; no `fonts.googleapis.com` request). Existing tests still pass. |
| **Routing-quality benchmark (Playwright)** | Existing Atlanta benchmark still passes after the rewrite of MapView; dismiss welcome modal at the top of each test |

## 10. Open Questions / Deferred Decisions

- Exact Inter font weights to ship (Regular, Medium, SemiBold, Bold — four files at ~30KB each = ~120KB total). Could trim to just Regular + SemiBold if we want to keep payload smaller.
- Bottom-sheet exact snap heights (88px / 45% / 92%) may need tuning on real devices in Phase 0b-3b
- (decided) "Show all cones" toggle is an **icon-only button** in the top-right map control stack, with `title` attribute for desktop tooltip and `aria-pressed` to communicate state. The pressed state uses brand-primary fill; unpressed is brand-surface with brand-border.
- Whether the welcome modal's "Get started" button should auto-pick Commuter or always show the profile picker after dismiss — implementation default: always show picker
- Cluster bucket sizes / cluster max zoom — MapLibre defaults are usually fine but may need tuning once full-US data is loaded

## 11. Success Criteria

Phase 0b-3a is done when:
- First launch shows the welcome modal with the privacy promise; subsequent launches skip it
- Every UI component (profile picker, custom editor, route planner, freshness banner, error banner, modal, popup) uses the brand tokens — no default browser styling visible
- Resize browser to <720px viewport → sidebar collapses into a draggable bottom sheet; map fills the viewport behind it
- At zoom 10 (regional view of Atlanta), cameras render as numbered clusters; tapping a cluster zooms in; tapping a single camera shows its cone + detail popup
- After planning a route, cameras within 200m of either route show cones automatically
- Top-right "show all cones" toggle exposes the power-user view
- A regression test catches if Inter font is fetched from any external CDN
- All Phase 0a / 0b-1 / 0b-2 tests still pass (118 vitest + 12 Playwright minimum, plus the ~10 new tests this phase adds)
- No new external network hosts in the allowlist (Inter is self-hosted)
- Lighthouse **mobile** + **accessibility** scores ≥ 90 against a local production build (`npm run build && npm run preview` + Lighthouse). Deployment itself is 0b-3b, but the local build should already pass these thresholds.
