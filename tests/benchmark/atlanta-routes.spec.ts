import { test, expect } from '@playwright/test';

const VALHALLA_URL = 'http://localhost:8002';

test.beforeAll(async () => {
  try {
    const resp = await fetch(`${VALHALLA_URL}/status`, { signal: AbortSignal.timeout(2000) });
    if (!resp.ok) {
      test.skip(true, `Valhalla not reachable at ${VALHALLA_URL} — benchmark skipped. Start Valhalla and re-run.`);
    }
  } catch {
    test.skip(true, `Valhalla not reachable at ${VALHALLA_URL} — benchmark skipped. Start Valhalla and re-run.`);
  }
});

test('Atlanta downtown→midtown: routing math produces a defensible route', async ({ page }) => {
  await page.goto('/');

  await page.getByText('Vulnerable').click();

  await page.getByRole('button', { name: 'Set Start on map' }).click();
  await page.locator('#map').click({ position: { x: 240, y: 360 } });
  await page.getByRole('button', { name: 'Set End on map' }).click();
  await page.locator('#map').click({ position: { x: 480, y: 180 } });

  await page.getByRole('button', { name: 'Plan route' }).click();

  await page.waitForSelector('text=cameras avoided', { timeout: 15_000 });
  const summary = await page.locator('text=cameras avoided').textContent();
  expect(summary).toMatch(/\d+ cameras avoided/);
});
