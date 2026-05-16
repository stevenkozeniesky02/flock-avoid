import { describe, it, expect } from 'vitest';
import {
  COMMUTER_PROFILE,
  VULNERABLE_PROFILE,
  ALL_PRESETS,
  type ThreatProfile,
} from '../../../src/domain/threatProfile';
import { ALL_CAMERA_TYPES } from '../../../src/domain/camera';

describe('threat profile presets', () => {
  it('Commuter preset has lower ALPR weight than Vulnerable', () => {
    expect(COMMUTER_PROFILE.weights.alpr_government).toBeLessThan(
      VULNERABLE_PROFILE.weights.alpr_government,
    );
  });

  it('every preset defines a weight for every camera type', () => {
    for (const profile of ALL_PRESETS) {
      for (const cameraType of ALL_CAMERA_TYPES) {
        expect(profile.weights[cameraType]).toBeTypeOf('number');
        expect(profile.weights[cameraType]).toBeGreaterThanOrEqual(0);
        expect(profile.weights[cameraType]).toBeLessThanOrEqual(100);
      }
    }
  });

  it('Commuter has low detour tolerance, Vulnerable has high', () => {
    expect(COMMUTER_PROFILE.detourTolerance).toBe('low');
    expect(VULNERABLE_PROFILE.detourTolerance).toBe('high');
  });

  it('profile objects are deeply frozen so callers cannot mutate', () => {
    const p: ThreatProfile = COMMUTER_PROFILE;
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.weights)).toBe(true);
  });
});
