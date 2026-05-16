import { test, expect } from '@playwright/test';
import { isAllowedUrl } from '../../src/privacy/networkAllowlist';
import { dismissWelcomeModalIfPresent } from '../benchmark/helpers/benchmarkHarness';

const VALHALLA_URL = 'http://localhost:8002';
const APP_ORIGIN = 'http://localhost:5173';

function isExternal(url: string): boolean {
  return !url.startsWith(APP_ORIGIN);
}

async function planRoute(page: import('@playwright/test').Page): Promise<void> {
  // Dismiss welcome modal FIRST — it backdrops the map; waiting for canvas behind it can flake.
  await dismissWelcomeModalIfPresent(page);
  await page.locator('#map canvas').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(1500);

  // Activate planner via the search bar
  await page.locator('[data-search-bar-activate]').click();

  // Wait for the planner card to mount
  await page.locator('[data-planner-card]').waitFor({ state: 'visible', timeout: 3_000 });

  // First waypoint (origin)
  const inputs = page.locator('[data-waypoint] input');
  await inputs.first().click();
  await inputs.first().fill('Krog Street Market, Atlanta');
  // Wait past debounce + fetch
  await page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('[role="option"]').first().click();

  // Second waypoint (destination)
  await inputs.nth(1).click();
  await inputs.nth(1).fill('Ponce City Market, Atlanta');
  await page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('[role="option"]').first().click();

  // Plan route
  await page.locator('button[data-action="plan"]').click();
  await page.waitForTimeout(4000);
}

test.beforeAll(async () => {
  try {
    const resp = await fetch(`${VALHALLA_URL}/status`, { signal: AbortSignal.timeout(2000) });
    if (!resp.ok) {
      test.skip(true, `Valhalla not reachable at ${VALHALLA_URL} — Playwright privacy tests skipped. Start Valhalla and re-run.`);
    }
  } catch {
    test.skip(true, `Valhalla not reachable at ${VALHALLA_URL} — Playwright privacy tests skipped. Start Valhalla and re-run.`);
  }
});

test('every external network request goes to an allowlisted host', async ({ page }) => {
  const violations: string[] = [];

  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    if (!isExternal(url)) return; // same-origin = app self-loading, not a privacy concern
    if (!isAllowedUrl(url)) violations.push(url);
  });

  await page.goto('/');
  await dismissWelcomeModalIfPresent(page);
  await page.waitForLoadState('networkidle');
  await planRoute(page);

  expect(violations, `Disallowed external requests: ${JSON.stringify(violations, null, 2)}`).toHaveLength(0);
});

test('route request body does NOT carry user identifiers', async ({ page }) => {
  const valhallaBodies: string[] = [];

  page.on('request', (req) => {
    // In dev the request goes through Vite's /valhalla proxy at the app origin;
    // in prod it would similarly be same-origin behind a reverse proxy.
    if (req.url().includes('/valhalla/route') || req.url().includes(':8002/route')) {
      const body = req.postData();
      if (body) valhallaBodies.push(body);
    }
  });

  await page.goto('/');
  await dismissWelcomeModalIfPresent(page);
  await planRoute(page);

  expect(valhallaBodies.length).toBeGreaterThan(0);
  for (const body of valhallaBodies) {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('user_id');
    expect(parsed).not.toHaveProperty('session_id');
    expect(parsed).not.toHaveProperty('device_id');
    expect(Object.keys(parsed).every((k) => !k.toLowerCase().includes('id') || k === 'locations')).toBe(true);
  }
});

test('Photon queries are same-origin (use /photon proxy, never direct)', async ({ page }) => {
  const directPhoton: string[] = [];
  page.on('request', (req) => {
    if (req.url().startsWith('https://photon.komoot.io')) directPhoton.push(req.url());
  });
  await page.goto('/');
  const dismiss = page.locator('button[data-action="welcome-dismiss"]');
  if (await dismiss.count() > 0) await dismiss.click();
  await page.locator('[data-search-bar-activate]').click();
  await page.locator('[data-planner-card]').waitFor({ state: 'visible' });
  await page.locator('[data-waypoint] input').first().fill('atlanta');
  // Wait past debounce + fetch
  await page.waitForTimeout(1200);
  expect(directPhoton).toEqual([]);
});
