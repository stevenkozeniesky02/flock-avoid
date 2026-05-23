# Phase 0b-3b · Sub-project B — Turn-by-Turn Directions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a display-only directions panel for the selected route, parsed from the maneuvers Valhalla already returns. No new network calls, no new dependencies, no live navigation.

**Spec:** `docs/superpowers/specs/2026-05-22-flock-avoid-phase-0b-3b-directions.md`
**Branch:** `feat/phase-0b-3b-directions` (stacked on `feat/phase-0b-3b-wayfinding`)
**Baseline:** 228 vitest + 14 Playwright passing on `feat/phase-0b-3b-wayfinding`.

---

## File Structure (created by this plan)

```
src/domain/
  maneuver.ts                  NEW · ManeuverKind, RouteManeuver
  route.ts                     MODIFY · RouteResult.maneuvers

src/routing/
  maneuverParser.ts            NEW · parseManeuvers + maneuverKindFromValhallaType
  valhallaClient.ts            MODIFY · response now carries maneuvers

src/ui/
  formatDistanceImperial.ts    NEW · pure formatter
  maneuverIcon.ts              NEW · maneuverKindToSvg pure fn
  directionsPanel.ts           NEW · DirectionsPanel class
  routeSummaryCard.ts          (untouched · onDetails already in shape)

src/
  app.ts                       MODIFY · wire onDetails + onSelect → DirectionsPanel

tests/unit/routing/
  maneuverParser.test.ts       NEW
  router.test.ts               MODIFY · stub mock gains maneuvers: []
tests/unit/ui/
  formatDistanceImperial.test.ts  NEW
  maneuverIcon.test.ts            NEW
  directionsPanel.test.ts         NEW
  plannerCard.test.ts          MODIFY · mockResolvedValue gains maneuvers: []
tests/integration/
  valhallaClient.test.ts       MODIFY · assert maneuvers returned
tests/e2e/
  directionsPanel.spec.ts      NEW
```

**Dependency graph (task order):**
```
01 (domain types) ─ pure
02 (parser + parser tests) ─ needs 01
03 (ValhallaClient) ── needs 02
04 (router/plannerCard test stub updates) ── needs 03 (compile-time gate)
05 (integration test) ── needs 03
06 (formatDistanceImperial) ─ pure
07 (maneuverIcon) ─ pure
08 (DirectionsPanel + tests) ── needs 01, 06, 07
09 (app.ts wiring) ── needs 08
10 (E2E test) ── needs 09
```

---

## Pre-flight (before Task 1)

- [ ] Confirm you are on `feat/phase-0b-3b-directions` (created off `feat/phase-0b-3b-wayfinding`).
- [ ] Run baseline:
      `npx tsc --noEmit` → 0 errors.
      `npm test` → 228 passing.
      `npm run lint` → 0 errors.
- [ ] If baseline fails, stop and report — do not start until green.

---

## Task 1 — Domain types: `ManeuverKind` + `RouteManeuver`

**Why:** Stable domain shape that downstream parser, panel, and tests all key off. Pure types; no behaviour.

**Files:**
- Create: `src/domain/maneuver.ts`
- Modify: `src/domain/route.ts`

- [ ] **Step 1: Create `src/domain/maneuver.ts`** with the `ManeuverKind` union and `RouteManeuver` interface exactly as defined in the spec (§5.1).
- [ ] **Step 2: Update `src/domain/route.ts`** to add `readonly maneuvers: readonly RouteManeuver[]` to `RouteResult`. Import the type from the new file.
- [ ] **Step 3: Run typecheck.**
      `npx tsc --noEmit`
      Expected failures: every site that constructs a `RouteResult` (i.e. `valhallaClient.ts`, the router unit-test stub, and the plannerCard mock). These are the tasks that come next.

**Done when:** types compile in isolation; `tsc` reports failures only at the known three call sites listed above.

---

## Task 2 — Parser: `parseManeuvers` + `maneuverKindFromValhallaType`

**Why:** Maps Valhalla's per-leg JSON into the stable domain type. Pure functions; no I/O.

**Files:**
- Create: `src/routing/maneuverParser.ts`
- Create: `tests/unit/routing/maneuverParser.test.ts`

- [ ] **Step 1: Write the test first (TDD).**
      Cover:
      - `maneuverKindFromValhallaType(1) === 'depart'`
      - `maneuverKindFromValhallaType(4) === 'arrive'` (Valhalla "destination")
      - `maneuverKindFromValhallaType(10) === 'right'`
      - `maneuverKindFromValhallaType(15) === 'left'`
      - `maneuverKindFromValhallaType(26) === 'roundabout-enter'`
      - `maneuverKindFromValhallaType(27) === 'roundabout-exit'`
      - `maneuverKindFromValhallaType(99) === 'other'` (unknown)
      - `parseManeuvers([])` → `[]`.
      - One-leg, two-maneuver input → length 2, in order; `length: 0.5` km → `distanceMeters: 500`.
      - Missing `street_names` → `[]`.
      - Missing `maneuvers` array on a leg → ignored (no throw).
      - Two-leg input concatenates.
      - `rawValhallaType` round-trips.
- [ ] **Step 2: Run the test — expect FAIL** (module does not exist).
- [ ] **Step 3: Implement `src/routing/maneuverParser.ts`.**
      - Export the Valhalla→Kind mapper as a switch (or a `Map<number, ManeuverKind>` const). Default to `'other'`.
      - Export `parseManeuvers(legs)` that:
        - Maps over `legs`, then over each leg's `maneuvers ?? []`, accumulating.
        - Multiplies `length` (km) by 1000 and rounds via `Math.round`.
        - Uses `m.street_names ?? []` as `streetNames` (defensive copy not required — Valhalla already gives an array; preserve readonly contract via the type).
        - Preserves `m.type` in `rawValhallaType`.
- [ ] **Step 4: Run the test — expect PASS.**

**Done when:** vitest run of `tests/unit/routing/maneuverParser.test.ts` is green; `tsc` failures at this file are gone (the upstream three sites remain).

---

## Task 3 — `ValhallaClient` returns maneuvers

**Why:** Threads the parsed maneuvers from Valhalla's response into `RouteResult` so the router and UI can consume them.

**Files:**
- Modify: `src/routing/valhallaClient.ts`

- [ ] **Step 1:** Extend `ValhallaRouteResponse.trip.legs[]` interface to include the optional `maneuvers` array, matching the parser's input contract.
- [ ] **Step 2:** Import `parseManeuvers` from `./maneuverParser`.
- [ ] **Step 3:** Call `parseManeuvers(data.trip.legs)` and include the result as `maneuvers` in the returned `RouteResult`.
- [ ] **Step 4:** Run `npx tsc --noEmit` — the only remaining errors should be in the router/plannerCard test stubs.

**Done when:** `valhallaClient.ts` compiles; existing `tests/unit/routing/valhallaClient.test.ts` still passes.

---

## Task 4 — Update the two known test stubs

**Why:** Making `maneuvers` required (not optional) on `RouteResult` is the cleaner contract. Two tests build inline mocks of `RouteResult` and need the field too.

**Files:**
- Modify: `tests/unit/routing/router.test.ts`
- Modify: `tests/unit/ui/plannerCard.test.ts`

- [ ] **Step 1:** In `tests/unit/routing/router.test.ts`, find the `vi.fn().mockResolvedValue({...})` in `makeStubValhalla`. Add `maneuvers: []` to the returned object.
- [ ] **Step 2:** In `tests/unit/ui/plannerCard.test.ts`, find `vi.fn().mockResolvedValue({ shortest: { polyline: [] }, private: { polyline: [] } })`. Either:
      - cast with `as never` (the file already uses `as never` in places), OR
      - flesh out the stub to a minimal valid `RouteComparison` shape including `maneuvers: []` on both routes.
      Pick whichever causes the fewest test changes.
- [ ] **Step 3:** Run `npx tsc --noEmit` — expect 0 errors.
- [ ] **Step 4:** Run `npm test` — expect 228+ passing (no regressions; new parser tests already added in Task 2).

**Done when:** typecheck is clean; the existing test suite is green.

---

## Task 5 — Integration: live Atlanta route returns maneuvers

**Why:** Pins the contract to Valhalla's actual output. If a future Valhalla upgrade changes the maneuver shape, this test will catch it.

**Files:**
- Modify: `tests/integration/valhallaClient.test.ts`

- [ ] **Step 1:** Add a new `it('returns maneuvers with sensible structure', ...)` block inside the existing describe.
      Use the same start/end as the existing test (Atlanta), expect:
      - `result.maneuvers.length > 1`
      - `result.maneuvers[0].kind === 'depart'`
      - Last maneuver's `kind` matches `/arrive/` (i.e. is `'arrive'`).
      - `result.maneuvers[0].rawValhallaType > 0` (Valhalla returns integer types).
- [ ] **Step 2:** Run `npx vitest run tests/integration/valhallaClient.test.ts` — expect PASS (when Valhalla is up; skips otherwise).

**Done when:** integration tests pass against live Valhalla, or skip cleanly when Valhalla is down (matching the existing pattern).

---

## Task 6 — `formatDistanceImperial`

**Why:** Shared formatter for the directions panel's per-maneuver distance. Pure.

**Files:**
- Create: `src/ui/formatDistanceImperial.ts`
- Create: `tests/unit/ui/formatDistanceImperial.test.ts`

- [ ] **Step 1: Write the test first.**
      Cover the boundaries from spec §5.5: 0, 30, 155, 161, 1610, 8050.
- [ ] **Step 2: Run test — expect FAIL.**
- [ ] **Step 3: Implement** the formatter:
      - `meters < 161` → feet via `meters * 3.28084`, rounded to nearest 10, suffix `' ft'`.
      - else → miles via `meters / 1609.344`, one decimal, suffix `' mi'`.
- [ ] **Step 4: Run test — expect PASS.**

**Done when:** unit test passes.

---

## Task 7 — `maneuverKindToSvg`

**Why:** Pure mapping from kind to an inline SVG icon string. Keeps DirectionsPanel rendering purely declarative.

**Files:**
- Create: `src/ui/maneuverIcon.ts`
- Create: `tests/unit/ui/maneuverIcon.test.ts`

- [ ] **Step 1: Write the test first.**
      For every value of `ManeuverKind` (use a literal array of all kinds in the test):
      - `maneuverKindToSvg(kind)` returns a non-empty string.
      - The result contains `currentColor` (so it inherits ink/dark colour from CSS).
      - The result starts with `'<svg'`.
- [ ] **Step 2: Run test — expect FAIL.**
- [ ] **Step 3: Implement.**
      Use a small `Map<ManeuverKind, string>` of SVG strings. Cover the common kinds (depart, arrive, left/right family, slight-left/right, sharp-left/right, uturn, continue, roundabout-enter/exit, merge, ramp, exit, stay). Fall back to a forward-arrow for anything else. All SVGs share the same 18×18 viewBox, stroke 2, stroke-linecap round, no fill.
- [ ] **Step 4: Run test — expect PASS.**

**Done when:** every kind maps to a valid SVG string.

---

## Task 8 — `DirectionsPanel` component

**Why:** The user-visible payload of this whole sub-project.

**Files:**
- Create: `src/ui/directionsPanel.ts`
- Create: `tests/unit/ui/directionsPanel.test.ts`

- [ ] **Step 1: Write the tests first.**
      Setup: `document.body.innerHTML = '<div id="map" style="position:relative"></div>'`.
      Use a fixture `RouteComparison` with three maneuvers in each route, distinguishable by their `instruction` text (e.g. `'SHORTEST-A'`, `'SHORTEST-B'`, `'SHORTEST-ARRIVE'` vs `'PRIVATE-A'`...).
      Tests:
      - Renders `[data-directions-panel]` once.
      - Initially shows the route specified by `initialSelectedRoute` (`'private'`): three `[data-maneuver-row]` rows, each `textContent` containing the corresponding fixture string.
      - Header has the route-kind chip with text `Private` (or `Shortest`).
      - `panel.setRoute('shortest')` swaps the rows to the shortest fixture and updates the chip.
      - `panel.setRoute(same kind)` is idempotent (no flicker; still 3 rows).
      - Close button (`button[data-action="close"]`) calls `onClose` exactly once.
      - Esc key on the document calls `onClose` exactly once.
      - `panel.destroy()` removes the DOM node and unsubscribes the Esc listener (calling document.dispatchEvent of an Esc keydown after destroy does NOT call `onClose`).
      - Each row uses `formatDistanceImperial`; assert one feet row (set fixture distance under 161 m) and one miles row (set fixture distance to 2000 m).
- [ ] **Step 2: Run tests — expect FAIL.**
- [ ] **Step 3: Implement `DirectionsPanel`.**
      Constructor mounts:
      - `<aside data-directions-panel role="region" aria-label="Driving directions">` with the position styling from spec §6.
      - Header row: back/close button on the left (Esc + click), origin → destination text in the middle, route-kind chip on the right.
      - Summary line: total distance (sum of `maneuvers[].distanceMeters` via `formatDistanceImperial`) and total minutes (sum of `durationSeconds / 60`, rounded).
      - `<ol data-maneuver-list aria-label="Turn-by-turn maneuvers">` containing one `<li data-maneuver-row>` per maneuver. Layout: 24px icon column, instruction + street column, distance column (right, mono).
      - For the final ("arrive") row, omit the distance column.
      - Esc handler attached to `document` in constructor; removed in `destroy`.
      `setRoute(kind)` re-renders only the list + chip in place (no full re-mount).
- [ ] **Step 4: Run tests — expect PASS.**
- [ ] **Step 5: Run `npm test`** — confirm overall suite green.

**Done when:** all DirectionsPanel unit tests pass.

---

## Task 9 — Wire `app.ts` → `DirectionsPanel`

**Why:** Connect the existing `onDetails` callback on the summary card to a real panel; thread tile-selection changes into the panel.

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1:** Import `DirectionsPanel` and the new types.
- [ ] **Step 2:** In the `onCompare` resolution branch (where `mountRouteSummaryCard` is called), introduce two local-scoped variables:
      - `directionsPanel: DirectionsPanel | null = null`
      - `selectedRoute: 'shortest' | 'private' = cmp.private ? 'private' : 'shortest'`
- [ ] **Step 3:** Implement the `onSelect(kind)` callback:
      - Sets `selectedRoute = kind`.
      - If `directionsPanel` is mounted, call `directionsPanel.setRoute(kind)`.
      - (Existing comment about "future: re-style selected polyline" stays for now.)
- [ ] **Step 4:** Implement the `onDetails()` callback:
      - Remove any existing `[data-route-summary-card]` from `mapEl` (cleaner than `display:none`).
      - Construct `directionsPanel = new DirectionsPanel(mapEl, { comparison: cmp, initialSelectedRoute: selectedRoute, originLabel, destinationLabel, onClose })`.
      - `onClose`: destroy the panel, set `directionsPanel = null`, re-mount `mountRouteSummaryCard` with the same options.
- [ ] **Step 5:** Verify `npm test` is still green.
- [ ] **Step 6:** Smoke-test in the browser: `npm run valhalla:up`, `npm run dev`, plan a route, click `Details`, see the panel; flip the tile, see the maneuvers swap.

**Done when:** the panel mounts and closes cleanly; tile selection updates the list.

---

## Task 10 — E2E test for the directions panel

**Why:** Catches integration regressions (selector, mount/unmount, panel content).

**Files:**
- Create: `tests/e2e/directionsPanel.spec.ts`

- [ ] **Step 1: Write the test.**
      Mirror the `planRoute()` helper from `tests/privacy/networkInvariants.spec.ts` (Krog → Ponce). After plan completes and the summary card is visible:
      - Click `button[data-action="details"]`.
      - Wait for `[data-directions-panel]` visible.
      - Assert `[data-maneuver-row]` count `> 0`.
      - Click `button[data-action="close"]` inside the panel.
      - Assert `[data-route-summary-card]` is visible again and `[data-directions-panel]` is gone.
- [ ] **Step 2:** Use the `test.beforeAll` Valhalla-ready probe pattern from the existing privacy test so the test skips cleanly when Valhalla is down.
- [ ] **Step 3:** Run `npx playwright test tests/e2e/directionsPanel.spec.ts` — expect PASS.

**Done when:** E2E green, with Valhalla up; cleanly skipped with Valhalla down.

---

## Verification (after all tasks)

- [ ] `npx tsc --noEmit` → 0 errors.
- [ ] `npm run lint` → 0 errors.
- [ ] `npm test` → all green, count > 228 (new tests added).
- [ ] `npx playwright test tests/privacy/ tests/e2e/` → all green (or cleanly skipped on Valhalla absence).
- [ ] `git diff --stat feat/phase-0b-3b-wayfinding..HEAD` shows only the files listed in the File Structure section — no incidental edits, no scope creep.
- [ ] Manual smoke test: plan a route; the summary card appears; click Details; panel lists maneuvers; flip the tile; list updates; close; summary returns.

Open the PR with `--base feat/phase-0b-3b-wayfinding`, noting that it stacks on PR #3 / PR #4.
