import { test, expect } from '@playwright/test';
import { planRoute, skipIfNoValhalla, type BenchmarkRoute } from '../helpers/benchmarkHarness';

skipIfNoValhalla('Atlanta');

const ROUTES: readonly BenchmarkRoute[] = [
  { name: 'downtown-crossing',  startClick: { x: 300, y: 220 }, endClick: { x: 420, y: 320 } },
  { name: 'commute-to-suburb',  startClick: { x: 320, y: 250 }, endClick: { x: 550, y: 180 } },
  { name: 'sensitive-site-adj', startClick: { x: 180, y: 480 }, endClick: { x: 640, y: 180 } },
];

for (const route of ROUTES) {
  test(`Atlanta ${route.name} — Commuter`, async ({ page }) => {
    const r = await planRoute(page, 'Commuter', route);
    expect(r).toBeDefined();
  });
  test(`Atlanta ${route.name} — Activist`, async ({ page }) => {
    const r = await planRoute(page, 'Activist', route);
    expect(r).toBeDefined();
  });
  test(`Atlanta ${route.name} — Vulnerable`, async ({ page }) => {
    const r = await planRoute(page, 'Vulnerable', route);
    expect(r).toBeDefined();
  });
}
