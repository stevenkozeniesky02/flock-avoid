# Flock-Avoid — Phase 0b-3b · Sub-project A: Wayfinding UX

**Status:** Draft for review
**Author:** Steven (with Claude as AI cofounder)
**Date:** 2026-05-16
**Parent spec:** [`2026-05-15-flock-avoid-design.md`](./2026-05-15-flock-avoid-design.md)
**Prior phase:** Phase 0b-3a — Look + Feel (merged to master; brand tokens, bottom-sheet, MapView cluster source, welcome modal)
**Related sub-projects (queued, separate specs):**
- B: Turn-by-turn directions
- C: Full-US Valhalla setup
- D: PWA + offline
- E: Public deployment
**Reference design:** [`design-explorations/2026-05-16-wayfinding-dossier.html`](../../../design-explorations/2026-05-16-wayfinding-dossier.html) (v0.2, modern map-first)

---

## 1. Why this exists

The app routes correctly. Camera math is honest. The dataset is live nationwide (92k sensors as of the first nightly Action run). But the user can't actually use the product without a developer's mental model — there's no way to say "I'm here, take me there" except by tapping the map. The Plan Route flow requires two precise map clicks, the map is hardcoded to Atlanta, and the freshness banner is the only thing that hints this is a real product.

Phase 0b-3b sub-project A makes wayfinding work: address/place search with autocomplete, live device location, and a route-planning UI that matches how every modern map app behaves. It is the smallest cohesive slice of "real product" we can ship without taking on the larger pieces (full-US routing, deployment, offline) — those are queued as separate sub-projects so each one stays shippable.

This phase also locks in a refreshed visual language (see §10). Phase 0b-3a's Modern Privacy Tech direction (Inter + indigo + cream) was a strong first pass; user feedback during the design study was that the product should feel more like a modern map app and less like a developer tool. The v0.2 direction keeps the privacy posture but pushes the visual language toward map-first.

## 2. Scope

**In:**
- Geocoding search backed by Photon (public instance at `photon.komoot.io`)
- 300 ms debounced autocomplete; submit-on-Enter still works
- Floating pill search bar (idle) that expands into a planner card (active)
- Two waypoint inputs (Origin, Destination) inside the planner card, with autocomplete dropdown anchored beneath
- Swap-origin-and-destination action
- "Use my location" button on the Origin field
- Live device location via `navigator.geolocation.watchPosition` (one permission grant, persists for session)
- "You are here" map marker — clean blue dot + soft pulsing accuracy ring
- Recenter-on-me floating action button
- Map fly-to behavior when an autocomplete result is selected (zoom inferred from result type)
- Updated welcome modal copy + visual treatment to disclose Photon use
- Brand-token refresh: Geist + Geist Mono (self-hosted woff2), refreshed color/scale/motion tokens per v0.2 design
- Component refresh: every existing UI component re-themed to the v0.2 token set (no behavior changes beyond the wayfinding additions)
- `/photon` Vite dev proxy + production same-origin reverse proxy plan
- Network allowlist updated for `photon.komoot.io`

**Out (separate sub-projects in 0b-3b):**
- Turn-by-turn directions (Sub-project B)
- Full-US Valhalla tile build + cross-city routing (Sub-project C)
- PWA manifest + service worker + offline shell (Sub-project D)
- Public deployment + reverse proxy + code-splitting + perf lift (Sub-project E)

**Out (Phase 1+):**
- Reverse geocoding (display "Atlanta, GA" for current location)
- Recent searches / search history (privacy concern; opt-in feature for later)
- Saved places / favorites
- Compass heading on the user marker
- Tilt/3D view

## 3. Decisions captured during design

| Question | Decision | Why |
|---|---|---|
| Geocoder | Photon public instance | Free, OSM-based, autocomplete-friendly, no API key; self-host in Phase 1+ if traffic warrants |
| Privacy posture | 300 ms debounce + welcome-modal disclosure | Honest trade; per-keystroke would leak in-progress queries, submit-only would feel obsolete |
| Search UI placement | Inside the route planner card | Most like modern map apps; search and routing share one workflow |
| Geolocation scope | Live tracking (`watchPosition`) | Pulls a slice of Sub-project B forward but keeps wayfinding cohesive; user explicitly chose this over one-shot |
| Visual direction | v0.2 modern map-first | Map fills the frame, chrome floats above; rejects the dossier/brutalist direction that competed with the map |
| Network architecture | Same-origin proxy (`/photon`) | Mirrors `/valhalla` + `/dataset`; browser only ever talks to its own origin |

## 4. Architecture

### 4.1 New modules

```
src/geocode/
  geocodeTypes.ts        GeocodeResult, GeocodeResultType
  photonClient.ts        PhotonClient.search(query, signal): Promise<GeocodeResult[]>
  zoomForType.ts         pure fn — maps GeocodeResultType to a map zoom level

src/location/
  locationStore.ts       LocationStore class: start(), stop(), subscribe(cb), lastPosition, errorState

src/ui/
  searchInput.ts         debounced autocomplete <input> with anchored result dropdown
  searchBar.ts           idle-state floating pill (collapsed search affordance)
  plannerCard.ts         expanded-state planner card (replaces searchBar when active); hosts two SearchInputs + swap + use-location
  locationMarker.ts      manages the "you are here" GeoJSON source + circle layer + pulse animation on the map
  fab.ts                 reusable floating action button + FabStack container
  routeSummaryCard.ts    bottom-docked compact route summary (two route tiles + footer)
```

### 4.2 Modified existing modules

| File | Change |
|---|---|
| `src/ui/routePlanner.ts` | Replace the Set-Start-/Set-End-on-map buttons with `PlannerCard`. Keep the map-tap-to-set-waypoint behavior as fallback. |
| `src/ui/welcomeModal.ts` | Rewrite copy + visual per v0.2 (warm, direct, three checked promises including Photon disclosure). |
| `src/ui/datasetFreshness.ts` | Restyle as the bottom-left freshness chip per v0.2; relocate from sidebar to map overlay. |
| `src/ui/showAllConesToggle.ts` | Restyle as a member of the FAB stack. |
| `src/ui/bottomSheet.ts` | Mobile: keep the bottom-sheet container but make it host `PlannerCard` + `RouteSummaryCard` instead of the entire sidebar. |
| `src/ui/cameraDetailPopup.ts` | Restyle per v0.2 (clean card, top-anchored, soft shadow). |
| `src/privacy/networkAllowlist.ts` | Add `photon.komoot.io`. |
| `vite.config.ts` | Add `/photon` proxy → `https://photon.komoot.io`. |
| `src/app.ts` | Construct `LocationStore`; wire start/stop lifecycle; pass to `PlannerCard` + map layer; wire flyTo on result selection; replace the brand `<link rel="stylesheet">` block with the new Geist self-hosted faces. |
| `src/styles/tokens.css` (new or replaces existing brand vars) | Full v0.2 token set — color, type, spacing, radius, shadow, motion. |
| `public/fonts/` | Self-host Geist + Geist Mono woff2 (variable or weight-split, 400/500/600 minimum). |

### 4.3 Data flow — search

```
user types in SearchInput
  → debounce 300ms
  → PhotonClient.search(query, AbortSignal)
  → fetch('/photon/api?q=...&limit=5&lang=en')  [Vite proxy → photon.komoot.io]
  → parse GeoJSON FeatureCollection → GeocodeResult[]
  → SearchInput renders dropdown
user clicks/keys-Enter on a result
  → onSelect(result)
  → PlannerCard fills the corresponding waypoint
  → MapView.flyTo(result.coords, zoomForType(result.type))
  → if both waypoints set → Router.compareRoutes(...) → RouteSummaryCard mounts
```

### 4.4 Data flow — location

`LocationStore.start()` never prompts on its own — it just calls `watchPosition`, which only shows the OS permission prompt if permission has not already been granted. So "start" is safe to call eagerly once permission is known to be granted, and gated behind a user gesture otherwise.

```
app startup
  → check navigator.permissions.query({ name: 'geolocation' })
  → if state === 'granted':  LocationStore.start() immediately (no prompt fires)
  → if state === 'prompt' or 'denied':  do nothing yet
user taps "Use my location" or the recenter FAB
  → LocationStore.start() (browser shows permission prompt iff still 'prompt')
  → on grant: watchPosition fires the success callback continuously
  → on denial: state becomes 'denied'; the triggering button shows an inline error
on every position fix:
  → LocationMarker subscriber: update its GeoJSON source on the map
  → PlannerCard subscriber: enable the Use-Location button; cache lastPosition
user taps Use-Location on Origin field
  → if lastPosition: PlannerCard fills Origin with "Current location" (mono coord readout)
  → if no fix yet but tracking is pending: button shows a spinner until first fix
  → if denied/unavailable: inline error on the Origin field, button disabled
```

### 4.5 Network + privacy boundary

All external hosts go through the network allowlist (`isAllowedUrl`) at the fetch boundary. Relative URLs bypass the check by construction (same-origin invariant established in commit `d202f9f`). Updated allowlist after this phase:

```
localhost:8002                      Valhalla (dev only)
a/b/c.tile.openstreetmap.org        basemap raster (transitional — Sub-project D moves to self-hosted Protomaps)
github.com                          dataset (legacy CDN redirect)
objects.githubusercontent.com       dataset (legacy CDN)
release-assets.githubusercontent.com dataset (current CDN, verified 2026-05-16)
photon.komoot.io                    NEW — geocoder
```

Vite dev proxies (all rewriting to same-origin paths):
- `/valhalla` → `localhost:8002`
- `/dataset` → GitHub Release latest
- `/photon` → `photon.komoot.io` (NEW)

Production reverse-proxy plan documents all three same-origin paths; Sub-project E implements.

## 5. Component contracts

### 5.1 `PhotonClient`

```ts
type GeocodeResultType = 'city' | 'state' | 'country' | 'street' | 'address' | 'poi' | 'other';

interface GeocodeResult {
  id: string;                  // stable: `${osm_type}/${osm_id}` if present, else lat/lon hash
  name: string;                // primary label, e.g. "Krog Street Market"
  secondary: string;           // address/locality, e.g. "99 Krog St NE · Inman Park · Atlanta GA"
  type: GeocodeResultType;
  lat: number;
  lon: number;
  bbox?: [number, number, number, number]; // when Photon returns one (cities, states)
}

class PhotonClient {
  constructor(baseUrl: string = '/photon');
  async search(query: string, signal?: AbortSignal): Promise<GeocodeResult[]>;
  // limit=5, lang=en hardcoded for v1
}
```

Errors: network failures, non-200 responses, malformed JSON all reject with a typed `GeocodeError`. `AbortError` from a superseding query is swallowed (expected).

### 5.2 `LocationStore`

```ts
type LocationState =
  | { status: 'idle' }
  | { status: 'pending' }              // permission requested, no fix yet
  | { status: 'tracking', position: GeoPosition }
  | { status: 'denied' }
  | { status: 'unavailable', reason: string };

interface GeoPosition { lat: number; lon: number; accuracyMeters: number; timestamp: number; }

class LocationStore {
  state: LocationState;                // immutable; replaced on update
  start(): void;                       // idempotent; begins watchPosition
  stop(): void;                        // clears watch
  subscribe(cb: (state: LocationState) => void): () => void; // returns unsubscribe
  lastPosition(): GeoPosition | null;
}
```

`start()` must NOT prompt for permission proactively if the user hasn't engaged the feature — only when the user taps a button that requires location.

### 5.3 `SearchInput`

Single autocomplete input. Props (constructor):
- `placeholder: string`
- `onSelect: (result: GeocodeResult) => void`
- `onClear?: () => void`
- `initialValue?: string`
- `photonClient: PhotonClient`

Renders a borderless `<input>` inside a styled container. Below the input (when focused + has results) renders the dropdown. Keyboard nav: ↑/↓ cycle, Enter selects, Esc closes. Aria roles: `combobox` + `listbox` + `option`.

### 5.4 `PlannerCard`

Expanded planning state. Props:
- `onCompare: (start, end, profile) => Promise<RouteComparison>`
- `onClose: () => void`
- `locationStore: LocationStore`
- `photonClient: PhotonClient`
- `currentProfile: ThreatProfile`

Hosts: two `SearchInput`s (origin, destination), a swap button, a "Use my location" button on origin (enabled when LocationStore has a fix), a profile chip in the header (taps open profile picker). Submits to `onCompare` when both waypoints are set and the user activates Plan, or implicitly on second waypoint selection.

### 5.5 `LocationMarker`

Manages a GeoJSON source + circle layer on the map. Subscribes to `LocationStore`. When state is `tracking`, the source's data is a single Point feature; otherwise the source is empty. The pulsing ring is a CSS-animated DOM overlay positioned via `map.project()` and updated on `move`/`zoom` (10 ms throttle) — keeps the pulse smooth without re-rendering the map layer.

### 5.6 `RouteSummaryCard`

Bottom-docked compact summary that appears after `Router.compareRoutes` returns. Two tiles side-by-side (shortest vs private), each showing miles + sensor count + exposure. Footer line: headline savings ("83% less visible") + Details / Start buttons. The selected tile drives which polyline gets the bold style on the map; default selection is `private` when both exist, `shortest` when only shortest exists (degradation).

### 5.7 `SearchBar`

Idle-state floating pill. Tapping it transitions to `PlannerCard` (which fills the same position). Pure shell — delegates state to its parent.

## 6. Visual system — v0.2 tokens

Full system defined inline in the design exploration HTML; ports verbatim to `src/styles/tokens.css`. Highlights:

**Color:**
```
--ink           #0a0a0b
--surface       #ffffff
--bg-alt        #f7f7f5
--muted         #71717a
--border        rgba(10,10,11,0.10)
--accent        #2f54ff           (brand, focus rings, primary actions)
--accent-soft   #eef1ff
--threat        #dc2626           (sensors, shortest route)
--safe          #059669           (private route, success)
```

Dark theme mirrors the structure with `#0a0a0b` base, brighter accent (`#6f8aff`), brighter safe/threat. Triggered via `[data-theme="dark"]` on `<html>`. Phase 0b-3b ships dark theme too (not deferred) — the v0.2 design includes both and refusing to ship dark would feel undercooked.

**Type:**
- Display + body: **Geist** (self-hosted woff2; weights 400, 500, 600; variable axis preferred if size budget allows)
- Mono: **Geist Mono** (weights 400, 500; for coordinates, tabular numbers, micro labels)
- Replaces Inter from Phase 0b-3a. Implementation task: grep the repo for `Inter` font references, audit each occurrence, delete the woff2 files and the `@font-face` block in the same commit as the Geist token swap so the brand is never half-migrated

**Scale:** 4/8/12/16/20/24/32/48 px. Radii: 8/12/16/20 + pill. Shadows: three levels (`shadow-1/2/3`). Motion: 160–220 ms ease-out, no spring.

**Hairline rule:** every surface gets a 1px translucent border AND a soft shadow. The pair gives the floating quality without resorting to glassmorphism.

## 7. Welcome modal copy

Replaces the Phase 0b-3a copy. New copy (final):

> **Find a route the cameras don't see.**
>
> Flock-Avoid plans driving routes around the surveillance cameras we know about. The map is yours. Your trips are yours.
>
> ✓ **Routing runs on your device.** Your trips never leave the browser.
> ✓ **No accounts. No analytics. No trackers.** The code is open source.
> ⓘ **Search uses `photon.komoot.io`** — only what you type goes there, never your route.
>
> [ Get started ] · [ Read the docs ]

The disclosure of Photon is the only change of substance from Phase 0b-3a's privacy promise. The check vs info icon distinction (✓ for our promises, ⓘ for the geocoder caveat) makes the trade-off legible without burying it.

## 8. Testing approach

**Unit (vitest):**
- `PhotonClient.search`: success path, no-results, network error, malformed response, AbortSignal cancellation
- `zoomForType`: each result type maps to the right zoom
- `LocationStore`: state transitions on grant/deny/timeout/success; subscribe/unsubscribe semantics; idempotent start
- `networkAllowlist`: `photon.komoot.io` accepted; unknown hosts rejected (regression)

**Component (vitest + jsdom):**
- `SearchInput`: debounce timing, keyboard navigation, aria roles, blur-clears-dropdown
- `PlannerCard`: swap behavior, use-location button enable/disable, two-waypoint completion triggers `onCompare`
- `RouteSummaryCard`: tile selection updates map polyline style; degradation hides private tile

**Integration (vitest):**
- Existing `Router.compareRoutes` integration tests stay green
- New test: complete wayfinding flow with mocked PhotonClient (search → select → location → plan → summary)

**E2E (Playwright):**
- New test: type a query, pick first result, watch map fly to it
- New test: tap "Use my location", grant permission via Playwright API, watch origin fill
- Privacy invariant test (extends existing): no requests to non-allowlisted hosts; `/photon` and `/valhalla` are same-origin from the browser

## 9. Acceptance criteria

This phase is "done" when:

1. Typing into either waypoint input shows Photon autocomplete results within ~400 ms of stopping typing
2. Selecting a result fills the input AND flies the map to that location at an appropriate zoom
3. Tapping "Use my location" prompts permission, then fills Origin once permission is granted; the blue dot appears on the map
4. Tapping the recenter FAB centers the map on the user's current position
5. Existing route comparison flow still works end-to-end (no regressions)
6. Welcome modal displays the new copy + visual; closes on Get-started; reappears on first visit only
7. Map-tap-to-set-waypoint still works (fallback)
8. Dark theme renders correctly across all four exhibits
9. Lighthouse mobile scores: accessibility ≥ 0.92 (from 0.90 baseline), best-practices ≥ 0.95, performance not worse than baseline (Sub-project E lifts perf)
10. All vitest + Playwright suites pass against live Valhalla + mocked Photon
11. No fetch ever leaves the allowlist (Playwright network test)

## 10. Out of scope explicitly

These are valuable but belong elsewhere:

- **Turn-by-turn directions list** — Sub-project B. The route polyline + summary card is enough for v1 wayfinding.
- **Cross-city routing** — Sub-project C. Until full-US Valhalla is built, fly-to on a non-Atlanta result will pan the map but route requests outside Georgia will fail. Behavior: route request returns a typed error, RoutePlanner shows "Routing not available outside Georgia in v1 beta — coming soon" inline.
- **PWA install** — Sub-project D.
- **Public deployment** — Sub-project E.

## 11. Open questions

| Q | Default unless told otherwise |
|---|---|
| Self-host Geist or rely on Google Fonts? | Self-host (matches Phase 0b-3a precedent for Inter; avoids `fonts.googleapis.com` allowlist trip) |
| Photon `lang` parameter — fixed `en` or detect? | Fixed `en` for v1 |
| Result limit | 5 (matches mockup) |
| AbortSignal on every search request | Yes; new query aborts in-flight previous |
| Permission API used for one-time check before prompting? | Yes — avoids unnecessary prompts on already-granted sessions |
| Recenter FAB always visible or only after grant? | Only after `LocationStore.state.status === 'tracking'` (hide-then-show on first fix) |
| Mobile bottom-sheet: planner card occupies how much height when expanded? | 60% of viewport, draggable to 90% to reveal autocomplete |

## 12. Risk register

| Risk | Mitigation |
|---|---|
| Photon public instance rate-limits or goes down | Backoff + retry, error banner in search input, document the self-host path in Sub-project E |
| Geolocation permission UX feels invasive | Don't prompt on load — only on explicit user tap; honest welcome-modal disclosure beforehand |
| Inter → Geist swap breaks visual tests | Update visual regression snapshots in same PR; coordinate font-file changes with token swap atomically |
| Dark mode adds testing surface area | Skip Playwright dark-mode E2E for v1; covered by vitest token tests + manual visual check |
| Live tracking battery drain on mobile | `watchPosition` with `enableHighAccuracy: false` by default; toggle to `true` only on recenter-FAB activation; document in Sub-project B (turn-by-turn) when high-accuracy is needed |

---

**Next step after spec approval:** invoke `superpowers:writing-plans` to break this into bite-sized TDD tasks.
