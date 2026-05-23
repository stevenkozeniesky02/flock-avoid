# Flock-Avoid — Phase 0b-3b · Sub-project D: Live turn-by-turn navigation

**Status:** Draft for review
**Author:** Steven (with Claude as AI cofounder)
**Date:** 2026-05-22
**Parent spec:** [`2026-05-15-flock-avoid-design.md`](./2026-05-15-flock-avoid-design.md)
**Companion plan:** [`2026-05-22-flock-avoid-phase-0b-3b-live-nav.md`](../plans/2026-05-22-flock-avoid-phase-0b-3b-live-nav.md)
**Prior sub-project:** Phase 0b-3b Sub-project B — Turn-by-turn directions (PR #5, branch `feat/phase-0b-3b-directions`)
**Stacks on:** `feat/phase-0b-3b-full-us-valhalla` (which itself sits on top of PR #5 and PR #3)
**Reference design:** [`design-explorations/2026-05-16-wayfinding-dossier.html`](../../../design-explorations/2026-05-16-wayfinding-dossier.html) (v0.2, modern map-first)

---

## 1. Why this exists

Sub-project B shipped a static directions panel — the ordered list of maneuvers for the selected route. That surface is the equivalent of a printed page of directions. It is correct, readable, and never moves while you drive.

What it does not do is *follow you* while you drive. Once a user pulls onto Krog Street the static list does not advance, does not announce the next turn, and — most importantly for Flock-Avoid — does not re-plan around the cameras avoided in the original private route if the user takes a different turn than the one the route prescribed. The user's only option is to fall back to a tracking app for live navigation, which voids the entire privacy gain of the original plan.

Sub-project D closes that loop in the way a privacy-first map app is allowed to: it follows the user's own GPS in the browser, advances the maneuver pointer as they cross each maneuver's end-of-shape, and re-plans against the *same* camera-avoidance cost model when the user drifts off the planned line. Nothing here learns the user, nothing is sent to a server, and nothing models a pursuer.

### 1.1 The hard line — navigation vs. pursuit evasion

The Sub-project B spec (§9 "Out of scope explicitly") declared live navigation out of scope because the team had not yet drawn the line between two superficially-similar features. We draw it now, explicitly:

| | **Live navigation (this spec, IN)** | **Pursuit evasion (PERMANENTLY OUT)** |
|---|---|---|
| What triggers re-routing? | The user's own GPS position deviating from the planned route polyline by more than a fixed threshold. | A signal that a specific vehicle, person, drone, or other adversary is following the user. |
| What is modelled? | The user's car relative to a static, pre-planned polyline. | An adversary's behaviour, capabilities, or intent. |
| What inputs are accepted? | `navigator.geolocation.watchPosition` for the user's *own* device, nothing else. | Anything that purports to detect a follower — license plates, drone audio, motion correlation, social-media check-ins, network signals. |
| What outputs are produced? | A new route from the current position to the original destination, computed with the same `ThreatProfile` already in use. | "Shake the tail" maneuvers, evasive doglegs, distraction routes, anything optimized to confuse a follower. |
| Equivalent in mainstream maps | Google Maps' "you have left the route — rerouting" prompt. | Has no mainstream equivalent. Sits outside the threat model. |

This spec implements column 1. Column 2 is permanently out of scope for Flock-Avoid; any feature that creeps in that direction is rejected by the project's product guardrails. The plan calls this line out at each design decision so future contributors do not blur it.

## 2. Scope

**In:**

- A "Start navigation" button on `RouteSummaryCard` that enters live navigation mode for the currently-selected route (`'shortest'` or `'private'`).
- A `NavigationBanner` UI component, anchored top-center on the map, that shows the *next* maneuver: arrow icon, instruction, distance-to-next, ETA, and an "End" affordance.
- A `NavigationSession` controller that subscribes to `LocationStore` and:
  - Advances the active maneuver pointer as the user crosses each maneuver's polyline segment.
  - Reports distance to the next maneuver from the user's snapped position along the route.
  - Detects when the user has drifted more than `OFF_ROUTE_METERS` (default `40 m`) from the planned polyline for more than `OFF_ROUTE_PERSIST_MS` (default `5 s`).
  - On a confirmed off-route, calls `Router.compareRoutes(currentPosition, originalDestination, sameThreatProfile)` and adopts the returned `private` route (or `shortest` if the original choice was `'shortest'`) as the new active route.
- An "End navigation" affordance returning to the route overview (re-mounts `RouteSummaryCard`).
- Pure geometry helpers (no DOM, no clock, no I/O) for: distance between two `GeoPoint`s in meters, perpendicular distance from a point to a polyline segment, snapping a point to the closest polyline segment, advancing a maneuver index given the snapped position. These are unit-testable with synthetic polylines.
- Visual language matches v0.2: surface tokens, hairline border, soft shadow, no glassmorphism.
- `aria-live="polite"` on the next-maneuver text so screen readers announce instruction changes without stealing focus.
- Keyboard exit (Esc ends navigation).

**Out (this sub-project):**

- **Pursuit evasion of any kind.** Permanent product line — see §1.1.
- **Voice / TTS announcements.** Implies an always-listening output channel and a new permission to manage; v1 keeps instructions purely visual.
- **Lane guidance, junction view, speed-limit overlay.** Valhalla returns some of this; we display none of it. This is a navigation MVP, not a Google Maps clone.
- **Predictive ETA recomputation from live speed.** ETA is the static `durationSeconds` of the active route minus a linear interpolation of progress; we do not infer the user's speed.
- **Background navigation / "keep alive" / wake locks.** The page must run in the foreground. We do not request `screen.wakeLock`. (Mainstream apps do; we hold the privacy line.)
- **Map rotation to heading, bearing-locked camera.** A nice-to-have, but it requires a heading signal whose accuracy is device-dependent; defer.
- **Persisting an in-progress trip across reloads.** Refresh = new session.
- **Driving stats (top speed, distance driven, time saved).** This is exactly the analytics surface we have rejected throughout the project.
- **Real-time camera notifications ("there's an ALPR ahead").** Cameras are already represented on the map as cones and pins. Surfacing them again during navigation as alerts blurs the line into "adversary detection" territory — we are showing static infrastructure, not warning of a behaviour.

## 3. Decisions captured during design

| Question | Decision | Why |
|---|---|---|
| Re-routing trigger | **Only** drift of the user's *own* position from the planned polyline. | This is the single mechanism that distinguishes legitimate live nav from pursuit evasion. Codified in `NavigationSession` (§5.3). |
| Re-routing input set | `start = current snapped position`, `end = original destination`, `profile = the same ThreatProfile that produced the active route`. No remembering of previously-avoided exclusion polygons beyond what the profile already encodes. | The cost model is the source of truth; we don't carry over per-trip state. |
| Off-route threshold | 40 m perpendicular distance, persisted 5 s. | Wide enough to absorb low-accuracy GPS (~10 m typical), narrow enough that an actual missed turn triggers within one block. 5 s avoids reacting to a single noisy fix. Both configurable for tests. |
| Re-routing cooldown | After a successful reroute, suppress new reroute attempts for 10 s. | Avoids a thrash loop while the user is still off-line of the new route. |
| Maneuver advancement | Linear walk: the active maneuver advances when the snapped position passes `endShapeIndex` of the current maneuver. | Cheap, deterministic, and the existing `RouteManeuver` already carries `beginShapeIndex` / `endShapeIndex` from Sub-project B. No new fields. |
| Banner anchor | Top-center floating card, mirroring the bottom-anchored summary card's visual treatment. | Drivers look up; the banner reads at a glance. Bottom is reserved for full-list directions if the user wants them. |
| Pursuit evasion guardrail | Explicit assertion in `NavigationSession`'s public API: the only signal feeding the reroute decision is the user's own `GeoPosition`. There is no pluggable "adversary" input. | Codified into the type system so a future contributor cannot pass in something else without rewriting the class. |
| Reuse of `LocationStore` | Live nav subscribes to the existing store; it does not create a second `watchPosition` watcher. | Single source of truth for the user's location; matches the recenter FAB and the on-map marker. |
| Reuse of `Router` | The same `Router` instance the planner used is passed into the navigation session for reroutes. No second router, no second client. | Cache reuse, identical behaviour. |
| What if reroute fails? | Surface a non-blocking error message in the banner; keep displaying the previous route's maneuvers. Never silently drop the user off the route. Re-arm after the cooldown so the next deviation can retry. | Defensive: a transient Valhalla outage shouldn't bork the trip. |
| Screen wake lock | Not requested. | Privacy-first ethos. Documented so a future driver doesn't expect it. |
| Voice / TTS | Out of scope (see §2). | Lean MVP; visual only. |
| New external hosts | None. The reroute uses the existing `/valhalla/route` endpoint. | `networkAllowlist.ts` is unchanged. The privacy invariant test continues to pass. |
| New dependencies | Zero. | Project mandate. |

## 4. Architecture

### 4.1 New modules

```
src/routing/
  routeGeometry.ts            pure fns:
                                 haversineMeters(a, b) → number
                                 perpendicularDistanceMeters(p, segA, segB) → number
                                 snapToPolyline(p, polyline) → { segmentIndex, distanceMeters }
                                 distanceFromShapeIndex(polyline, fromIndex, fromPoint, toIndex) → number
                                 advanceManeuverIndex(maneuvers, currentIdx, snappedSegmentIndex) → number

src/nav/
  navigationSession.ts        NavigationSession class — subscribes to LocationStore,
                              owns active route, advances maneuver pointer,
                              detects off-route, requests reroute through Router.

src/ui/
  navigationBanner.ts         NavigationBanner class — mount, update, destroy.
                              Top-center anchored. v0.2 styling.
```

### 4.2 Modified existing modules

| File | Change |
|---|---|
| `src/ui/routeSummaryCard.ts` | `onStart` is now called for real (was a no-op stub). No new fields. |
| `src/app.ts` | Wire `onStart` to construct `NavigationSession` + `NavigationBanner`. Wire `onEnd` to tear down both and re-mount the summary card. |
| `tests/unit/ui/routeSummaryCard.test.ts` *(if it exists)* | Update to expect `onStart` to be callable. (Currently no such test; skip.) |
| `tests/privacy/networkInvariants.spec.ts` | No change. Live nav rides on the existing `/valhalla/route` proxy. |

### 4.3 Data flow

```
User taps "Start →" on RouteSummaryCard
  → app.ts: onStart('shortest' | 'private')
  → Detach RouteSummaryCard from the bottom dock.
  → Construct NavigationSession({
       activeRoute: selectedRoute,
       originalDestination: cmp.end,
       threatProfile: currentProfile,
       router, locationStore,
       offRouteMeters: 40, offRoutePersistMs: 5000,
       rerouteCooldownMs: 10000,
       now: Date.now
     })
  → session.start()
       → locationStore.start() (no-op if already tracking)
       → subscribe to locationStore
  → Mount NavigationBanner at top-center of map.
  → session.onUpdate((view) => banner.update(view))
  → session.onError((message) => banner.showError(message))

On every LocationStore tracking emission:
  → session computes:
       snapped = snapToPolyline(position, activeRoute.polyline)
       distanceOffRoute = snapped.distanceMeters
       maneuverIdx = advanceManeuverIndex(...)
       distanceToNextManeuver = ...
       etaSeconds = activeRoute.durationSeconds * (1 - fractionComplete)
  → If maneuverIdx changed, emit update (banner re-renders next-maneuver).
  → If distanceOffRoute > offRouteMeters continuously for offRoutePersistMs, AND
     time since last reroute > rerouteCooldownMs:
       → router.compareRoutes(currentPosition, originalDestination, threatProfile)
       → Replace activeRoute with the corresponding side (shortest/private).
       → Reset maneuver index to 0.
       → mapView.renderComparison(newComparison) — polyline visually updates.
       → emit update.
  → If reroute fails:
       → emit error 'Re-route failed. Continuing on previous route.'
       → re-arm after cooldown.

User taps "End" on NavigationBanner OR presses Esc:
  → session.stop() (unsubscribes from LocationStore, locationStore.start() lifecycle is unchanged)
  → banner.destroy()
  → re-mount RouteSummaryCard
```

### 4.4 Network + privacy boundary

**Unchanged.** Live navigation issues *one* additional `/valhalla/route` call per re-route event, at the same same-origin proxy already in use. No additional hosts, no new fetch sites in browser code, no analytics, no telemetry. `networkAllowlist.ts` is not modified.

GPS data:
- Stays in the browser. The `NavigationSession` reads `GeoPosition` from `LocationStore` and computes geometry locally. It is *never* serialized into the Valhalla request body except as the new `start` coordinate for a reroute (which is what any nav app must do; this matches the existing planner's behaviour).
- The Valhalla body in a reroute is the exact same shape as a regular plan (Sub-project A's privacy invariant test asserts no user identifiers; that test continues to cover this code path).

## 5. Component contracts

### 5.1 `routeGeometry.ts` — pure functions

```ts
import type { GeoPoint } from '../domain/route';

export function haversineMeters(a: GeoPoint, b: GeoPoint): number;

/** Perpendicular distance from point P to segment AB, in meters.
 *  Uses an equirectangular approximation (segments are tens of meters; spherical
 *  error is negligible at this scale). */
export function perpendicularDistanceMeters(
  p: GeoPoint, a: GeoPoint, b: GeoPoint,
): number;

export interface SnapResult {
  readonly segmentIndex: number;        // index of segment start vertex (0..polyline.length-2)
  readonly snapped: GeoPoint;           // foot of perpendicular onto the segment
  readonly distanceMeters: number;      // perpendicular distance from input to polyline
  readonly alongMeters: number;         // cumulative distance from polyline[0] to snapped
}

export function snapToPolyline(
  p: GeoPoint, polyline: readonly GeoPoint[],
): SnapResult;

/** Given a maneuver list with shape indices into `polyline` and a snapped
 *  segment index, return the index of the *next* maneuver the driver hasn't
 *  passed yet. Never goes backwards; clamps at maneuvers.length - 1. */
export function advanceManeuverIndex(
  maneuvers: readonly RouteManeuver[],
  currentIndex: number,
  snappedSegmentIndex: number,
): number;

/** Distance from the snapped position to the begin-shape-index of `targetIdx`. */
export function distanceToManeuver(
  polyline: readonly GeoPoint[],
  snapped: SnapResult,
  maneuvers: readonly RouteManeuver[],
  targetIdx: number,
): number;
```

All five are pure: no Date, no Math.random, no fetch, no DOM. They are the unit-testable core of the navigation feature.

### 5.2 `NavigationSession`

```ts
import type { GeoPoint, RouteComparison, RouteResult } from '../domain/route';
import type { ThreatProfile } from '../domain/threatProfile';
import type { LocationStore } from '../location/locationStore';
import type { Router } from '../routing/router';

export interface NavigationView {
  readonly activeRouteKind: 'shortest' | 'private';
  readonly activeManeuverIdx: number;
  readonly nextManeuverInstruction: string;
  readonly nextManeuverKind: ManeuverKind;
  readonly distanceToNextManeuverMeters: number;
  readonly distanceOffRouteMeters: number;
  readonly etaSeconds: number;
  readonly isRerouting: boolean;
  readonly hasArrived: boolean;
}

export interface NavigationSessionOptions {
  readonly initialComparison: RouteComparison;
  readonly initialRouteKind: 'shortest' | 'private';
  readonly threatProfile: ThreatProfile;
  readonly router: Router;
  readonly locationStore: LocationStore;
  readonly offRouteMeters?: number;        // default 40
  readonly offRoutePersistMs?: number;     // default 5000
  readonly rerouteCooldownMs?: number;     // default 10000
  readonly arrivalRadiusMeters?: number;   // default 30
  readonly now?: () => number;             // default Date.now (test seam)
  readonly onUpdate: (view: NavigationView) => void;
  readonly onRouteChanged: (cmp: RouteComparison, kind: 'shortest' | 'private') => void;
  readonly onError: (message: string) => void;
}

export class NavigationSession {
  constructor(opts: NavigationSessionOptions);
  start(): void;          // subscribes to locationStore
  stop(): void;           // unsubscribes
  /** Test seam. Same signal LocationStore would emit. */
  feedPosition(p: GeoPoint, nowMs?: number): void;
  destroy(): void;        // alias of stop() + clears callbacks
}
```

Guardrail in the type system:
- `feedPosition`'s only argument is a single `GeoPoint` representing the *device's* position. There is no `pursuer`, `follower`, `adversary`, or `tail` parameter on this class.
- The reroute call site receives `(snappedPosition, originalDestination, threatProfile)` — three values, none of which model anyone other than the driver and the destination they chose.

### 5.3 `NavigationBanner`

```ts
export interface NavigationBannerOptions {
  readonly onEnd: () => void;
}

export class NavigationBanner {
  constructor(container: HTMLElement, opts: NavigationBannerOptions);
  update(view: NavigationView): void;
  showError(message: string): void;
  destroy(): void;
}
```

DOM contract:
- Root: `<aside data-navigation-banner role="region" aria-label="Navigation">` absolutely positioned top-center, width `min(560px, calc(100% - 32px))`.
- Top row (the prominent line):
  - 28px maneuver icon, current-color stroke.
  - Distance-to-next: large, 600 weight, e.g. `0.3 mi`, `400 ft`.
  - Instruction: medium weight, single-line ellipsis.
  - `aria-live="polite"` on this entire line so screen readers re-announce on change.
- Bottom row (footer):
  - ETA: `ETA 14 min`.
  - "Re-routing…" indicator when `isRerouting` is true (left of the End button).
  - "End" button — pill style, secondary; `data-action="end-navigation"`.
- Error banner: when `showError` is called, an inline strip appears under the top row with `var(--color-threat)` text and a 6-second auto-dismiss. Does not interrupt navigation.
- Arrival state: when `view.hasArrived`, the banner replaces the next-maneuver line with `"You've arrived."` and changes the End button to `"Done"`. The session stops itself when `hasArrived` is true.

### 5.4 `RouteSummaryCard` — change

Existing `onStart` is currently a no-op:

```ts
onStart: () => { /* live navigation is out of scope (hard product line) */ },
```

This becomes:

```ts
onStart: () => beginLiveNavigation(selectedRoute),
```

The button text and selector (`data-action="start"`) are unchanged. Existing E2E tests against the summary card continue to pass.

### 5.5 `app.ts` — wiring

A new local helper `beginLiveNavigation(kind)` is added inside the `onCompare` success branch. It:

1. Removes any `[data-route-summary-card]` or `[data-directions-panel]` from `mapEl`.
2. Constructs `NavigationSession` with the current comparison/profile/router/locationStore.
3. Mounts `NavigationBanner` at the top of `mapEl`.
4. Wires the session's three callbacks (`onUpdate`, `onRouteChanged`, `onError`) into the banner.
5. `onRouteChanged` also calls `mapView.renderComparison(newCmp)` so the new polyline is drawn.
6. On `banner.onEnd`, calls `session.destroy()`, `banner.destroy()`, and re-mounts `RouteSummaryCard`.
7. Calls `locationStore.start()` (idempotent) so the user gets a permission prompt on first nav if they haven't already granted geolocation.

## 6. Visual reference

The navigation banner follows the v0.2 surface treatment:

- Background: `var(--color-surface)`.
- Border: 1px `var(--color-border)`.
- Shadow: `var(--shadow-3)`.
- Radius: `var(--radius-lg)`.
- Inner padding: `var(--space-4)`.
- Top row layout: `grid-template-columns: 36px 1fr auto`, gap `var(--space-3)`.
  - Icon column 32–36px, `var(--color-ink)`.
  - Center column: distance (`24px / 600`, ink color) on line 1; instruction (`14px / 500`, ink-2) on line 2, ellipsised.
  - Right column: ETA pill (`var(--color-bg-alt)`, ink-2, 12px).
- Bottom row: 12px hairline divider, padded `var(--space-2)` top, ETA on the left, End button on the right.
- Re-routing pill: `var(--color-accent-soft)` background, `var(--color-accent)` text, dot pulses (single keyframe).
- Error strip: `var(--color-threat-soft)` background, `var(--color-threat)` text, 6 s auto-dismiss.

No glassmorphism. No gradient backgrounds. No camera/threat-specific iconography in the banner (cameras already live on the map).

## 7. Testing approach

**Unit (vitest):**

- `routeGeometry.test.ts`:
  - `haversineMeters` for known city-block distances (Atlanta block ≈ 100–150 m).
  - `perpendicularDistanceMeters` for a known right triangle (3-4-5 m, in lat/lon decimals at a low latitude).
  - `snapToPolyline` returns segment 0 for a point near the first segment, returns last segment for a point past the end.
  - `snapToPolyline` reports `alongMeters` ≈ `haversineMeters(polyline[0], snapped)` for a straight east-west polyline.
  - `advanceManeuverIndex` never goes backwards.
  - `advanceManeuverIndex` advances when the snapped segment passes the current maneuver's `endShapeIndex`.
  - `distanceToManeuver` returns 0 when the snapped position is exactly the maneuver's begin.
- `navigationSession.test.ts`:
  - Constructing with a comparison + `'private'` kind: initial `view.activeRouteKind === 'private'`.
  - Feeding the start position: `view.activeManeuverIdx === 0`, `view.distanceToNextManeuverMeters ≈ private.maneuvers[0].distanceMeters`.
  - Feeding a position at `private.polyline[private.maneuvers[1].beginShapeIndex]`: `view.activeManeuverIdx === 1`.
  - Feeding a position 100 m off the line for one fix → no reroute (below persistence).
  - Feeding a position 100 m off for 6 seconds (advance the injected `now`) → exactly one `router.compareRoutes` call, then `onRouteChanged` fires, `view.activeManeuverIdx` resets to 0.
  - Reroute cooldown: feed off-route again within 10 s → no second reroute.
  - When `router.compareRoutes` rejects, `onError` is called and the session keeps the previous route.
  - **Hard product line test:** the only public surface that mutates internal state is `feedPosition` and it accepts exactly one `GeoPoint`. There is no method that takes anything resembling an "adversary" or "follower". This is asserted by reading the class's compiled `.prototype` keys in the test and checking the negative.
  - When the user reaches `arrivalRadiusMeters` of the final maneuver, `view.hasArrived === true` and the session unsubscribes.
- `navigationBanner.test.ts`:
  - Mounts one `[data-navigation-banner]` with `role="region"` and `aria-live` on the maneuver line.
  - `update(view)` re-renders the distance, instruction, ETA.
  - "End" button calls `onEnd` once.
  - Esc key calls `onEnd`.
  - `showError('foo')` shows the error strip, which removes itself after the timeout (use fake timers).
  - `view.hasArrived` swaps the line to "You've arrived." and the button to "Done".
  - `view.isRerouting` shows the re-routing indicator; clearing it removes the indicator.

**Integration (vitest):**
- No new integration tests; live nav reuses `Router` and `ValhallaClient`, both already covered.

**E2E (Playwright):**
- New `tests/e2e/liveNavigation.spec.ts`:
  - Plan a route end-to-end using the existing `planRoute` helper pattern.
  - Click `button[data-action="start"]`.
  - Assert `[data-navigation-banner]` becomes visible.
  - Assert the banner contains a distance string and an instruction.
  - Click `button[data-action="end-navigation"]`.
  - Assert the banner is gone and `[data-route-summary-card]` returns.
- Privacy invariant test continues to pass without modification — same allowlisted hosts, same body shape.

## 8. Acceptance criteria

This sub-project is "done" when:

1. From a planned-route state, clicking "Start →" enters live navigation: the summary card retracts and a top-center banner appears showing the next maneuver, distance to it, and ETA.
2. While the user's GPS moves along the planned polyline, the active maneuver pointer advances at each maneuver's end-of-shape and the banner re-renders.
3. When the user drifts more than 40 m from the polyline continuously for 5 s, the app re-routes from the current position to the original destination using the same threat profile, and visually updates the polyline.
4. Clicking End (or pressing Esc) returns to the route overview with the summary card re-mounted.
5. The only re-route trigger in code is the user's own position deviating from the planned polyline. There is no input pathway, public method, type, or comment in `NavigationSession` that models an adversary, follower, or pursuer.
6. No new entries in `networkAllowlist.ts`. Privacy invariant test still passes.
7. `npx tsc --noEmit` clean. `npm run lint` clean (one pre-existing PR #3 warning may remain). `npm test` ≥ baseline count + new tests, all green. Playwright privacy + e2e suites green or cleanly skipped on Valhalla absence.

## 9. Out of scope explicitly

These are explicitly **not** part of Sub-project D:

- **Anything pursuit-evasion.** See §1.1. Permanent product line.
- **Voice / TTS.** Implies an always-on output channel and a new permission. v1 visual-only.
- **Lane guidance, signage, speed-limit overlay, traffic-light timing.** Mainstream maps add these; we do not in v1.
- **Live-camera proximity alerts during nav.** The map already shows cameras as cones; an alert UI sits too close to "adversary detection".
- **Wake lock, background nav, in-app notifications.** Foreground only.
- **Persistence of an in-progress trip.** Refresh = new session.
- **Heading-locked map rotation.**
- **Recording or analytics on any nav event.**

## 10. Risk register

| Risk | Mitigation |
|---|---|
| GPS noise causes premature reroute attempts. | 40 m threshold + 5 s persistence + 10 s cooldown. Defaults are configurable for tests. |
| `Router.compareRoutes` takes seconds on a slow connection — user-experience hiccup during reroute. | `view.isRerouting` flag drives a non-blocking pill in the banner. Previous route remains active until the new one is in hand. |
| User loses GPS lock mid-trip. | `LocationStore` already surfaces `unavailable`. Banner shows a non-blocking warning; session keeps last-known maneuver index until a new fix arrives. |
| Off-route detection misfires on a parallel road (e.g. service road next to a freeway). | 40 m threshold is wide enough to absorb most. If false positives become a problem, raise the threshold in a follow-up — not in this PR. |
| Future contributor adds a "tail detection" feature framed as "off-route safety". | §1.1 calls the line out by name. `NavigationSession`'s public API admits only `feedPosition(p: GeoPoint)`; adding a pursuer signal would require widening that signature, which is the moment the line gets re-examined. |
| Mainstream-maps UX expectations leak (voice, lane guidance). | Spec §9 makes them explicitly out-of-scope. PR review enforces. |

## 11. Open questions

| Q | Default unless told otherwise |
|---|---|
| Should the banner show how many cameras the re-routed path still avoids vs. before? | No. That nudges the user toward thinking about adversaries. Keep it to nav fundamentals. |
| Should we offer a "snap to nearest road" pre-process on the GPS fix? | No. We snap to *the route polyline*, not to roads in general. The Valhalla `/locate` endpoint exists but adding it doubles per-fix network volume. |
| Auto-rotate the map to match heading? | Defer (§9). |
| Should we draw a "you are here" arrow on the snapped position separately from `LocationMarker`? | No — `LocationMarker` already shows the user's position. Adding a snapped-to-route arrow on top is visual noise. |
| Should the banner expose a "show maneuver list" tap to surface the static directions panel? | Nice-to-have. If the implementation lands cheaply (single button → re-use `DirectionsPanel`), include it; otherwise defer.|

---

**Next step after spec approval:** implement task-by-task per the companion plan (`docs/superpowers/plans/2026-05-22-flock-avoid-phase-0b-3b-live-nav.md`).
