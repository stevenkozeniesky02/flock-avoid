import { describe, it, expect } from 'vitest';
import { validateDataset } from '../../../scripts/build-dataset/validate';
import type { Camera } from '../../../src/domain/camera';

const VALID: Camera = {
  id: 'x', type: 'alpr_government', lat: 33.75, lon: -84.39,
  confidence: 0.9, source: 'deflock', sources: ['deflock'],
};

const PASSING_COUNTS = { deflock: 100, osm: 100 } as const;

describe('validateDataset', () => {
  it('passes a valid camera set', () => {
    expect(() => validateDataset([VALID], PASSING_COUNTS)).not.toThrow();
  });

  it('rejects out-of-US lat', () => {
    const bad = { ...VALID, lat: 80 };
    expect(() => validateDataset([bad], PASSING_COUNTS)).toThrow(/lat/i);
  });

  it('rejects out-of-US lon', () => {
    const bad = { ...VALID, lon: 50 };
    expect(() => validateDataset([bad], PASSING_COUNTS)).toThrow(/lon/i);
  });

  it('rejects empty dataset', () => {
    expect(() => validateDataset([], PASSING_COUNTS)).toThrow(/empty/i);
  });

  it('rejects excessive density (>200 cameras per 1km² bucket)', () => {
    const cluster: Camera[] = [];
    for (let i = 0; i < 250; i++) {
      cluster.push({ ...VALID, id: `c${i}`, lat: 33.75 + i * 0.000005, lon: -84.39 });
    }
    expect(() => validateDataset(cluster, PASSING_COUNTS)).toThrow(/density/i);
  });

  it('rejects OSM count below minOsmCount threshold (default 100)', () => {
    expect(() => validateDataset([VALID], { deflock: 50000, osm: 0 })).toThrow(/osm/i);
    expect(() => validateDataset([VALID], { deflock: 50000, osm: 99 })).toThrow(/osm/i);
  });

  it('passes when OSM count meets default threshold', () => {
    expect(() => validateDataset([VALID], { deflock: 50000, osm: 100 })).not.toThrow();
  });

  it('honors a custom minOsmCount of 0 (fixture mode)', () => {
    expect(() => validateDataset([VALID], { deflock: 5, osm: 4 }, { minOsmCount: 0 })).not.toThrow();
  });

  it('honors a custom minOsmCount above default', () => {
    expect(() => validateDataset([VALID], { deflock: 50000, osm: 500 }, { minOsmCount: 1000 }))
      .toThrow(/osm/i);
  });
});
