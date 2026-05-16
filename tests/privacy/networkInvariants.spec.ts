import { test, expect } from '@playwright/test';
import { isAllowedUrl } from '../../src/privacy/networkAllowlist';

const VALHALLA_URL = 'http://localhost:8002';

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

test('every network request goes to an allowlisted host', async ({ page }) => {
  const violations: string[] = [];

  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    if (!isAllowedUrl(url)) violations.push(url);
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.getByText('Commuter').click();
  await page.getByRole('button', { name: 'Set Start on map' }).click();
  await page.locator('#map').click({ position: { x: 200, y: 200 } });
  await page.getByRole('button', { name: 'Set End on map' }).click();
  await page.locator('#map').click({ position: { x: 400, y: 400 } });
  await page.getByRole('button', { name: 'Plan route' }).click();
  await page.waitForTimeout(3000);

  expect(violations, `Disallowed requests: ${JSON.stringify(violations, null, 2)}`).toHaveLength(0);
});

test('route request body does NOT carry user identifiers', async ({ page }) => {
  const valhallaBodies: string[] = [];

  page.on('request', (req) => {
    if (req.url().includes(':8002/route')) {
      const body = req.postData();
      if (body) valhallaBodies.push(body);
    }
  });

  await page.goto('/');
  await page.getByText('Commuter').click();
  await page.getByRole('button', { name: 'Set Start on map' }).click();
  await page.locator('#map').click({ position: { x: 200, y: 200 } });
  await page.getByRole('button', { name: 'Set End on map' }).click();
  await page.locator('#map').click({ position: { x: 400, y: 400 } });
  await page.getByRole('button', { name: 'Plan route' }).click();
  await page.waitForTimeout(3000);

  expect(valhallaBodies.length).toBeGreaterThan(0);
  for (const body of valhallaBodies) {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('user_id');
    expect(parsed).not.toHaveProperty('session_id');
    expect(parsed).not.toHaveProperty('device_id');
    expect(Object.keys(parsed).every((k) => !k.toLowerCase().includes('id') || k === 'locations')).toBe(true);
  }
});
