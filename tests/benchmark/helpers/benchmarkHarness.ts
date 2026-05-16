import { test, type Page } from '@playwright/test';

export async function dismissWelcomeModalIfPresent(page: Page): Promise<void> {
  const btn = page.locator('button[data-action="welcome-dismiss"]');
  try {
    await btn.waitFor({ state: 'visible', timeout: 1500 });
    await btn.click();
  } catch {
    // Modal wasn't present — nothing to do
  }
}

export interface BenchmarkRoute {
  readonly name: string;
  readonly startClick: { readonly x: number; readonly y: number };
  readonly endClick: { readonly x: number; readonly y: number };
}

export interface BenchmarkResult {
  readonly routeName: string;
  readonly profilePreset: string;
  readonly hadDegradation: boolean;
  readonly camerasAvoided: number | null;
  readonly extraMinutes: number | null;
}

export async function planRoute(
  page: Page,
  profileCardLabel: 'Commuter' | 'Activist' | 'Vulnerable',
  route: BenchmarkRoute,
): Promise<BenchmarkResult> {
  await page.goto('/');
  await dismissWelcomeModalIfPresent(page);
  await page.locator('#map canvas').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(1500);

  await page.getByText(profileCardLabel).click();
  await page.getByRole('button', { name: 'Set Start on map' }).click();
  await page.locator('#map').click({ position: route.startClick });
  await page.getByRole('button', { name: 'Set End on map' }).click();
  await page.locator('#map').click({ position: route.endClick });
  await page.getByRole('button', { name: 'Plan route' }).click();

  const settled = await Promise.race([
    page.waitForSelector('text=cameras avoided', { timeout: 25_000 }).then(() => 'comparison' as const),
    page.waitForSelector('[data-degradation-panel]', { timeout: 25_000 }).then(() => 'degradation' as const),
  ]).catch(() => null);

  if (settled === 'degradation') {
    return {
      routeName: route.name,
      profilePreset: profileCardLabel,
      hadDegradation: true,
      camerasAvoided: null,
      extraMinutes: null,
    };
  }
  if (settled === 'comparison') {
    const summary = await page.locator('text=cameras avoided').textContent();
    const camMatch = summary?.match(/(\d+) cameras avoided/);
    const minMatch = summary?.match(/\+(\d+) min/);
    return {
      routeName: route.name,
      profilePreset: profileCardLabel,
      hadDegradation: false,
      camerasAvoided: camMatch ? parseInt(camMatch[1]!, 10) : 0,
      extraMinutes: minMatch ? parseInt(minMatch[1]!, 10) : 0,
    };
  }
  throw new Error(`Route "${route.name}" with ${profileCardLabel} produced neither a comparison nor a degradation panel`);
}

/** Standard beforeAll skip-when-Valhalla-down guard, with a city-specific message. */
export function skipIfNoValhalla(cityLabel: string): void {
  const VALHALLA_URL = 'http://localhost:8002';
  test.beforeAll(async () => {
    try {
      const resp = await fetch(`${VALHALLA_URL}/status`, { signal: AbortSignal.timeout(2000) });
      if (!resp.ok) {
        test.skip(true, `Valhalla not reachable — ${cityLabel} benchmark skipped.`);
      }
    } catch {
      test.skip(true, `Valhalla not reachable — ${cityLabel} benchmark skipped.`);
    }
  });
}
