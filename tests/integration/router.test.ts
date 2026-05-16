import { describe, it, expect, beforeAll } from 'vitest';
import { Router } from '../../src/routing/router';
import { ValhallaClient } from '../../src/routing/valhallaClient';
import { CameraStore } from '../../src/data/cameraStore';
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
    const router = new Router(new ValhallaClient(VALHALLA_URL), new CameraStore(SEED));
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
    const router = new Router(new ValhallaClient(VALHALLA_URL), new CameraStore(SEED));
    const start = { lat: 33.7490, lon: -84.3880 };
    const end = { lat: 33.7700, lon: -84.3600 };
    const cmpCom = await router.compareRoutes(start, end, COMMUTER_PROFILE);
    const cmpVul = await router.compareRoutes(start, end, VULNERABLE_PROFILE);
    expect(cmpVul.diff.camerasAvoided).toBeGreaterThanOrEqual(cmpCom.diff.camerasAvoided);
  }, 30_000);
});
