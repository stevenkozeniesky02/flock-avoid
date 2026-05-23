/**
 * Regression for the MapLibre glyphs bug.
 *
 * Before: the cameras-cluster-counts symbol layer used `text-field` + `text-font`
 * but the map style declared no `glyphs` URL, so MapLibre rejected the addLayer
 * call and emitted a console error on every load (and cluster counts never
 * rendered). Fix replaces the symbol layer with privacy-safe DOM markers.
 *
 * This test asserts:
 *   1. No MapLibre glyphs/text-field validation error in the console.
 *   2. At low-to-mid zoom (where clusters are visible), at least one
 *      `[data-cluster-count]` DOM badge is rendered.
 *   3. The privacy invariant is preserved: no glyph-related external request.
 */
import { test, expect, type ConsoleMessage } from '@playwright/test';
import { dismissWelcomeModalIfPresent } from '../benchmark/helpers/benchmarkHarness';

test('map load produces no MapLibre glyphs validation error', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await dismissWelcomeModalIfPresent(page);
  await page.locator('#map canvas').first().waitFor({ state: 'visible', timeout: 15_000 });
  // Give MapLibre time to load styles + add layers and any deferred validation
  // to surface.
  await page.waitForTimeout(2500);

  const glyphErrors = errors.filter((e) =>
    e.includes('text-field') || e.includes('glyphs') || e.includes('text-font'),
  );
  expect(glyphErrors, `Unexpected MapLibre glyph error(s): ${JSON.stringify(glyphErrors, null, 2)}`)
    .toHaveLength(0);
});

test('cluster-count badges render as DOM markers at visible zoom', async ({ page }) => {
  await page.goto('/');
  await dismissWelcomeModalIfPresent(page);
  await page.locator('#map canvas').first().waitFor({ state: 'visible', timeout: 15_000 });
  // Default zoom is 13 (per MapView constructor in src/ui/mapView.ts), which
  // is above the cluster cap (clusterMaxZoom: 11), so we want to zoom OUT to
  // a zoom where clusters are visible.
  await page.evaluate(() => {
    // The maplibre map is owned by MapView; we can reach it through a
    // querySelector + the MapView instance is not globally exposed, so
    // dispatch a wheel-zoom-out gesture via the canvas instead.
  });
  // Simpler: just wait for clusters to render at the post-load default zoom.
  // The seeded dataset includes Georgia/Atlanta cameras dense enough to form
  // clusters even at zoom 13. If no clusters appear at default zoom, zoom out.
  let badges = await page.locator('[data-cluster-count]').count();
  if (badges === 0) {
    // Force a zoom-out by simulating wheel events on the map canvas.
    const canvas = page.locator('#map canvas').first();
    for (let i = 0; i < 6; i++) {
      await canvas.dispatchEvent('wheel', { deltaY: 200 });
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(800);
    badges = await page.locator('[data-cluster-count]').count();
  }
  expect(badges, 'Expected at least one cluster-count badge to render').toBeGreaterThan(0);
});

test('no external host is contacted for glyph PBFs', async ({ page }) => {
  const externalGlyphRequests: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    // Any URL with the {fontstack}/{range}.pbf shape is a glyph request.
    // The privacy invariant requires these to be same-origin (or not happen
    // at all, as in our HTML-marker approach).
    if (/\/[A-Za-z][^/]+\/\d+-\d+\.pbf(\?|$)/.test(url) && !url.startsWith('http://localhost:5173')) {
      externalGlyphRequests.push(url);
    }
  });
  await page.goto('/');
  await dismissWelcomeModalIfPresent(page);
  await page.locator('#map canvas').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(2500);
  expect(externalGlyphRequests).toEqual([]);
});
