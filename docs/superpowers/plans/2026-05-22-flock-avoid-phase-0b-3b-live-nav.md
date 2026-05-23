# Phase 0b-3b · Sub-project D — Live Turn-by-Turn Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live navigation mode that follows the user's GPS, advances the maneuver pointer, and re-routes (against the same camera-avoidance cost model) when the user drifts off the planned line. The static directions panel from Sub-project B stays.

**Hard product line (do not cross at any task):** This is navigation — the *user's own* position drives all behaviour. There is no input pathway, type, method, comment, or class member in this PR that models a follower, pursuer, drone, or adversary. The reroute trigger is and remains: "the user moved off the planned polyline." If you find yourself writing anything else, stop and re-read spec §1.1.

**Spec:** `docs/superpowers/specs/2026-05-22-flock-avoid-phase-0b-3b-live-nav.md`
**Branch:** `feat/phase-0b-3b-live-nav` (stacked on `feat/phase-0b-3b-full-us-valhalla`)
**Baseline:** 255 vitest + Playwright passing on `feat/phase-0b-3b-full-us-valhalla`.

---

## File Structure (created or modified by this plan)

```
src/routing/
  routeGeometry.ts             NEW · pure geometry helpers
src/nav/
  navigationSession.ts         NEW · NavigationSession class
src/ui/
  navigationBanner.ts          NEW · NavigationBanner class

src/
  app.ts                       MODIFY · wire onStart → live nav, onEnd → restore overview
  ui/routeSummaryCard.ts       UNCHANGED · onStart is already in the shape we need

tests/unit/routing/
  routeGeometry.test.ts        NEW
tests/unit/nav/
  navigationSession.test.ts    NEW
tests/unit/ui/
  navigationBanner.test.ts     NEW
tests/e2e/
  liveNavigation.spec.ts       NEW
```

**Dependency graph (task order):**

```
01 (spec + plan, already done) ─ this file
02 (routeGeometry pure fns + tests) ─ leaf
03 (NavigationSession + tests) ── needs 02
04 (NavigationBanner + tests) ── leaf (depends only on NavigationView shape from 03)
05 (app.ts wiring) ── needs 03 + 04
06 (E2E test) ── needs 05
07 (full verification + PR)
```

---

## Pre-flight (before Task 2)

- [ ] Confirm you are on `feat/phase-0b-3b-live-nav` (created off `feat/phase-0b-3b-full-us-valhalla`).
- [ ] Run baseline:
      `npx tsc --noEmit` → 0 errors.
      `npm test` → 255 passing.
      `npm run lint` → 0 errors (1 pre-existing PR #3 warning permitted).
- [ ] If baseline fails, stop and report — do not start until green.

---

## Task 2 — `src/routing/routeGeometry.ts` (pure functions)

**Why:** Off-route detection, snap-to-route, and maneuver advancement all key off geometry. Pure fns are unit-testable without a live GPS, a clock, or DOM.

**Files:**
- Create: `src/routing/routeGeometry.ts`
- Create: `tests/unit/routing/routeGeometry.test.ts`

- [ ] **Step 1: Write the tests first (TDD).**
      For `haversineMeters`:
      - `haversine({lat:0,lon:0}, {lat:0,lon:0})` === 0.
      - `haversine({lat:0,lon:0}, {lat:0,lon:1})` is roughly 111_320 m (±1%).
      - Atlanta block: `haversine({lat:33.75,lon:-84.39}, {lat:33.751,lon:-84.39})` ≈ 111 m (±5 m).

      For `perpendicularDistanceMeters`:
      - Point exactly on segment → 0 (within 0.5 m).
      - Point at one endpoint → 0.
      - Right-triangle case at low latitude (∼0): segment along the equator from (0,0)→(0,0.01) (≈1113 m), point at (0.0001, 0.005) → distance ≈ 11.13 m (within 5%).

      For `snapToPolyline`:
      - On a straight east-west polyline of 3 vertices, a query point above the middle vertex returns `segmentIndex === 0 or 1` and `distanceMeters > 0`.
      - A query point identical to `polyline[0]` returns `segmentIndex === 0`, `distanceMeters` ≈ 0, `alongMeters` ≈ 0.
      - A query point past the last vertex returns `segmentIndex === polyline.length - 2`.
      - Single-vertex polyline (degenerate) returns a `SnapResult` with `segmentIndex === 0` and `distanceMeters` === haversine distance from that vertex.

      For `advanceManeuverIndex`:
      - With maneuvers `[{begin:0,end:2}, {begin:2,end:5}, {begin:5,end:7}]` and `currentIndex=0`:
        - snappedSegmentIndex=1 → returns 0 (haven't crossed yet).
        - snappedSegmentIndex=2 → returns 1 (we've reached the next maneuver's begin).
        - snappedSegmentIndex=5 → returns 2.
        - snappedSegmentIndex=99 → returns 2 (clamped, last index).
      - Never decreases: `advance([...], 2, 0)` returns 2.

      For `distanceToManeuver`:
      - On a 3-vertex polyline with cumulative distances 0, 100, 250 m (straight east-west), with the user snapped at vertex 0 and target maneuver beginShapeIndex=2 → returns ≈ 250 (±5).
      - User snapped halfway between vertex 0 and 1 → returns ≈ 250 - 50 = 200 (±5).

- [ ] **Step 2: Run the tests — expect FAIL** (module does not exist).
- [ ] **Step 3: Implement `src/routing/routeGeometry.ts`.** Notes:
      - Use the equirectangular approximation for perpendicular distance — convert to local meters via `(dlon * cos(latRad)) * 111_320` and `dlat * 111_320`. At segment scales (tens of meters) the spherical error is negligible.
      - `snapToPolyline` iterates all segments, projects the input point onto each, clamps the projection parameter `t ∈ [0,1]`, and picks the segment with the smallest perpendicular distance. Track `alongMeters` by accumulating `haversineMeters` of preceding segments plus the partial along-segment distance.
      - `advanceManeuverIndex`: linear walk; `nextIdx = currentIndex; while (nextIdx < maneuvers.length - 1 && snappedSegmentIndex >= maneuvers[nextIdx + 1].beginShapeIndex) nextIdx++; return nextIdx;`
      - All functions are pure, all arguments are `readonly`, no `Date`, `Math.random`, `fetch`, or DOM.
- [ ] **Step 4: Run the tests — expect PASS.**
- [ ] **Step 5: `npx tsc --noEmit` → 0 errors. `npm run lint` → no new warnings.**

**Done when:** geometry helpers exist, are fully covered, tsc and lint green.

---

## Task 3 — `src/nav/navigationSession.ts` (the state machine)

**Why:** Closes the loop between `LocationStore`, the active route, and `Router`. Holds the "this is navigation, not pursuit evasion" guardrail in the type system.

**Files:**
- Create: `src/nav/navigationSession.ts`
- Create: `tests/unit/nav/navigationSession.test.ts`

- [ ] **Step 1: Write the tests first.** Use a stub `Router` (object with a `compareRoutes: vi.fn()`), a stub `LocationStore` that just stores its subscriber, and inject `now: () => fakeNow` plus a manual `feedPosition` to drive the session deterministically.

      Use a fixture `RouteComparison` whose private polyline is `[{lat:33.75,lon:-84.40},{lat:33.75,lon:-84.39},{lat:33.75,lon:-84.38},{lat:33.75,lon:-84.37}]` and whose maneuvers are:
      - `{ kind:'depart',  instruction:'Depart',  distanceMeters:1000, durationSeconds:60, beginShapeIndex:0, endShapeIndex:1, rawValhallaType:1, streetNames:[] }`
      - `{ kind:'right',   instruction:'Turn right', distanceMeters:1000, durationSeconds:60, beginShapeIndex:1, endShapeIndex:2, rawValhallaType:10, streetNames:[] }`
      - `{ kind:'left',    instruction:'Turn left',  distanceMeters:1000, durationSeconds:60, beginShapeIndex:2, endShapeIndex:3, rawValhallaType:15, streetNames:[] }`
      - `{ kind:'arrive',  instruction:'Arrive',     distanceMeters:0,    durationSeconds:0,  beginShapeIndex:3, endShapeIndex:3, rawValhallaType:4, streetNames:[] }`

      Tests:
      - **Initial view.** `session.start()` then `feedPosition(polyline[0])`: latest `onUpdate` view has `activeRouteKind === 'private'`, `activeManeuverIdx === 0`, `distanceToNextManeuverMeters` ≈ 1000 (the depart maneuver's distance to the next maneuver's begin), `distanceOffRouteMeters` < 5, `isRerouting === false`, `hasArrived === false`.
      - **Maneuver advance.** Feed `polyline[1]` (i.e. `endShapeIndex` of the depart maneuver). View: `activeManeuverIdx === 1`, instruction === `'Turn right'`.
      - **Idempotent feed.** Feeding the same on-route point twice does not change the maneuver index.
      - **No reroute under threshold.** Feed a point 30 m off the line for 10 seconds (advance fake clock). `router.compareRoutes` is not called. `view.distanceOffRouteMeters > 0` is reported.
      - **No reroute under persistence.** Feed a point 100 m off the line, but advance the clock only 2 seconds before feeding an on-route point. `router.compareRoutes` is not called. Off-route state is cleared.
      - **Reroute fires.** Feed a point 100 m off the line, advance clock 6 seconds, feed again at the same off-route point. `router.compareRoutes` is called exactly once with `(somePosition, originalDestination, threatProfile)`. `onRouteChanged` is called with the new comparison and the same route kind. View: `activeManeuverIdx === 0` on the new route.
      - **Reroute cooldown.** After a successful reroute, feed an off-route point for 6 more seconds. Within 10 seconds of the reroute, no second `compareRoutes` call. After 10 s, a third feed triggers a second `compareRoutes`.
      - **Reroute failure.** `router.compareRoutes` rejects. `onError` is called with a non-empty message. Active route is unchanged. After cooldown, next off-route persistence triggers a retry.
      - **Arrival.** Feed a position within 30 m of the destination. View: `hasArrived === true`. The session calls its own `stop()` (subscription removed).
      - **Pursuit-evasion guardrail (the boundary test).** This test asserts the public surface of the class:
        ```ts
        const methods = Object.getOwnPropertyNames(NavigationSession.prototype);
        const FORBIDDEN = ['adversary','pursuer','follower','tail','evade','suspect','threat'];
        for (const m of methods) for (const f of FORBIDDEN) {
          expect(m.toLowerCase()).not.toContain(f);
        }
        // And the only mutation entry point takes one GeoPoint.
        expect(NavigationSession.prototype.feedPosition.length).toBe(1);
        ```
      - **Cleanup.** `session.destroy()` unsubscribes from the location store and subsequent `feedPosition` calls do not invoke `onUpdate` (callback is severed).

- [ ] **Step 2: Run the tests — expect FAIL.**
- [ ] **Step 3: Implement `src/nav/navigationSession.ts`.** Sketch:
      - The class holds: `activeRoute: RouteResult`, `comparison: RouteComparison`, `activeKind`, `activeManeuverIdx`, `offRouteSinceMs: number | null`, `lastRerouteAtMs: number`, `now()`, `originalDestination: GeoPoint`, `threatProfile`, the three callbacks, a `LocationStore` subscription token.
      - `start()` calls `locationStore.subscribe(s => { if (s.status === 'tracking') feedPosition(s.position) })`.
      - `feedPosition(p)`:
        - Snap to active route polyline.
        - Compute new maneuver index.
        - Compute distance-to-next-maneuver.
        - Compute ETA: `activeRoute.durationSeconds * (1 - alongMeters/totalRouteMeters)`, clamped to `[0, durationSeconds]`.
        - Compute arrival: `haversineMeters(p, originalDestination) <= arrivalRadiusMeters` → emit `hasArrived: true`, then `stop()`.
        - Off-route tracker:
          - If `snap.distanceMeters > offRouteMeters`: if `offRouteSinceMs === null`, set to `now()`. Else if `now() - offRouteSinceMs >= offRoutePersistMs` AND `now() - lastRerouteAtMs >= rerouteCooldownMs` AND not already rerouting: kick off reroute.
          - Else (`snap.distanceMeters <= offRouteMeters`): clear `offRouteSinceMs`.
        - Emit `onUpdate(view)`.
      - Reroute: set `isRerouting=true`, emit; `await router.compareRoutes(p, originalDestination, threatProfile)`; on success, replace `activeRoute` (matching `activeKind`; if the new comparison has `degradation`, both sides are equal so it doesn't matter), reset maneuver index to 0, `lastRerouteAtMs = now()`, set `isRerouting=false`, call `onRouteChanged(newCmp, activeKind)`, emit; on failure, set `isRerouting=false`, emit, call `onError(...)`.
      - `feedPosition` is the public mutation entry; expose it for tests, and have the LocationStore subscription path call it internally with the position from `state.position`.
      - All callbacks are wired through `opts`; the class never reaches into the DOM.
- [ ] **Step 4: Run the tests — expect PASS.**
- [ ] **Step 5: `npx tsc --noEmit` → 0 errors. `npm run lint` → no new warnings.**

**Done when:** all `navigationSession.test.ts` tests pass, including the pursuit-evasion-guardrail test. The class's public surface is `constructor`, `start`, `stop`, `feedPosition`, `destroy` — and *nothing* that names or models an adversary.

---

## Task 4 — `src/ui/navigationBanner.ts`

**Why:** The user-visible payload. Must hit the v0.2 design language and stay quiet to screen readers.

**Files:**
- Create: `src/ui/navigationBanner.ts`
- Create: `tests/unit/ui/navigationBanner.test.ts`

- [ ] **Step 1: Write the tests first.** Setup `document.body.innerHTML = '<div id="map" style="position:relative"></div>'`.
      Tests:
      - Mounts `[data-navigation-banner]` once, with `role="region"` and `aria-label` matching `/navigation/i`.
      - Has an `[aria-live="polite"]` region for the next-maneuver text.
      - `update({...})` writes the distance and instruction into the live region (assert `textContent` contains both).
      - `update({ etaSeconds: 14*60, ... })` shows an ETA string ≈ `"ETA 14 min"`.
      - `update({ isRerouting: true })` shows an element matching `[data-rerouting]`; `update({ isRerouting: false })` removes it.
      - `update({ hasArrived: true })` shows `/arrived/i` in the live region and switches the End button to `/done/i`.
      - `button[data-action="end-navigation"]` click calls `onEnd` once.
      - Esc keydown on `document` calls `onEnd` once.
      - `showError('hi')` mounts an error strip whose text contains `'hi'`. After fake-advancing timers 6+ seconds, the strip is gone.
      - `destroy()` removes the DOM node and unbinds the Esc listener (subsequent Esc dispatch does not call `onEnd`).
- [ ] **Step 2: Run tests — expect FAIL.**
- [ ] **Step 3: Implement `NavigationBanner`.** Notes:
      - Root `<aside data-navigation-banner role="region" aria-label="Navigation">`, top-anchored absolute positioning, width `min(560px, calc(100% - 32px))`, `top: var(--space-4)`, `left: 50%`, `transform: translateX(-50%)`, z-index `7` (above the bottom-anchored summary's `5`).
      - Two-row layout (CSS via inline styles, matching `routeSummaryCard.ts` precedent):
        - Top row: 32px icon, distance + instruction live region (`aria-live="polite"`), ETA pill, End button.
        - Distance is `font-size: var(--font-size-xl); font-weight: 600`.
        - Instruction is `font-size: var(--font-size-base); font-weight: 500; color: var(--color-ink-2)` with overflow ellipsis.
        - End button: pill, `var(--color-ink)` background, `var(--color-surface)` text.
      - Re-routing indicator: small inline pill `data-rerouting` with `var(--color-accent)` text, `var(--color-accent-soft)` background, label "Re-routing…". Mounted between ETA and End button.
      - Error strip: `data-banner-error`, `var(--color-threat)` text, `var(--color-threat-soft)` background, auto-dismisses after 6 s via `setTimeout`.
      - Arrival state: replace the live-region content with "You've arrived." and change the End button label to "Done".
      - Use `maneuverKindToSvg(view.nextManeuverKind)` for the icon column (the function exists from Sub-project B).
      - Use `formatDistanceImperial(view.distanceToNextManeuverMeters)` for the distance string.
- [ ] **Step 4: Run tests — expect PASS.**
- [ ] **Step 5: `npx tsc --noEmit` → 0 errors. `npm run lint` → no new warnings.**

**Done when:** all banner tests pass.

---

## Task 5 — Wire it together in `src/app.ts`

**Why:** Connect the existing `onStart` callback on the summary card to the new session + banner; restore the summary card on End.

**Files:**
- Modify: `src/app.ts`

- [ ] **Step 1:** Import `NavigationSession` from `./nav/navigationSession` and `NavigationBanner` from `./ui/navigationBanner`.
- [ ] **Step 2:** Inside the `onCompare` success branch (just above `mountSummary`), define `beginLiveNavigation(kind: 'shortest' | 'private')`:
      - Remove `[data-route-summary-card]` and `[data-directions-panel]` from `mapEl`.
      - If a previous `directionsPanel` is live, destroy it.
      - Call `locationStore.start()` (idempotent — `LocationStore.start` already guards on `watchId !== null`).
      - Create the banner host as a child of `mapEl` (or pass `mapEl` directly).
      - Construct `NavigationBanner(mapEl, { onEnd: endLiveNavigation })`.
      - Construct `NavigationSession({
          initialComparison: cmp,
          initialRouteKind: kind,
          threatProfile: currentProfile,
          router,
          locationStore,
          onUpdate: (view) => banner.update(view),
          onRouteChanged: (newCmp, newKind) => {
            mapView.renderComparison(newCmp);
            // Update the local cmp reference for future re-routes:
            cmpRef.current = newCmp;
          },
          onError: (msg) => banner.showError(msg),
        })`.
      - `session.start()`.
      - Define `endLiveNavigation = () => { session.destroy(); banner.destroy(); mountSummary(); }`.
- [ ] **Step 3:** Replace `onStart: () => { /* ... */ }` with `onStart: () => beginLiveNavigation(selectedRoute)`.
- [ ] **Step 4:** Update the comment on `onStart` in `routeSummaryCard.ts` if needed — the existing JSDoc says `onStart` opens live navigation; it's already accurate, so this may be a no-op.
- [ ] **Step 5:** `npx tsc --noEmit` → 0 errors. `npm test` → all previously-passing tests still pass. `npm run lint` → no new warnings.

**Done when:** typecheck and lint clean, full vitest green, manual smoke test passes (see Step 6).

- [ ] **Step 6 (manual):** `npm run valhalla:up`, `npm run dev`, plan a route in Atlanta, click "Start →", confirm the banner appears at the top of the map and reads as expected. Click End. Summary card returns.

---

## Task 6 — E2E test

**Why:** Catches integration regressions for the start/end flow. The reroute path requires actual GPS movement which Playwright can simulate via `context.setGeolocation`, but the deterministic on-route position assertion is fragile — keep the E2E shallow and let the unit tests cover the reroute logic.

**Files:**
- Create: `tests/e2e/liveNavigation.spec.ts`

- [ ] **Step 1: Write the test.**
      - Reuse the existing `planRoute()` helper pattern from `tests/privacy/networkInvariants.spec.ts`.
      - `test.beforeAll` Valhalla probe + skip pattern.
      - Use `browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: 33.7548, longitude: -84.3669 } })` so the user is already located near Krog Street Market (so the recenter/use-location flow does not block the test).
      - After plan completes and `[data-route-summary-card]` is visible:
        - Click `button[data-action="start"]`.
        - Wait for `[data-navigation-banner]` visible.
        - Assert the banner text contains either `'ft'` or `'mi'` (some distance string).
        - Assert the banner contains some instruction text (non-empty `[aria-live]` element).
        - Click `button[data-action="end-navigation"]`.
        - Assert `[data-route-summary-card]` visible again and `[data-navigation-banner]` removed.
- [ ] **Step 2:** Run `npx playwright test tests/e2e/liveNavigation.spec.ts` (with Valhalla up) → expect PASS. (Skips cleanly if Valhalla is down.)

**Done when:** E2E green (or cleanly skipped on Valhalla absence).

---

## Verification (after all tasks)

- [ ] `npx tsc --noEmit` → 0 errors.
- [ ] `npm run lint` → 0 errors. (1 pre-existing PR #3 warning allowed; no new warnings introduced.)
- [ ] `npm test` → all green, count > 255 (new tests added).
- [ ] `npx playwright test tests/privacy/ tests/e2e/` → all green (or cleanly skipped on Valhalla absence). The privacy invariant test in particular must still pass without modification — proof that no new allowlist entry was added and no extra hosts are contacted.
- [ ] `git diff --stat feat/phase-0b-3b-full-us-valhalla..HEAD` shows only the files listed in File Structure — no incidental edits, no scope creep, no changes to `networkAllowlist.ts`.
- [ ] **Hard product-line review (manual):** grep the diff for the words `pursuer`, `follower`, `tail`, `adversary`, `evasion`, `evade`, `suspect`, `surveil` *outside the spec/plan docs and existing camera-domain code* — expect 0 matches.
- [ ] Manual smoke test: plan a route; click Start; banner appears with sensible content; click End; summary returns.

Open the PR with `--base feat/phase-0b-3b-full-us-valhalla`. PR body must include:
- 1-paragraph "why".
- "What changed" (the four new files + app.ts wiring).
- The nav-vs-pursuit-evasion boundary, with a sentence on how it was kept (no input pathway models an adversary; reroute trigger is the user's own GPS).
- The stack note: stacks on PR #3 / PR #5 / PR #6.
- Test results.
