import { describe, it, expect } from 'vitest';
import { coneForCamera } from '../../../src/routing/coneFromProfile';
import { resolveCamera } from '../../../src/data/resolvedCamera';
import {
  COMMUTER_PROFILE, ACTIVIST_PROFILE, VULNERABLE_PROFILE,
} from '../../../src/domain/threatProfile';
import type { Camera } from '../../../src/domain/camera';

const ALPR: Camera = {
  id: 'a', type: 'alpr_government', lat: 33.75, lon: -84.39,
  confidence: 0.9, source: 'seed',
  direction: 90, rangeMeters: 35, fovDegrees: 30, directionConfidence: 'known',
};

describe('coneForCamera', () => {
  it('returns null when profile weight for the type is 0', () => {
    const zero = { ...COMMUTER_PROFILE, weights: { ...COMMUTER_PROFILE.weights, alpr_government: 0 } };
    expect(coneForCamera(resolveCamera(ALPR), zero, () => Infinity)).toBeNull();
  });

  it('Vulnerable produces a larger range than Commuter for same camera', () => {
    const rCom = coneForCamera(resolveCamera(ALPR), COMMUTER_PROFILE, () => Infinity)!.rangeMeters;
    const rVul = coneForCamera(resolveCamera(ALPR), VULNERABLE_PROFILE, () => Infinity)!.rangeMeters;
    expect(rVul).toBeGreaterThan(rCom);
  });

  it('range is floored at 8 meters even when profile would push it lower', () => {
    const tiny = { ...COMMUTER_PROFILE, toleranceMultiplier: 0.01 };
    const cone = coneForCamera(resolveCamera(ALPR), tiny, () => Infinity)!;
    expect(cone.rangeMeters).toBe(8);
  });

  it('range is capped at 45 meters absolute', () => {
    const huge = { ...VULNERABLE_PROFILE, toleranceMultiplier: 10 };
    const cone = coneForCamera(resolveCamera(ALPR), huge, () => Infinity)!;
    expect(cone.rangeMeters).toBeLessThanOrEqual(45);
  });

  it('parallel road limit shrinks range when smaller than the absolute cap', () => {
    // Camera, profile would push to ~45m, but parallel road is only 30m away
    // Cap = 30 * 0.7 = 21
    const cone = coneForCamera(resolveCamera(ALPR), VULNERABLE_PROFILE, () => 30)!;
    expect(cone.rangeMeters).toBeCloseTo(21, 5);
  });

  it('FOV is expanded by visibilityExpansionMultiplier and capped at 360', () => {
    const wide = { ...ACTIVIST_PROFILE, visibilityExpansionMultiplier: 100 };
    const cone = coneForCamera(resolveCamera(ALPR), wide, () => Infinity)!;
    expect(cone.fovDegrees).toBe(360);
  });

  it('preserves camera bearing', () => {
    const cone = coneForCamera(resolveCamera(ALPR), ACTIVIST_PROFILE, () => Infinity)!;
    expect(cone.bearingDegrees).toBe(90);
  });
});
