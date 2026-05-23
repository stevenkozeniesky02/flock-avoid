# Flock-Avoid — Phase 0b-3b · Sub-project B: Turn-by-turn directions

**Status:** Draft for review
**Author:** Steven (with Claude as AI cofounder)
**Date:** 2026-05-22
**Parent spec:** [`2026-05-15-flock-avoid-design.md`](./2026-05-15-flock-avoid-design.md)
**Prior sub-project:** Phase 0b-3b Sub-project A — Wayfinding UX (PR #3 / PR #4 stacked, branch `feat/phase-0b-3b-wayfinding`)
**Stacks on:** `feat/phase-0b-3b-wayfinding`
**Reference design:** [`design-explorations/2026-05-16-wayfinding-dossier.html`](../../../design-explorations/2026-05-16-wayfinding-dossier.html) (v0.2, modern map-first)

---

## 1. Why this exists

Sub-project A made wayfinding usable: a user can search a destination, place an origin, and compare a shortest route to a private route. The map shows both polylines. The summary card reports miles, sensors, and exposure. But once the user has picked a route, there is no in-app way to see *how to drive it*. The only path forward is "open Apple/Google Maps in another tab and reconstruct the same trip" — which defeats the privacy premise the moment the user copies the destination into a tracking app.

Sub-project B closes that loop. Valhalla's `/route` response already contains a per-leg `maneuvers` array with instruction text, street names, distances, and shape indices. We surface that list as a clean directions panel reachable from the route summary. No new network calls. No new dependencies. No new external hosts.

This is intentionally **display-only**. The user reads the maneuvers; the app does not follow GPS, does not re-route on movement, does not announce upcoming turns. Live turn-by-turn navigation is a hard product line (it edges toward real-time pursuit evasion, which Flock-Avoid does not do). The maneuver list is the same surface a paper map would give you.

## 2. Scope

**In:**

- Parse Valhalla's per-leg `maneuvers` array into a stable domain type (`RouteManeuver`).
- Map Valhalla's integer `type` field to a semantic `ManeuverKind` enum (depart, turn-left, slight-right, roundabout-enter, arrive, etc.).
- Surface a `DirectionsPanel` UI component reachable from `RouteSummaryCard.onDetails`. It shows:
  - A header with origin → destination, total distance (miles), total duration (minutes).
  - Which route the panel is for (Shortest vs Private), driven by the summary card's selected tile.
  - A scrollable, ordered list of maneuvers. Each row: arrow icon · instruction text · street name · distance to the next maneuver.
  - A close affordance returning to the summary card.
- Switch between Shortest and Private maneuver lists by re-selecting the tile in the summary card (panel listens to selection).
- v0.2 visual language: surface tokens, hairline border, soft shadow, Geist, no glassmorphism.
- Dark theme parity (uses the same tokens).
- Distance formatting matches what Google/Apple Maps users expect for US driving: feet under ~500 ft, miles to one decimal otherwise.
- `aria-label`, list semantics, keyboard-closable (Esc).

**Out (this sub-project):**

- Real-time turn-following navigation. No `watchPosition` cursor on the maneuver list. No "next turn" callout. No live re-routing. (Hard product line — explicit in the project guardrails.)
- Voice announcements / TTS. (Implies live navigation; same line.)
- ETA recalculation on the fly. (Same.)
- Printable / shareable directions export. Nice-to-have, queued for a later phase if user demand emerges.
- Lane guidance, signage extraction. Valhalla supports some of this in the response but it's noisy and US-specific; the maneuver text alone reads well in Atlanta tests.
- Cross-city directions. Routing outside Georgia still fails because of the tile coverage; Sub-project C handles that.

## 3. Decisions captured during design

| Question | Decision | Why |
|---|---|---|
| Where does the panel live? | Bottom-anchored card that **replaces** `RouteSummaryCard` in the same dock position. Closing the panel re-mounts the summary. | Stays in the established floating-panel idiom from v0.2; never competes for vertical space; mobile-friendly with `max-height: 70vh; overflow-y: auto`. |
| Where does the maneuver data come from? | Same Valhalla `/route` response that already produces the polyline. Parse `legs[].maneuvers[]` in `ValhallaClient`. | Zero new network calls. Valhalla returns this by default. |
| Maneuver type model | A semantic `ManeuverKind` union (string literals) PLUS the raw Valhalla numeric `type` preserved for forensic debugging. | Stable downstream consumer API; future renderers (icons, A11y labels) key off `ManeuverKind`, not Valhalla's enum. |
| Selected-route routing | The summary card already calls `onSelect('shortest' \| 'private')`. The directions panel listens to a `selectedRoute` setter and re-renders the maneuver list when it flips. | One source of truth (the user's tile selection), no duplicate selection state. |
| Real-time navigation | Out of scope. Hard product line. | Civil-liberties product; live following is incompatible with the threat model documented in the parent design spec. |
| New dependencies | Zero. | Project mandate. Direction rendering is pure DOM + the existing token CSS. |
| Distance unit | Feet for < 161 m (~528 ft), miles otherwise. | Matches US driving convention and what the summary card already shows. |

## 4. Architecture

### 4.1 New modules

```
src/domain/
  maneuver.ts                 ManeuverKind union; RouteManeuver interface

src/routing/
  maneuverParser.ts           pure fn parseManeuvers(legs) → readonly RouteManeuver[]
                              pure fn maneuverKindFromValhallaType(n: number) → ManeuverKind

src/ui/
  directionsPanel.ts          DirectionsPanel class — mount, setRoute, destroy
  maneuverIcon.ts             pure fn maneuverKindToSvg(kind: ManeuverKind) → string
  formatDistanceImperial.ts   pure fn (meters) → "440 ft" | "0.3 mi" | "1.4 mi"
                              [shared with routeSummaryCard in a follow-up; this PR keeps the existing summary formatting]
```

### 4.2 Modified existing modules

| File | Change |
|---|---|
| `src/domain/route.ts` | `RouteResult` gains `readonly maneuvers: readonly RouteManeuver[]`. |
| `src/routing/valhallaClient.ts` | Response interface gains `maneuvers?` on each leg; client calls `parseManeuvers(legs)` and includes the result in `RouteResult`. |
| `src/routing/router.ts` | The `annotate` spread already carries new fields; no behavioural change. |
| `src/ui/routeSummaryCard.ts` | `onDetails` becomes the wired entry-point to the directions panel (was a placeholder no-op). No selector or visual change. |
| `src/app.ts` | Wire `onDetails` to construct a `DirectionsPanel` with the current `RouteComparison` and current `selectedRoute` (defaults to `'private'` when both exist). Wire `onSelect` to forward the kind into the (possibly mounted) panel. |
| `tests/unit/routing/router.test.ts` | Update stub `route()` mock to include `maneuvers: []` (cheaper than making the field optional). |
| `tests/integration/valhallaClient.test.ts` | New assertion: live Atlanta route returns non-empty `maneuvers`, with sensible structural invariants (first kind is `'depart'`, last is `'arrive'`). |

### 4.3 Data flow

```
ValhallaClient.route(start, end, exclusions)
  → POST /valhalla/route { ..., directions_options: { units: 'kilometers' } }
  → response.trip.legs[].maneuvers[] present by default
  → parseManeuvers(legs) → readonly RouteManeuver[]
  → RouteResult includes maneuvers

Router.compareRoutes(...)
  → annotate() spread carries maneuvers through unchanged
  → RouteComparison.shortest.maneuvers, RouteComparison.private.maneuvers

app.ts onDetails handler
  → DirectionsPanel.mount(map, {
      comparison,
      selectedRoute,           // 'shortest' | 'private'
      originLabel, destinationLabel,
      onClose: () => { panel.destroy(); remountSummary(); }
    })
  → On RouteSummaryCard.onSelect(kind) firing while panel is mounted,
    forward kind into panel.setRoute(kind) — re-renders the list in place.
```

### 4.4 Network + privacy boundary

**Unchanged.** No new external hosts. No new fetch sites. The maneuvers ride in the existing `/valhalla/route` response. `networkAllowlist.ts` is not modified. The Playwright privacy invariant test continues to pass without change.

This is important: the only acceptable way to add directions is to read what's already on the wire. Anything that needed a separate geocoder hit per maneuver, or an external tile/icon CDN, would have to be rejected on privacy grounds.

## 5. Component contracts

### 5.1 `RouteManeuver` (domain type)

```ts
export type ManeuverKind =
  | 'depart' | 'arrive'
  | 'continue' | 'becomes' | 'stay-straight'
  | 'slight-right' | 'right' | 'sharp-right'
  | 'slight-left'  | 'left'  | 'sharp-left'
  | 'uturn-right' | 'uturn-left'
  | 'ramp-straight' | 'ramp-right' | 'ramp-left'
  | 'exit-right' | 'exit-left'
  | 'stay-right' | 'stay-left'
  | 'merge'
  | 'roundabout-enter' | 'roundabout-exit'
  | 'ferry-enter' | 'ferry-exit'
  | 'other';

export interface RouteManeuver {
  readonly kind: ManeuverKind;
  readonly instruction: string;          // e.g. "Turn right onto Krog Street Northeast."
  readonly streetNames: readonly string[]; // [] if Valhalla didn't supply any
  readonly distanceMeters: number;        // distance covered BY this maneuver (Valhalla `length` * 1000)
  readonly durationSeconds: number;       // Valhalla `time`
  readonly beginShapeIndex: number;       // index into the route polyline
  readonly endShapeIndex: number;
  readonly rawValhallaType: number;       // forensic; preserved for debugging only
}
```

### 5.2 `parseManeuvers` (pure)

```ts
interface ValhallaLeg {
  shape: string;
  maneuvers?: ReadonlyArray<{
    type: number;
    instruction: string;
    street_names?: readonly string[];
    length: number;       // KM (because units=kilometers)
    time: number;         // seconds
    begin_shape_index: number;
    end_shape_index: number;
  }>;
}

export function parseManeuvers(legs: readonly ValhallaLeg[]): readonly RouteManeuver[];
```

Behaviour:
- Concatenates maneuvers across all legs.
- Maps `length` (km) → meters by multiplying by 1000 and rounding.
- Maps `type` (int) → `ManeuverKind` via `maneuverKindFromValhallaType`.
- Missing `street_names` → `[]`.
- Missing `maneuvers` on a leg → empty contribution for that leg (no throw).
- Returns a frozen-style readonly array; never mutates its input.

### 5.3 `DirectionsPanel`

```ts
export interface DirectionsPanelOptions {
  readonly comparison: RouteComparison;
  readonly initialSelectedRoute: 'shortest' | 'private';
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly onClose: () => void;
}

export class DirectionsPanel {
  constructor(container: HTMLElement, opts: DirectionsPanelOptions);
  setRoute(kind: 'shortest' | 'private'): void;
  destroy(): void;
}
```

DOM contract:
- Root: `<div data-directions-panel>` absolutely positioned, bottom-center, `width:min(560px, calc(100% - 32px))`, `max-height:70vh`, internal scroll on the maneuver list.
- Header: origin → destination text (mono coords fall back gracefully), distance/time summary line, close button `data-action="close"` (Esc-handled).
- Route-kind chip in the header (`Private` / `Shortest`) using the same `--color-safe` / `--color-threat` accents as the summary card tiles.
- Maneuver list: ordered list with one row per maneuver, `[data-maneuver-row]`, columns: icon · instruction (primary) + street name (secondary, muted) · trailing distance (right-aligned, mono).
- "Arrive" row collapses the distance column (distance to next is undefined at the destination).
- When the panel is mounted, the previously-mounted `RouteSummaryCard` is removed; closing the panel re-mounts the summary in the same position via the existing `mountRouteSummaryCard`. This avoids double-stacked floating cards.

A11y:
- `<aside role="region" aria-label="Driving directions">`.
- Maneuver list is a `<ol>` with `aria-label="Turn-by-turn maneuvers"`.
- Close button has `aria-label="Close directions"` and responds to Esc.

### 5.4 `maneuverKindToSvg` (pure)

Returns inline SVG markup (string) for a maneuver icon. One stroke style, current-color, 18×18 viewBox. Falls back to a generic forward-arrow for `'continue'`, `'other'`, and any unmapped kind. Pure function — no DOM, no side effects.

### 5.5 `formatDistanceImperial` (pure)

```ts
formatDistanceImperial(0)       === '0 ft'
formatDistanceImperial(30)      === '100 ft'   // rounded to nearest 10
formatDistanceImperial(155)     === '510 ft'
formatDistanceImperial(161)     === '0.1 mi'   // boundary
formatDistanceImperial(1610)    === '1.0 mi'
formatDistanceImperial(8050)    === '5.0 mi'
```

Threshold: `< 161 m → feet rounded to nearest 10`. `>= 161 m → miles to one decimal`. The 161 m boundary is approximately 0.1 mi (528 ft); the choice keeps the panel readable in dense urban segments where many turns happen within a city block.

## 6. Visual reference

The directions panel follows the wayfinding dossier's v0.2 surface treatment:

- Background: `var(--color-surface)`.
- Border: 1px `var(--color-border)`.
- Shadow: `var(--shadow-3)`.
- Radius: `var(--radius-lg)`.
- Inner padding: `var(--space-4)`.
- Header type: 14px / 600 / `var(--color-ink)`; secondary 12.5px / `var(--color-muted)`.
- Maneuver row: 12px vertical padding, 1px hairline divider between rows, icon column 24px, distance column right-aligned in mono.
- Icons: 18×18 inline SVG, `stroke="currentColor"` so dark-theme inheritance is automatic.
- No glassmorphism. No gradient backgrounds. No animations beyond the existing `--motion-fast` transitions on hover (rows do not pulse on the map; that would imply live navigation).

## 7. Testing approach

**Unit (vitest):**
- `maneuverKindFromValhallaType`: spot-check the canonical Valhalla integers (1=start, 4=destination, 10=right, 15=left, 26=roundabout-enter, 27=roundabout-exit, 99=other).
- `parseManeuvers`:
  - Empty legs → `[]`.
  - Leg with no `maneuvers` field → no contribution.
  - Two-leg input → maneuvers concatenated in order.
  - `length` (km) is multiplied by 1000 to produce meters, rounded.
  - `street_names` missing → `[]`.
  - `rawValhallaType` round-trips the integer.
- `maneuverKindToSvg`: returns a non-empty string with `currentColor` for every `ManeuverKind` value.
- `formatDistanceImperial`: boundary cases at 0, 50, 161, 1610.
- `DirectionsPanel`:
  - Renders one row per maneuver of the initially selected route.
  - `setRoute('shortest')` from `'private'` re-renders the list and updates the route chip.
  - Close button calls `onClose`.
  - Esc key calls `onClose`.
  - Distance column reads in feet for short maneuvers and miles for long maneuvers (uses the formatter under the hood; sample assertion is fine).
  - Has `role="region"` and the maneuver list has `role="list"` (via `<ol>` semantics).

**Integration (vitest, requires live Valhalla):**
- Extend `tests/integration/valhallaClient.test.ts` with one new test: a live Atlanta route returns non-empty maneuvers; first kind is `'depart'`; last is one of the arrive family (`'arrive'`/`'depart'` family from Valhalla 4/5/6).

**E2E (Playwright):**
- New test `tests/e2e/directionsPanel.spec.ts`: plan a route end-to-end (use the same helper pattern as `tests/privacy/networkInvariants.spec.ts::planRoute`), click `[data-action="details"]`, assert `[data-directions-panel]` is visible with at least one `[data-maneuver-row]`. Click close, assert summary card returns.
- The existing privacy invariant test continues to pass — no allowlist change, no new requests.

## 8. Acceptance criteria

This sub-project is "done" when:

1. After comparing a route, the `Details` button on the summary card opens a directions panel listing per-maneuver instruction + street + distance.
2. The panel reflects the route selected in the summary card; flipping the selection (Shortest ↔ Private) updates the listed maneuvers without re-routing.
3. Esc closes the panel; the summary card returns.
4. The maneuver list shows feet for short steps and miles for long steps.
5. Dark theme renders correctly (no token regressions).
6. No new entries appear in `networkAllowlist.ts`. The privacy invariant test still passes.
7. All vitest suites pass against live Valhalla + jsdom. `npx tsc --noEmit` clean. `npm run lint` clean.
8. The new Playwright `directionsPanel.spec.ts` passes; the existing wayfinding E2E and privacy invariant tests continue to pass.

## 9. Out of scope explicitly

These are explicitly **not** part of Sub-project B:

- **Real-time turn-following navigation.** Hard product line.
- **Voice / TTS announcements.** Implies live navigation.
- **Lane guidance, signage, junction view.** Valhalla exposes some of this; we display none of it in v1. The maneuver text reads well enough on the routes we care about (Atlanta surface streets).
- **Cross-city routes.** Tiles still cover only Georgia (Sub-project C).
- **Printable / shareable directions.** No export flow.
- **Re-rendering the map polyline based on which maneuver row the user hovers/taps.** Tempting (and trivially doable using `beginShapeIndex`), but it edges toward a "navigation cursor" UX. Defer until we have a clear, privacy-safe story for hover→map highlight.

## 10. Risk register

| Risk | Mitigation |
|---|---|
| Valhalla's maneuver `instruction` text occasionally reads awkwardly for certain road types. | Display verbatim. Don't rewrite. Add a forensic "raw type" tooltip behind a debug flag in a later phase if needed. |
| Long maneuver lists overflow the bottom dock on small screens. | `max-height: 70vh; overflow-y: auto` on the panel. Tests assert at least one row is scrollable when the list is long. |
| Adding `maneuvers` as a required field on `RouteResult` breaks existing stubs. | Update the two known stubs (`tests/unit/routing/router.test.ts`, `tests/unit/ui/plannerCard.test.ts`) in the same PR. Cleaner than making the field optional. |
| Future contributors mistake the panel for the seed of live navigation. | The spec, the README of the panel module, and the panel's own DOM are explicit: this is a static list. No `watchPosition` import in the panel. |
| Maneuver icons feel generic. | One stroked SVG per kind, current-color. Tasteful, not decorative. Future refinement is a design follow-up, not a privacy concern. |

## 11. Open questions

| Q | Default unless told otherwise |
|---|---|
| Should the panel auto-open after the first comparison? | No. User taps Details. (The summary card is the primary surface.) |
| Should `onStart` on the summary card open the panel too? | No — keep `onStart` reserved. Renaming it or wiring it to a "begin navigation" mode would suggest live navigation. Leave the stub. |
| Should hovering a maneuver row highlight the map polyline segment? | Defer (see §9). |
| Should we add a `Copy` action that exports the directions as plain text? | Defer to a later phase if user demand emerges. |

---

**Next step after spec approval:** implement task-by-task per the companion plan (`docs/superpowers/plans/2026-05-22-flock-avoid-phase-0b-3b-directions.md`).
