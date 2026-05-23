import { test, expect, type Page } from '@playwright/test';
import { dismissWelcomeModalIfPresent } from '../benchmark/helpers/benchmarkHarness';

// Mock /valhalla/route so the test does not depend on a live Valhalla.
// Same approach as directionsPanel.spec.ts. The polyline geometry here is
// trivial; live nav's geometry helpers are exhaustively covered in the
// vitest unit suite. The E2E test only verifies the mount/unmount flow.

const VALHALLA_INIT_SCRIPT = `
(() => {
  const realFetch = window.fetch.bind(window);
  const VALHALLA_ROUTE_BODY = ${JSON.stringify({
    trip: {
      summary: { length: 1.2, time: 180 },
      legs: [
        {
          shape: 'aaa',
          maneuvers: [
            {
              type: 1,
              instruction: 'Drive east on Krog Street Northeast.',
              street_names: ['Krog Street Northeast'],
              length: 0.6,
              time: 90,
              begin_shape_index: 0,
              end_shape_index: 1,
            },
            {
              type: 10,
              instruction: 'Turn right onto North Highland Avenue Northeast.',
              street_names: ['North Highland Avenue Northeast'],
              length: 0.6,
              time: 90,
              begin_shape_index: 1,
              end_shape_index: 2,
            },
            {
              type: 4,
              instruction: 'You have arrived at Ponce City Market.',
              length: 0,
              time: 0,
              begin_shape_index: 2,
              end_shape_index: 2,
            },
          ],
        },
      ],
    },
  })};
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('/valhalla/route')) {
      return new Response(JSON.stringify(VALHALLA_ROUTE_BODY), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/valhalla/locate')) {
      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return realFetch(input, init);
  };
})();
`;

async function planMockedRoute(page: Page): Promise<void> {
  await dismissWelcomeModalIfPresent(page);
  await page.locator('#map canvas').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(800);

  await page.locator('[data-search-bar-activate]').click();
  await page.locator('[data-planner-card]').waitFor({ state: 'visible', timeout: 3_000 });

  const inputs = page.locator('[data-waypoint] input');
  await inputs.first().click();
  await inputs.first().fill('Krog Street Market, Atlanta');
  await page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('[role="option"]').first().click();

  await inputs.nth(1).click();
  await inputs.nth(1).fill('Ponce City Market, Atlanta');
  await page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('[role="option"]').first().click();

  await page.locator('button[data-action="plan"]').click();
  await page.locator('[data-route-summary-card]').waitFor({ state: 'visible', timeout: 10_000 });

  await page.locator('[data-planner-card] button[data-action="close"]').click();
  await page.locator('[data-planner-card]').waitFor({ state: 'hidden', timeout: 3_000 });
}

test.use({
  permissions: ['geolocation'],
  geolocation: { latitude: 33.7548, longitude: -84.3669 },
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(VALHALLA_INIT_SCRIPT);
});

test('Start enters live navigation and shows the banner', async ({ page }) => {
  await page.goto('/');
  await planMockedRoute(page);

  await page.locator('button[data-action="start"]').click();

  const banner = page.locator('[data-navigation-banner]');
  await banner.waitFor({ state: 'visible', timeout: 5_000 });

  // Banner has the ETA pill and the End button.
  await expect(banner.locator('[data-nav-eta]')).toBeVisible();
  await expect(banner.locator('button[data-action="end-navigation"]')).toBeVisible();

  // Summary card is dismissed while nav is active.
  await expect(page.locator('[data-route-summary-card]')).toHaveCount(0);
});

test('End returns to the route summary card', async ({ page }) => {
  await page.goto('/');
  await planMockedRoute(page);

  await page.locator('button[data-action="start"]').click();
  const banner = page.locator('[data-navigation-banner]');
  await banner.waitFor({ state: 'visible', timeout: 5_000 });

  await banner.locator('button[data-action="end-navigation"]').click();
  await expect(banner).toHaveCount(0);
  await expect(page.locator('[data-route-summary-card]')).toBeVisible();
});

test('Esc ends live navigation', async ({ page }) => {
  await page.goto('/');
  await planMockedRoute(page);

  await page.locator('button[data-action="start"]').click();
  const banner = page.locator('[data-navigation-banner]');
  await banner.waitFor({ state: 'visible', timeout: 5_000 });

  await page.keyboard.press('Escape');
  await expect(banner).toHaveCount(0);
  await expect(page.locator('[data-route-summary-card]')).toBeVisible();
});

// Note: the body-shape invariant for /valhalla/route POSTs is enforced by
// tests/privacy/networkInvariants.spec.ts on the same Router + ValhallaClient
// code path that live navigation re-uses for re-routes. Adding a duplicate
// here would require an unmocked Valhalla request, which this spec
// intentionally avoids — see the addInitScript above.
