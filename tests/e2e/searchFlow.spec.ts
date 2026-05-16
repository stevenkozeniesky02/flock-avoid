import { test, expect } from '@playwright/test';
import { dismissWelcomeModalIfPresent } from '../benchmark/helpers/benchmarkHarness';

const PHOTON_PROXY = '/photon';

test.describe('planner search → flyTo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Dismiss the welcome modal first — it blocks the map from rendering
    await dismissWelcomeModalIfPresent(page);

    // Now wait for the map canvas to finish loading
    await page.locator('#map canvas').first().waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(800);
  });

  test('typing into the planner shows Photon results and fills the origin field on select', async ({
    page,
  }) => {
    // The idle search bar should be visible
    await page.locator('[data-search-bar]').waitFor({ state: 'visible', timeout: 5_000 });

    // Open the planner card
    await page.locator('[data-search-bar-activate]').click();
    await page.locator('[data-planner-card]').waitFor({ state: 'visible', timeout: 3_000 });

    // Type a query into the origin field
    const origin = page.locator('[data-waypoint="origin"] input');
    await origin.fill('Krog Street Market, Atlanta');

    // Wait past debounce + fetch — autocomplete options should populate
    const firstOption = page.locator('[role="option"]').first();
    await firstOption.waitFor({ state: 'visible', timeout: 5_000 });
    await expect(firstOption).toContainText(/Krog/i);

    // Select the first result
    await firstOption.click();

    // The origin field should now display the picked place name
    await expect(origin).toHaveValue(/Krog Street Market/i);

    // Allow flyTo animation to complete, then verify no error banner is shown
    await page.waitForTimeout(800);
    await expect(page.locator('[data-error-banner]')).toHaveCount(0);
  });

  test('Photon queries go through the same-origin proxy, not directly to photon.komoot.io', async ({
    page,
  }) => {
    const directPhotonHits: string[] = [];

    page.on('request', (req) => {
      if (req.url().startsWith('https://photon.komoot.io')) {
        directPhotonHits.push(req.url());
      }
    });

    await page.locator('[data-search-bar]').waitFor({ state: 'visible', timeout: 5_000 });
    await page.locator('[data-search-bar-activate]').click();
    await page.locator('[data-planner-card]').waitFor({ state: 'visible', timeout: 3_000 });

    const origin = page.locator('[data-waypoint="origin"] input');
    await origin.fill('Krog Street Market, Atlanta');

    // Wait past debounce — any Photon fetch should have fired by now
    await page.waitForTimeout(1_200);

    // Verify all geocode requests were proxied (same-origin) and none leaked directly
    expect(
      directPhotonHits,
      `Direct requests to photon.komoot.io bypassed the proxy: ${JSON.stringify(directPhotonHits)}`,
    ).toHaveLength(0);

    // Verify the proxy path was used (at least one request to /photon)
    const allRequests = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((e) => e.name)
        .filter((n) => n.includes('/photon')),
    );
    expect(allRequests.length, `Expected at least one ${PHOTON_PROXY} proxy request`).toBeGreaterThan(
      0,
    );
  });
});
