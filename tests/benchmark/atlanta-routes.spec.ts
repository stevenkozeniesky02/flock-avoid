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
  const valhallaErrors: string[] = [];
  page.on('response', async (resp) => {
    const url = resp.url();
    const isValhalla = url.includes('/valhalla/route') || url.includes(':8002/route');
    if (isValhalla && !resp.ok()) {
      valhallaErrors.push(`${resp.status()} ${await resp.text().catch(() => '')}`);
    }
  });

  await page.goto('/');
  await page.locator('#map canvas').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(1500);

  await page.getByText('Vulnerable').click();

  await page.getByRole('button', { name: 'Set Start on map' }).click();
  await page.locator('#map').click({ position: { x: 300, y: 220 } });
  await page.getByRole('button', { name: 'Set End on map' }).click();
  await page.locator('#map').click({ position: { x: 420, y: 320 } });

  await page.getByRole('button', { name: 'Plan route' }).click();

  try {
    await page.waitForSelector('text=cameras avoided', { timeout: 20_000 });
  } catch (e) {
    const errorBanner = await page.locator('[data-error-banner]').textContent().catch(() => null);
    const sidebarText = await page.locator('#sidebar').textContent().catch(() => null);
    throw new Error(
      `Route plan never produced a comparison panel.\n` +
        `Valhalla errors: ${JSON.stringify(valhallaErrors)}\n` +
        `Error banner: ${errorBanner ?? '(none)'}\n` +
        `Sidebar text: ${sidebarText?.slice(0, 500) ?? '(none)'}\n` +
        `Original error: ${(e as Error).message}`,
    );
  }

  const summary = await page.locator('text=cameras avoided').textContent();
  expect(summary).toMatch(/\d+ cameras avoided/);
});
