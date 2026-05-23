import { test, expect } from '@playwright/test';

test.use({
  geolocation: { latitude: 33.7501, longitude: -84.3890 },
  permissions: ['geolocation'],
});

test('use-my-location fills origin and shows the blue dot', async ({ page }) => {
  await page.goto('/');

  // Dismiss welcome modal first (blocks the map otherwise)
  const dismiss = page.locator('button[data-action="welcome-dismiss"]');
  if (await dismiss.count() > 0) await dismiss.click();

  await page.locator('[data-search-bar]').waitFor({ state: 'visible', timeout: 5_000 });

  // Click the location button on the idle search bar — this triggers LocationStore.start()
  // AND opens the planner card
  await page.locator('button[data-action="use-location"]').click();

  // Planner card is now mounted; the origin input field appears
  const origin = page.locator('[data-waypoint="origin"] input');
  await origin.waitFor({ state: 'visible', timeout: 3_000 });

  // The use-location button INSIDE the planner becomes enabled once LocationStore has a fix.
  // Permission was pre-granted via test.use, so the watchPosition callback should fire near-immediately.
  const useInPlanner = page.locator('button[data-action="origin-use-location"]');
  await expect(useInPlanner).toBeEnabled({ timeout: 5_000 });
  await useInPlanner.click();

  // Origin now reads the granted coordinates (LocationStore.lastPosition formatted as `${lat.toFixed(4)}, ${lon.toFixed(4)}`)
  await expect(origin).toHaveValue(/33\.7501.*-84\.3890/);

  // Blue dot appears on the map — LocationMarker mounts a [data-location-marker] DOM element
  await expect(page.locator('[data-location-marker]')).toBeVisible({ timeout: 3_000 });
});
