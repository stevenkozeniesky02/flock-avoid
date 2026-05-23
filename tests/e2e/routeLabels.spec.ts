/**
 * Regression for the v0.2 label bug.
 *
 * Before: the summary card and directions-panel header rendered raw
 * "33.755, -84.387" coordinate strings regardless of what the user selected
 * from Photon autocomplete. Fix threads the chosen place names through the
 * planner -> app -> summary/directions flow via a new `labels` argument to
 * `onCompare`.
 *
 * This test plans a real Atlanta route, asserts the summary card title
 * shows the chosen Photon names, then opens directions and asserts the
 * panel header shows them too.
 */
import { test, expect, type Page } from '@playwright/test';
import { dismissWelcomeModalIfPresent } from '../benchmark/helpers/benchmarkHarness';

const VALHALLA_URL = 'http://localhost:8002';
const ORIGIN = 'Krog Street Market, Atlanta';
const DESTINATION = 'Ponce City Market, Atlanta';

// Looser check than equality to absorb the trailing ", USA" / state suffix
// that Photon may include — but it MUST contain the recognisable place name
// and MUST NOT look like a raw coordinate pair.
const COORD_LIKE = /^\s*-?\d+\.\d+\s*,\s*-?\d+\.\d+\s*$/;

async function planAtlantaRoute(page: Page): Promise<void> {
  await dismissWelcomeModalIfPresent(page);
  await page.locator('#map canvas').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(1200);

  await page.locator('[data-search-bar-activate]').click();
  await page.locator('[data-planner-card]').waitFor({ state: 'visible', timeout: 3_000 });

  const inputs = page.locator('[data-waypoint] input');
  await inputs.first().click();
  await inputs.first().fill(ORIGIN);
  await page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 8_000 });
  await page.locator('[role="option"]').first().click();

  await inputs.nth(1).click();
  await inputs.nth(1).fill(DESTINATION);
  await page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 8_000 });
  await page.locator('[role="option"]').first().click();

  await page.locator('button[data-action="plan"]').click();
  await page.locator('[data-route-summary-card]').waitFor({ state: 'visible', timeout: 25_000 });
}

test.beforeAll(async () => {
  try {
    const resp = await fetch(`${VALHALLA_URL}/status`, { signal: AbortSignal.timeout(2000) });
    if (!resp.ok) test.skip(true, 'Valhalla not reachable — skipping route label regression.');
  } catch {
    test.skip(true, 'Valhalla not reachable — skipping route label regression.');
  }
});

test('route summary card title shows Photon place names, not coordinates', async ({ page }) => {
  await page.goto('/');
  await planAtlantaRoute(page);

  // The first <span> child of the summary card is the title (origin → destination).
  // We read it as visible text to avoid coupling to internal structure.
  const card = page.locator('[data-route-summary-card]');
  const headText = await card.locator('span').first().innerText();

  expect(headText).toContain('Krog Street Market');
  expect(headText).toContain('Ponce City Market');
  expect(headText).toContain('→');

  // Each side of the arrow must not look like a coord pair.
  const [left, right] = headText.split('→').map((s) => s.trim());
  expect(left, 'origin label must not be a coord').not.toMatch(COORD_LIKE);
  expect(right, 'destination label must not be a coord').not.toMatch(COORD_LIKE);
});

test('directions panel header shows Photon place names, not coordinates', async ({ page }) => {
  await page.goto('/');
  await planAtlantaRoute(page);

  await page.locator('[data-route-summary-card] button[data-action="details"]').click();
  await page.locator('[data-directions-panel]').waitFor({ state: 'visible', timeout: 5_000 });

  const headerText = await page.locator('[data-directions-panel]').innerText();
  expect(headerText).toContain('Krog Street Market');
  expect(headerText).toContain('Ponce City Market');

  // The header line must not be a coord pair.
  const headerSegments = headerText.split('\n').filter((l) => l.includes('→'));
  expect(headerSegments.length, 'header should contain an origin → destination line').toBeGreaterThan(0);
  for (const seg of headerSegments) {
    const [left, right] = seg.split('→').map((s) => s.trim());
    expect(left).not.toMatch(COORD_LIKE);
    expect(right).not.toMatch(COORD_LIKE);
  }
});
