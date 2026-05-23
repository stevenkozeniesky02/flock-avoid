import { test, expect } from '@playwright/test';
import { planRoute, skipIfNoValhalla, type BenchmarkRoute } from '../helpers/benchmarkHarness';

skipIfNoValhalla('Atlanta');

// Each planRoute call: ~15 s map load + 1.5 s settle + 5 s autocomplete x 2 + 25 s routing = ~52 s.
// Set 90 s per-test to absorb worker contention without flaking.
test.setTimeout(90_000);

const ROUTES: readonly BenchmarkRoute[] = [
  { name: 'downtown-crossing',  origin: 'Centennial Olympic Park, Atlanta',  destination: 'Mercedes-Benz Stadium, Atlanta' },
  { name: 'commute-to-suburb',  origin: 'Krog Street Market, Atlanta',       destination: 'Decatur Square, Decatur' },
  { name: 'sensitive-site-adj', origin: 'CDC Headquarters, Atlanta',         destination: 'Emory University, Atlanta' },
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
