import { describe, it, expect } from 'vitest';
import { normalizeOsm } from '../../../scripts/build-dataset/normalize';
import type { RawOsmElement } from '../../../scripts/build-dataset/fetch-osm';

describe('normalizeOsm', () => {
  it('maps surveillance:type=red_light to red_light_camera', () => {
    const els: RawOsmElement[] = [
      { type: 'node', id: 1, lat: 33.75, lon: -84.39, tags: { 'man_made': 'surveillance', 'surveillance:type': 'red_light' } },
    ];
    const cams = normalizeOsm(els);
    expect(cams[0]!.type).toBe('red_light_camera');
    expect(cams[0]!.source).toBe('osm');
  });

  it('maps surveillance:type=speed to speed_camera', () => {
    const els: RawOsmElement[] = [
      { type: 'node', id: 2, lat: 33.75, lon: -84.39, tags: { 'man_made': 'surveillance', 'surveillance:type': 'speed' } },
    ];
    const cams = normalizeOsm(els);
    expect(cams[0]!.type).toBe('speed_camera');
  });

  it('falls back to cctv_municipal for generic surveillance', () => {
    const els: RawOsmElement[] = [
      { type: 'node', id: 3, lat: 33.75, lon: -84.39, tags: { 'man_made': 'surveillance' } },
    ];
    const cams = normalizeOsm(els);
    expect(cams[0]!.type).toBe('cctv_municipal');
  });

  it('resolves ways using center coordinates', () => {
    const els: RawOsmElement[] = [
      { type: 'way', id: 4, center: { lat: 33.75, lon: -84.39 }, tags: { 'man_made': 'surveillance' } },
    ];
    const cams = normalizeOsm(els);
    expect(cams[0]!.lat).toBe(33.75);
  });

  it('skips elements without coordinates', () => {
    const els: RawOsmElement[] = [
      { type: 'way', id: 5, tags: { 'man_made': 'surveillance' } },
    ];
    const cams = normalizeOsm(els);
    expect(cams).toHaveLength(0);
  });
});
