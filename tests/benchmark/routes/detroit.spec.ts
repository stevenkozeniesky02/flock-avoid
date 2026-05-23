import { test, expect } from '@playwright/test';
import { planRoute, type BenchmarkRoute } from '../helpers/benchmarkHarness';

test.beforeAll(() => {
  test.skip(
    true,
    'Detroit benchmark scaffolded but not runnable until the dev Valhalla container has Michigan tiles. See Sub-project C (full-US Valhalla).',
  );
});

const ROUTES: readonly BenchmarkRoute[] = [
  { name: 'downtown-crossing',  origin: 'Renaissance Center, Detroit',       destination: 'Comerica Park, Detroit' },
  { name: 'commute-to-suburb',  origin: 'Corktown, Detroit',                 destination: 'Royal Oak, Michigan' },
  { name: 'sensitive-site-adj', origin: 'Detroit Federal Building, Detroit', destination: 'Belle Isle, Detroit' },
];

for (const route of ROUTES) {
  for (const profile of ['Commuter', 'Activist', 'Vulnerable'] as const) {
    test(`Detroit ${route.name} — ${profile}`, async ({ page }) => {
      const r = await planRoute(page, profile, route);
      expect(r).toBeDefined();
    });
  }
}
