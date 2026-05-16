import { test, expect } from '@playwright/test';
import { planRoute, type BenchmarkRoute } from '../helpers/benchmarkHarness';

test.beforeAll(() => {
  test.skip(
    true,
    'Dallas benchmark scaffolded but not runnable until: (1) app supports cross-city centering, (2) full-US Valhalla container is available. See Phase 0b-3 plan.',
  );
});

const ROUTES: readonly BenchmarkRoute[] = [
  { name: 'downtown-crossing',  startClick: { x: 300, y: 220 }, endClick: { x: 420, y: 320 } },
  { name: 'commute-to-suburb',  startClick: { x: 320, y: 250 }, endClick: { x: 550, y: 180 } },
  { name: 'sensitive-site-adj', startClick: { x: 260, y: 280 }, endClick: { x: 400, y: 360 } },
];

for (const route of ROUTES) {
  for (const profile of ['Commuter', 'Activist', 'Vulnerable'] as const) {
    test(`Dallas ${route.name} — ${profile}`, async ({ page }) => {
      const r = await planRoute(page, profile, route);
      expect(r).toBeDefined();
    });
  }
}
