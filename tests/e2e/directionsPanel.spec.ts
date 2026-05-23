import { test, expect, type Page } from '@playwright/test';
import { dismissWelcomeModalIfPresent } from '../benchmark/helpers/benchmarkHarness';

// We override window.fetch for /valhalla routes inside the browser so the
// test does not depend on a live Valhalla AND avoids saturating Chrome's
// connection pool with real-network mocks (which would starve the route
// call under headless Playwright). Photon is left alone; its proxy is
// exercised by the privacy invariant test.

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

  // Close the planner card so it does not stack above the summary's actions.
  await page.locator('[data-planner-card] button[data-action="close"]').click();
  await page.locator('[data-planner-card]').waitFor({ state: 'hidden', timeout: 3_000 });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(VALHALLA_INIT_SCRIPT);
});

test('Details opens directions panel with maneuver rows', async ({ page }) => {
  await page.goto('/');
  await planMockedRoute(page);

  await page.locator('button[data-action="details"]').click();

  const panel = page.locator('[data-directions-panel]');
  await panel.waitFor({ state: 'visible', timeout: 5_000 });

  const rows = panel.locator('[data-maneuver-row]');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText(/Krog Street/);
  await expect(rows.last()).toContainText(/arrived/i);

  // Summary card is replaced while the panel is mounted.
  await expect(page.locator('[data-route-summary-card]')).toHaveCount(0);
  await expect(panel.locator('[data-route-kind-chip]')).toHaveText(/private/i);
});

test('Close returns to the summary card', async ({ page }) => {
  await page.goto('/');
  await planMockedRoute(page);

  await page.locator('button[data-action="details"]').click();
  const panel = page.locator('[data-directions-panel]');
  await panel.waitFor({ state: 'visible', timeout: 5_000 });

  await panel.locator('button[data-action="close"]').click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('[data-route-summary-card]')).toBeVisible();
});

test('Esc closes the directions panel', async ({ page }) => {
  await page.goto('/');
  await planMockedRoute(page);

  await page.locator('button[data-action="details"]').click();
  const panel = page.locator('[data-directions-panel]');
  await panel.waitFor({ state: 'visible', timeout: 5_000 });

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(page.locator('[data-route-summary-card]')).toBeVisible();
});
