import { describe, it, expect } from 'vitest';
import { CAMERA_TYPE_DEFAULTS } from '../../../src/domain/cameraTypeDefaults';
import { ALL_CAMERA_TYPES } from '../../../src/domain/camera';

describe('CAMERA_TYPE_DEFAULTS', () => {
  it('defines defaults for every camera type', () => {
    for (const type of ALL_CAMERA_TYPES) {
      expect(CAMERA_TYPE_DEFAULTS[type]).toBeDefined();
      expect(CAMERA_TYPE_DEFAULTS[type].rangeMeters).toBeGreaterThan(0);
      expect(CAMERA_TYPE_DEFAULTS[type].fovDegrees).toBeGreaterThan(0);
      expect(CAMERA_TYPE_DEFAULTS[type].fovDegrees).toBeLessThanOrEqual(360);
    }
  });

  it('ALPRs have narrower FOV than CCTV', () => {
    expect(CAMERA_TYPE_DEFAULTS.alpr_government.fovDegrees).toBeLessThan(
      CAMERA_TYPE_DEFAULTS.cctv_municipal.fovDegrees,
    );
  });

  it('the constants object is frozen', () => {
    expect(Object.isFrozen(CAMERA_TYPE_DEFAULTS)).toBe(true);
  });
});
