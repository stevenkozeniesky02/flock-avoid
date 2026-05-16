import { describe, it, expect } from 'vitest';
import { camerasToExclusionPolygons, exclusionRadiusForCamera } from '../../../src/routing/exclusionPolygons';
import { COMMUTER_PROFILE, VULNERABLE_PROFILE } from '../../../src/domain/threatProfile';
import type { Camera } from '../../../src/domain/camera';

const ALPR: Camera = {
  id: 'x', type: 'alpr_government', lat: 33.75, lon: -84.39, confidence: 0.9, source: 'seed',
};

describe('exclusion polygons', () => {
  it('Vulnerable profile yields a larger exclusion radius than Commuter for same camera', () => {
    const rCom = exclusionRadiusForCamera(ALPR, COMMUTER_PROFILE);
    const rVul = exclusionRadiusForCamera(ALPR, VULNERABLE_PROFILE);
    expect(rVul).toBeGreaterThan(rCom);
  });

  it('zero-weight camera type yields zero radius', () => {
    const dotCam: Camera = { ...ALPR, type: 'cctv_dot_traffic' };
    const zeroProfile = {
      ...COMMUTER_PROFILE,
      weights: { ...COMMUTER_PROFILE.weights, cctv_dot_traffic: 0 },
    };
    expect(exclusionRadiusForCamera(dotCam, zeroProfile)).toBe(0);
  });

  it('camerasToExclusionPolygons skips zero-radius cameras', () => {
    const zeroProfile = {
      ...COMMUTER_PROFILE,
      weights: Object.fromEntries(
        Object.keys(COMMUTER_PROFILE.weights).map((k) => [k, 0]),
      ) as typeof COMMUTER_PROFILE.weights,
    };
    expect(camerasToExclusionPolygons([ALPR], zeroProfile)).toHaveLength(0);
  });

  it('each polygon is a closed ring of 5 [lon,lat] pairs (a square box)', () => {
    const polys = camerasToExclusionPolygons([ALPR], VULNERABLE_PROFILE);
    expect(polys).toHaveLength(1);
    const ring = polys[0]!;
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]); // closed ring
    for (const point of ring) {
      expect(point).toHaveLength(2);
      expect(typeof point[0]).toBe('number');
      expect(typeof point[1]).toBe('number');
    }
  });
});
