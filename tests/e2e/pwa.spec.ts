import { test, expect } from '@playwright/test';
import { dismissWelcomeModalIfPresent } from '../benchmark/helpers/benchmarkHarness';

test.describe('PWA — manifest + service worker', () => {
  test('serves a valid web app manifest', async ({ page }) => {
    const resp = await page.request.get('/manifest.webmanifest');
    expect(resp.ok()).toBe(true);
    const json = (await resp.json()) as Record<string, unknown>;
    expect(json['name']).toBe('Flock-Avoid');
    expect(json['start_url']).toBe('/');
    expect(json['scope']).toBe('/');
    expect(json['display']).toBe('standalone');
    expect(json['theme_color']).toBe('#0a0a0b');
    expect(Array.isArray(json['icons'])).toBe(true);
  });

  test('serves /sw.js with a JavaScript content-type and non-trivial body', async ({ page }) => {
    const resp = await page.request.get('/sw.js');
    expect(resp.ok()).toBe(true);
    const body = await resp.text();
    expect(body.length).toBeGreaterThan(500);
    expect(body).toMatch(/CACHE_VERSION/);
    const contentType = resp.headers()['content-type'] ?? '';
    expect(contentType).toMatch(/javascript/);
  });

  test('registers the service worker without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await dismissWelcomeModalIfPresent(page);

    await page.waitForFunction(
      async () => {
        if (!('serviceWorker' in navigator)) return false;
        const reg = await navigator.serviceWorker.getRegistration();
        return Boolean(reg && (reg.active || reg.installing || reg.waiting));
      },
      null,
      { timeout: 10_000 },
    );

    const swErrors = errors.filter((e) => /service.?worker/i.test(e));
    expect(swErrors, `SW console errors: ${swErrors.join(' | ')}`).toHaveLength(0);
  });

  test('declares <link rel="manifest"> and apple-touch-icon in <head>', async ({ page }) => {
    await page.goto('/');
    const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
    expect(manifestHref).toBe('/manifest.webmanifest');
    const appleIcon = await page.getAttribute('link[rel="apple-touch-icon"]', 'href');
    expect(appleIcon).toMatch(/icon-192\.png$/);
    const themeColor = await page.getAttribute('meta[name="theme-color"]', 'content');
    expect(themeColor).toBe('#0a0a0b');
  });
});
