import { describe, it, expect } from 'vitest';
import { validateDataset } from '../../../scripts/build-dataset/validate';
import type { Camera } from '../../../src/domain/camera';

const VALID: Camera = {
  id: 'x', type: 'alpr_government', lat: 33.75, lon: -84.39,
  confidence: 0.9, source: 'deflock', sources: ['deflock'],
};

describe('validateDataset', () => {
  it('passes a valid camera set', () => {
    expect(() => validateDataset([VALID])).not.toThrow();
  });

  it('rejects out-of-US lat', () => {
    const bad = { ...VALID, lat: 80 };
    expect(() => validateDataset([bad])).toThrow(/lat/i);
  });

  it('rejects out-of-US lon', () => {
    const bad = { ...VALID, lon: 50 };
    expect(() => validateDataset([bad])).toThrow(/lon/i);
  });

  it('rejects empty dataset', () => {
    expect(() => validateDataset([])).toThrow(/empty/i);
  });

  it('rejects excessive density (>200 cameras per 1km² bucket)', () => {
    const cluster: Camera[] = [];
    for (let i = 0; i < 250; i++) {
      cluster.push({ ...VALID, id: `c${i}`, lat: 33.75 + i * 0.000005, lon: -84.39 });
    }
    expect(() => validateDataset(cluster)).toThrow(/density/i);
  });
});
