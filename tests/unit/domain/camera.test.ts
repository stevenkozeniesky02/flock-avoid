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

describe('Camera optional geometry fields', () => {
  it('accepts direction in [0, 360)', () => {
    const c: Camera = {
      id: 'g1', type: 'alpr_government', lat: 33.75, lon: -84.39,
      confidence: 0.9, source: 'seed',
      direction: 180, rangeMeters: 35, fovDegrees: 30,
      directionConfidence: 'known',
    };
    expect(c.direction).toBe(180);
  });

  it('compiles without the optional fields (back-compat with v0 seed)', () => {
    const c: Camera = {
      id: 'g2', type: 'alpr_government', lat: 33.75, lon: -84.39,
      confidence: 0.9, source: 'seed',
    };
    expect(c.direction).toBeUndefined();
    expect(c.directionConfidence).toBeUndefined();
  });
});

describe('Camera sources array (v3)', () => {
  it('accepts a single-source array', () => {
    const c: Camera = {
      id: 'x', type: 'alpr_government', lat: 33.75, lon: -84.39,
      confidence: 0.9, source: 'deflock', sources: ['deflock'],
    };
    expect(c.sources).toEqual(['deflock']);
  });

  it('accepts multiple sources (merged record)', () => {
    const c: Camera = {
      id: 'y', type: 'alpr_government', lat: 33.75, lon: -84.39,
      confidence: 0.95, source: 'deflock', sources: ['deflock', 'osm'],
    };
    expect(c.sources).toHaveLength(2);
  });

  it('still compiles without sources (v2 back-compat)', () => {
    const c: Camera = {
      id: 'z', type: 'alpr_government', lat: 33.75, lon: -84.39,
      confidence: 0.9, source: 'seed',
    };
    expect(c.sources).toBeUndefined();
  });
});
