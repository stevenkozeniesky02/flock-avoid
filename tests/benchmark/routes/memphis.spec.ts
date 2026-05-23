import { test, expect } from '@playwright/test';
import { planRoute, type BenchmarkRoute } from '../helpers/benchmarkHarness';

test.beforeAll(() => {
  test.skip(
    true,
    'Memphis benchmark scaffolded but not runnable until the dev Valhalla container has Tennessee tiles. See Sub-project C (full-US Valhalla).',
  );
});

const ROUTES: readonly BenchmarkRoute[] = [
  { name: 'downtown-crossing',  origin: 'Beale Street, Memphis',                 destination: 'AutoZone Park, Memphis' },
  { name: 'commute-to-suburb',  origin: 'Downtown Memphis, Memphis',             destination: 'Germantown, Tennessee' },
  { name: 'sensitive-site-adj', origin: 'National Civil Rights Museum, Memphis', destination: 'Graceland, Memphis' },
];

for (const route of ROUTES) {
  for (const profile of ['Commuter', 'Activist', 'Vulnerable'] as const) {
    test(`Memphis ${route.name} — ${profile}`, async ({ page }) => {
      const r = await planRoute(page, profile, route);
      expect(r).toBeDefined();
    });
  }
}
