import { describe, it, expect } from 'vitest';
import { isCameraType, ALL_CAMERA_TYPES, type Camera } from '../../../src/domain/camera';

describe('camera domain', () => {
  it('exposes the v0 camera types as a readonly array', () => {
    expect(ALL_CAMERA_TYPES).toEqual([
      'alpr_government',
      'alpr_private',
      'cctv_municipal',
      'cctv_dot_traffic',
      'speed_camera',
      'red_light_camera',
    ]);
  });

  it('isCameraType narrows unknown strings', () => {
    expect(isCameraType('alpr_government')).toBe(true);
    expect(isCameraType('not_a_type')).toBe(false);
  });

  it('a well-formed Camera object compiles', () => {
    const c: Camera = {
      id: 'atl-001',
      type: 'alpr_government',
      lat: 33.749,
      lon: -84.388,
      confidence: 0.9,
      source: 'seed',
    };
    expect(c.id).toBe('atl-001');
  });
});
