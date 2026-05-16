import { describe, it, expect } from 'vitest';
import {
  COMMUTER_PROFILE,
  ACTIVIST_PROFILE,
  VULNERABLE_PROFILE,
  CUSTOM_PROFILE_DEFAULT,
  ALL_PRESETS,
  type ThreatProfile,
} from '../../../src/domain/threatProfile';
import { ALL_CAMERA_TYPES } from '../../../src/domain/camera';

describe('threat profile presets', () => {
  it('weights are ordered Commuter <= Activist <= Vulnerable for ALPRs', () => {
    expect(COMMUTER_PROFILE.weights.alpr_government).toBeLessThanOrEqual(
      ACTIVIST_PROFILE.weights.alpr_government,
    );
    expect(ACTIVIST_PROFILE.weights.alpr_government).toBeLessThanOrEqual(
      VULNERABLE_PROFILE.weights.alpr_government,
    );
  });

  it('tolerance multipliers are ordered low < medium < high', () => {
    expect(COMMUTER_PROFILE.toleranceMultiplier).toBeLessThan(
      ACTIVIST_PROFILE.toleranceMultiplier,
    );
    expect(ACTIVIST_PROFILE.toleranceMultiplier).toBeLessThan(
      VULNERABLE_PROFILE.toleranceMultiplier,
    );
  });

  it('every preset defines weight for every camera type, in [0,100]', () => {
    for (const profile of ALL_PRESETS) {
      for (const ct of ALL_CAMERA_TYPES) {
        const w = profile.weights[ct];
        expect(w).toBeTypeOf('number');
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(100);
      }
    }
  });

  it('every preset has positive multipliers', () => {
    for (const profile of ALL_PRESETS) {
      expect(profile.toleranceMultiplier).toBeGreaterThan(0);
      expect(profile.visibilityExpansionMultiplier).toBeGreaterThan(0);
    }
  });

  it('preset objects are deeply frozen', () => {
    const p: ThreatProfile = ACTIVIST_PROFILE;
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.weights)).toBe(true);
  });

  it('CUSTOM_PROFILE_DEFAULT is a sensible starting point (between Commuter and Vulnerable)', () => {
    expect(CUSTOM_PROFILE_DEFAULT.toleranceMultiplier).toBeGreaterThan(
      COMMUTER_PROFILE.toleranceMultiplier,
    );
    expect(CUSTOM_PROFILE_DEFAULT.toleranceMultiplier).toBeLessThan(
      VULNERABLE_PROFILE.toleranceMultiplier,
    );
  });
});
