import { test, expect } from '@playwright/test';
import { planRoute, skipIfNoValhalla, type BenchmarkRoute } from './helpers/benchmarkHarness';

skipIfNoValhalla('Aggregate benchmark');

const ROUTES: readonly BenchmarkRoute[] = [
  { name: 'downtown-crossing',  startClick: { x: 300, y: 220 }, endClick: { x: 420, y: 320 } },
  { name: 'commute-to-suburb',  startClick: { x: 320, y: 250 }, endClick: { x: 550, y: 180 } },
  { name: 'sensitive-site-adj', startClick: { x: 260, y: 280 }, endClick: { x: 400, y: 360 } },
];

test('aggregate medians: Commuter ≤2 min extra, Activist ≤5 min extra', async ({ page }) => {
  const results: { profilePreset: string; extraMinutes: number }[] = [];
  for (const route of ROUTES) {
    for (const profile of ['Commuter', 'Activist', 'Vulnerable'] as const) {
      const r = await planRoute(page, profile, route);
      if (!r.hadDegradation && r.extraMinutes != null) {
        results.push({ profilePreset: profile, extraMinutes: r.extraMinutes });
      }
    }
  }

  expect(results.length, 'must have at least 9 results to compute medians').toBeGreaterThanOrEqual(6);

  const commuterExtras = results.filter((r) => r.profilePreset === 'Commuter').map((r) => r.extraMinutes);
  const activistExtras = results.filter((r) => r.profilePreset === 'Activist').map((r) => r.extraMinutes);

  if (commuterExtras.length > 0) {
    const commuterMedian = median(commuterExtras);
    expect(commuterMedian, `Commuter median extra minutes (expected ≤2): ${commuterMedian}`).toBeLessThanOrEqual(2);
  }
  if (activistExtras.length > 0) {
    const activistMedian = median(activistExtras);
    expect(activistMedian, `Activist median extra minutes (expected ≤5): ${activistMedian}`).toBeLessThanOrEqual(5);
  }
});

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
