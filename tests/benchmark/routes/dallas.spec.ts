import { test, expect } from '@playwright/test';
import { planRoute, type BenchmarkRoute } from '../helpers/benchmarkHarness';

test.beforeAll(() => {
  test.skip(
    true,
    'Dallas benchmark scaffolded but not runnable until the dev Valhalla container has Texas tiles. See Sub-project C (full-US Valhalla).',
  );
});

const ROUTES: readonly BenchmarkRoute[] = [
  { name: 'downtown-crossing',  origin: 'Dallas City Hall, Dallas',       destination: 'Klyde Warren Park, Dallas' },
  { name: 'commute-to-suburb',  origin: 'Deep Ellum, Dallas',             destination: 'Plano, Texas' },
  { name: 'sensitive-site-adj', origin: 'Dallas Federal Reserve, Dallas', destination: 'Dallas Arboretum, Dallas' },
];

for (const route of ROUTES) {
  for (const profile of ['Commuter', 'Activist', 'Vulnerable'] as const) {
    test(`Dallas ${route.name} — ${profile}`, async ({ page }) => {
      const r = await planRoute(page, profile, route);
      expect(r).toBeDefined();
    });
  }
}
