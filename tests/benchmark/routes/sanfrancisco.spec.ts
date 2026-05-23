import { test, expect } from '@playwright/test';
import { planRoute, type BenchmarkRoute } from '../helpers/benchmarkHarness';

test.beforeAll(() => {
  test.skip(
    true,
    'San Francisco benchmark scaffolded but not runnable until the dev Valhalla container has California tiles. See Sub-project C (full-US Valhalla).',
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
