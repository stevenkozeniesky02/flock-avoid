import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Router } from '../../../src/routing/router';
import { CameraStore } from '../../../src/data/cameraStore';
import { resolveCamera } from '../../../src/data/resolvedCamera';
import type { Camera } from '../../../src/domain/camera';

// Minimal ValhallaClient stub — we only care about resolveBearingIfUnknown logic,
// not actual routing, so route() can stay unimplemented.
function makeStubValhalla() {
  return {
    route: vi.fn().mockResolvedValue({
      polyline: [],
      distanceMeters: 0,
      durationSeconds: 0,
      camerasOnRoute: 0,
      surveillanceScore: 0,
      maneuvers: [],
    }),
  } as unknown as import('../../../src/routing/valhallaClient').ValhallaClient;
}

const KNOWN_CAM: Camera = {
  id: 'k1',
  type: 'cctv_municipal',
  lat: 33.75,
  lon: -84.389,
  confidence: 0.9,
  source: 'seed',
  direction: 90,
  directionConfidence: 'known',
};

const UNKNOWN_CAM: Camera = {
  id: 'u1',
  type: 'cctv_municipal',
  lat: 33.76,
  lon: -84.382,
  confidence: 0.9,
  source: 'seed',
  directionConfidence: 'unknown',
};

describe('Router.resolveBearingIfUnknown', () => {
  let router: Router;

  beforeEach(() => {
    const store = new CameraStore([resolveCamera(KNOWN_CAM), resolveCamera(UNKNOWN_CAM)]);
    router = new Router(makeStubValhalla(), store, 'http://valhalla-stub');
  });

  it('returns the camera unchanged when directionConfidence is "known"', () => {
    const cam = resolveCamera(KNOWN_CAM);
    const result = router.resolveBearingIfUnknown(cam);
    expect(result).toBe(cam); // same reference, not a copy
  });

  it('returns effectiveFovDegrees=360 on the first call for an unknown-direction camera (pending state)', () => {
    const cam = resolveCamera(UNKNOWN_CAM);
    // On the very first call the bearing fetch is 'pending' — should fall back to 360.
    const result = router.resolveBearingIfUnknown(cam);
    expect(result.effectiveFovDegrees).toBe(360);
    expect(result.directionConfidence).toBe('unknown'); // confidence unchanged on fallback
  });

  it('does not mutate the original camera when applying 360° fallback', () => {
    const cam = resolveCamera(UNKNOWN_CAM);
    const originalFov = cam.effectiveFovDegrees;
    router.resolveBearingIfUnknown(cam);
    // Original camera must be untouched (immutability)
    expect(cam.effectiveFovDegrees).toBe(originalFov);
  });
});
