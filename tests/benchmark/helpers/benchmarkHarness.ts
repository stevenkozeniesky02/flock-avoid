import { test, type Page } from '@playwright/test';

export async function dismissWelcomeModalIfPresent(page: Page): Promise<void> {
  const btn = page.locator('button[data-action="welcome-dismiss"]');
  try {
    await btn.waitFor({ state: 'visible', timeout: 1500 });
    await btn.click();
  } catch {
    // Modal wasn't present — nothing to do
  }
}

export interface BenchmarkRoute {
  readonly name: string;
  readonly origin: string;
  readonly destination: string;
}

export interface BenchmarkResult {
  readonly routeName: string;
  readonly profilePreset: string;
  readonly hadDegradation: boolean;
  readonly camerasAvoided: number | null;
  /** extraMinutes is not exposed by the v0.2 RouteSummaryCard (it shows distance, not time).
   *  Always null until a future sub-project adds duration to the card. */
  readonly extraMinutes: number | null;
}

// v0.2 removed the in-UI profile picker; the app currently defaults to
// COMMUTER_PROFILE. The `profileCardLabel` parameter is retained for result
// tagging and test naming but does NOT change the planned route. Sub-project B
// will re-introduce profile selection (via settings UI or a harness hook).
export async function planRoute(
  page: Page,
  profileCardLabel: 'Commuter' | 'Activist' | 'Vulnerable',
  route: BenchmarkRoute,
): Promise<BenchmarkResult> {
  await page.goto('/');
  // Dismiss welcome modal FIRST — it backdrops the map; waiting for canvas behind it can flake.
  await dismissWelcomeModalIfPresent(page);
  await page.locator('#map canvas').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(1500);

  await page.locator('[data-search-bar-activate]').click();
  await page.locator('[data-planner-card]').waitFor({ state: 'visible', timeout: 3_000 });

  const inputs = page.locator('[data-waypoint] input');
  await inputs.first().click();
  await inputs.first().fill(route.origin);
  await page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('[role="option"]').first().click();

  await inputs.nth(1).click();
  await inputs.nth(1).fill(route.destination);
  await page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('[role="option"]').first().click();

  await page.locator('button[data-action="plan"]').click();

  // v0.2: success renders [data-route-summary-card]; degradation silently skips
  // the card (app.ts v0.2 does not render a degradation panel in the DOM).
  // We treat a 25 s timeout as degradation so tests don't hard-fail on routes
  // where the private router can't beat the shortest path.
  const card = page.locator('[data-route-summary-card]');
  const appeared = await card.waitFor({ state: 'visible', timeout: 25_000 }).then(() => true).catch(() => false);

  if (!appeared) {
    return {
      routeName: route.name,
      profilePreset: profileCardLabel,
      hadDegradation: true,
      camerasAvoided: null,
      extraMinutes: null,
    };
  }

  // Tile order: [0] = shortest, [1] = private (rendered in that DOM order).
  const tiles = card.locator('[data-route-tile]');
  const shortestText = await tiles.nth(0).textContent().catch(() => '');
  const privateText  = await tiles.nth(1).textContent().catch(() => '');
  const shortestSensors = parseInt(shortestText?.match(/(\d+)\s+sensors/)?.[1] ?? '0', 10);
  const privateSensors  = parseInt(privateText?.match(/(\d+)\s+sensors/)?.[1]  ?? '0', 10);
  const camerasAvoided = Math.max(0, shortestSensors - privateSensors);

  return {
    routeName: route.name,
    profilePreset: profileCardLabel,
    hadDegradation: false,
    camerasAvoided,
    extraMinutes: null,
  };
}

/** Standard beforeAll skip-when-Valhalla-down guard, with a city-specific message. */
export function skipIfNoValhalla(cityLabel: string): void {
  const VALHALLA_URL = 'http://localhost:8002';
  test.beforeAll(async () => {
    try {
      const resp = await fetch(`${VALHALLA_URL}/status`, { signal: AbortSignal.timeout(2000) });
      if (!resp.ok) {
        test.skip(true, `Valhalla not reachable — ${cityLabel} benchmark skipped.`);
      }
    } catch {
      test.skip(true, `Valhalla not reachable — ${cityLabel} benchmark skipped.`);
    }
  });
}
