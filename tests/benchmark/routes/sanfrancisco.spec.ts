import { test, expect } from '@playwright/test';
import { planRoute, type BenchmarkRoute } from '../helpers/benchmarkHarness';

test.beforeAll(() => {
  test.skip(
    true,
    'San Francisco benchmark scaffolded but not yet runnable. Prereqs: (1) benchmark harness supports cross-city centering (search-and-flyTo before pixel click) — tracked in a follow-up sub-project; (2) Valhalla running with continental-US tiles per docs/VALHALLA.md. Sub-project C delivers (2) as configuration; (1) remains.',
  );
});

const ROUTES: readonly BenchmarkRoute[] = [
  { name: 'downtown-crossing',  origin: 'Ferry Building, San Francisco',                destination: 'Union Square, San Francisco' },
  { name: 'commute-to-suburb',  origin: 'SoMa, San Francisco',                          destination: 'Daly City, California' },
  { name: 'sensitive-site-adj', origin: 'San Francisco Federal Building, San Francisco', destination: 'Mission Dolores Park, San Francisco' },
];

for (const route of ROUTES) {
  for (const profile of ['Commuter', 'Activist', 'Vulnerable'] as const) {
    test(`San Francisco ${route.name} — ${profile}`, async ({ page }) => {
      const r = await planRoute(page, profile, route);
      expect(r).toBeDefined();
    });
  }
}
