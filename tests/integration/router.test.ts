import { describe, it, expect, beforeAll } from 'vitest';
import { Router } from '../../src/routing/router';
import { ValhallaClient } from '../../src/routing/valhallaClient';
import { CameraStore } from '../../src/data/cameraStore';
import { resolveCamera } from '../../src/data/resolvedCamera';
import { COMMUTER_PROFILE, VULNERABLE_PROFILE } from '../../src/domain/threatProfile';
import type { Camera } from '../../src/domain/camera';

const VALHALLA_URL = process.env.VALHALLA_URL ?? 'http://localhost:8002';
let valhallaReady = false;

beforeAll(async () => {
  try {
    const resp = await fetch(`${VALHALLA_URL}/status`, { signal: AbortSignal.timeout(2000) });
    valhallaReady = resp.ok;
  } catch {
    valhallaReady = false;
  }
  if (!valhallaReady) {
    console.warn(
      `[skip] Valhalla not reachable at ${VALHALLA_URL} — Router integration tests will be skipped. Start Valhalla and re-run.`,
    );
  }
});

const SEED: readonly Camera[] = [
  { id: '1', type: 'alpr_government', lat: 33.7500, lon: -84.3890, confidence: 0.9, source: 'seed' },
  { id: '2', type: 'alpr_government', lat: 33.7560, lon: -84.3850, confidence: 0.9, source: 'seed' },
  { id: '3', type: 'alpr_government', lat: 33.7620, lon: -84.3800, confidence: 0.9, source: 'seed' },
];

describe('Router.compareRoutes (integration)', () => {
  it('returns shortest + private routes with a sensible diff', async () => {
    if (!valhallaReady) return;
    const router = new Router(new ValhallaClient(VALHALLA_URL), new CameraStore(SEED.map(resolveCamera)), VALHALLA_URL);
    const cmp = await router.compareRoutes(
      { lat: 33.7490, lon: -84.3880 },
      { lat: 33.7700, lon: -84.3600 },
      VULNERABLE_PROFILE,
    );
    expect(cmp.shortest.polyline.length).toBeGreaterThan(0);
    expect(cmp.private.polyline.length).toBeGreaterThan(0);
    expect(cmp.diff.extraSeconds).toBeGreaterThanOrEqual(0);
    expect(cmp.diff.camerasAvoided).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('Vulnerable profile avoids more cameras than Commuter for the same trip', async () => {
    if (!valhallaReady) return;
    const router = new Router(new ValhallaClient(VALHALLA_URL), new CameraStore(SEED.map(resolveCamera)), VALHALLA_URL);
    const start = { lat: 33.7490, lon: -84.3880 };
    const end = { lat: 33.7700, lon: -84.3600 };
    const cmpCom = await router.compareRoutes(start, end, COMMUTER_PROFILE);
    const cmpVul = await router.compareRoutes(start, end, VULNERABLE_PROFILE);
    expect(cmpVul.diff.camerasAvoided).toBeGreaterThanOrEqual(cmpCom.diff.camerasAvoided);
  }, 30_000);

  it('returns degradation when no private path exists, with alternative previews', async () => {
    if (!valhallaReady) return;
    // Real Atlanta downtown crossing under Vulnerable that we know hits the wall:
    // load the full seed dataset for this so the wall actually forms.
    const fullStore = await CameraStore.loadFromUrl(
      'http://localhost:5173/data/cameras-atlanta-seed.json',
    ).catch(async () => {
      // Fallback: build a wall of cameras across the route midpoint.
      // The route goes from (33.7517,-84.3942) to (33.7366,-84.3762).
      // We place CCTV cameras (360° FOV) every ~0.0003° (~33m) along lat 33.7440
      // from lon -84.398 to -84.372, covering the full route width.
      // With the Vulnerable toleranceMultiplier (1.4) and 50m default range,
      // each camera expands to 45m (hard cap) — overlapping to form an
      // unbroken exclusion band that forces "No path could be found".
      // Place 360°-FOV cameras in a tight 5×5 grid centred on the route's
      // start point (33.7517, -84.3942). Camera spacing is ~0.0003° ≈ 27m;
      // each exclusion circle has a 45m radius. The overlapping circles trap
      // the start location inside a solid exclusion zone, so Valhalla returns
      // "No path could be found" for the private route while the unexcluded
      // shortest route still works fine.
      // 25 cameras × ~283m circumference ≈ 7075m < Valhalla's 10 000m limit.
      const denseSeed: Camera[] = [];
      const centerLat = 33.7517;
      const centerLon = -84.3942;
      let idx = 0;
      for (let dLat = -2; dLat <= 2; dLat++) {
        for (let dLon = -2; dLon <= 2; dLon++) {
          denseSeed.push({
            id: `trap-${idx++}`,
            type: 'cctv_municipal',
            lat: parseFloat((centerLat + dLat * 0.0003).toFixed(6)),
            lon: parseFloat((centerLon + dLon * 0.0003).toFixed(6)),
            confidence: 0.9,
            source: 'seed',
            fovDegrees: 360,
            direction: 0,
            directionConfidence: 'unknown',
          });
        }
      }
      return new CameraStore(denseSeed.map(resolveCamera));
    });
    const router = new Router(new ValhallaClient(VALHALLA_URL), fullStore, VALHALLA_URL);
    const cmp = await router.compareRoutes(
      { lat: 33.7517, lon: -84.3942 },
      { lat: 33.7366, lon: -84.3762 },
      VULNERABLE_PROFILE,
    );
    expect(cmp.degradation).toBeDefined();
    expect(cmp.degradation!.reason).toBe('no_private_path');
    expect(cmp.degradation!.alternativePreviews.length).toBeGreaterThan(0);
    // The previews should reference profiles other than the user's current one
    for (const p of cmp.degradation!.alternativePreviews) {
      expect(p.profile.preset).not.toBe('vulnerable');
    }
    // shortest is still present
    expect(cmp.shortest.polyline.length).toBeGreaterThan(0);
  }, 60_000);
});
