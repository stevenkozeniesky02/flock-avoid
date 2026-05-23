import { test, expect } from '@playwright/test';
import { planRoute, type BenchmarkRoute } from '../helpers/benchmarkHarness';

test.beforeAll(() => {
  test.skip(
    true,
    'San Francisco benchmark scaffolded but not yet runnable. Prereqs: (1) benchmark harness supports cross-city centering (search-and-flyTo before pixel click) — tracked in a follow-up sub-project; (2) Valhalla running with continental-US tiles per docs/VALHALLA.md. Sub-project C delivers (2) as configuration; (1) remains.',
  );
});

const ROUTES: readonly BenchmarkRoute[] = [
  { name: 'downtown-crossing',  startClick: { x: 300, y: 220 }, endClick: { x: 420, y: 320 } },
  { name: 'commute-to-suburb',  startClick: { x: 320, y: 250 }, endClick: { x: 550, y: 180 } },
  { name: 'sensitive-site-adj', startClick: { x: 260, y: 280 }, endClick: { x: 400, y: 360 } },
];

for (const route of ROUTES) {
  for (const profile of ['Commuter', 'Activist', 'Vulnerable'] as const) {
    test(`San Francisco ${route.name} — ${profile}`, async ({ page }) => {
      const r = await planRoute(page, profile, route);
      expect(r).toBeDefined();
    });
  }
}
