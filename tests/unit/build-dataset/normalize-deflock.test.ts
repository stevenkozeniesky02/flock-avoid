import { describe, it, expect } from 'vitest';
import { normalizeDeflock } from '../../../scripts/build-dataset/normalize';
import type { RawDeflockRecord } from '../../../scripts/build-dataset/fetch-deflock';

describe('normalizeDeflock', () => {
  it('maps "Flock Safety" manufacturer to alpr_government', () => {
    const records: RawDeflockRecord[] = [
      { id: 'a', lat: 33.75, lon: -84.39, tags: { manufacturer: 'Flock Safety' } },
    ];
    const cams = normalizeDeflock(records);
    expect(cams[0]!.type).toBe('alpr_government');
    expect(cams[0]!.source).toBe('deflock');
    expect(cams[0]!.sources).toEqual(['deflock']);
  });

  it('maps "Flock" + lowercase "flock safety" + "FLOCK" all to alpr_government (case-insensitive)', () => {
    const records: RawDeflockRecord[] = [
      { id: '1', lat: 33.75, lon: -84.39, tags: { manufacturer: 'Flock' } },
      { id: '2', lat: 33.75, lon: -84.39, tags: { manufacturer: 'flock safety' } },
      { id: '3', lat: 33.75, lon: -84.39, tags: { manufacturer: 'FLOCK' } },
    ];
    const cams = normalizeDeflock(records);
    expect(cams).toHaveLength(3);
    for (const c of cams) expect(c.type).toBe('alpr_government');
  });

  it('maps Motorola Vigilant and Rekor to alpr_government', () => {
    const records: RawDeflockRecord[] = [
      { id: 'mv', lat: 33.75, lon: -84.39, tags: { manufacturer: 'Motorola Vigilant' } },
      { id: 'rk', lat: 33.75, lon: -84.39, tags: { manufacturer: 'Rekor' } },
    ];
    const cams = normalizeDeflock(records);
    expect(cams[0]!.type).toBe('alpr_government');
    expect(cams[1]!.type).toBe('alpr_government');
  });

  it('falls back to alpr_government when manufacturer is missing or unknown', () => {
    const records: RawDeflockRecord[] = [
      { id: 'x', lat: 33.75, lon: -84.39, tags: {} },
      { id: 'y', lat: 33.75, lon: -84.39, tags: { manufacturer: 'WeirdVendor' } },
    ];
    const cams = normalizeDeflock(records);
    expect(cams[0]!.type).toBe('alpr_government');
    expect(cams[1]!.type).toBe('alpr_government');
  });

  it('preserves direction tag when present', () => {
    const records: RawDeflockRecord[] = [
      { id: 'a', lat: 33.75, lon: -84.39, tags: { manufacturer: 'Flock Safety', direction: '90' } },
    ];
    const cams = normalizeDeflock(records);
    expect(cams[0]!.direction).toBe(90);
    expect(cams[0]!.directionConfidence).toBe('known');
  });

  it('falls back to camera:direction tag if direction is absent', () => {
    const records: RawDeflockRecord[] = [
      { id: 'a', lat: 33.75, lon: -84.39, tags: { manufacturer: 'Flock', 'camera:direction': '270' } },
    ];
    const cams = normalizeDeflock(records);
    expect(cams[0]!.direction).toBe(270);
  });

  it('marks direction as unknown when no direction tag present', () => {
    const records: RawDeflockRecord[] = [
      { id: 'a', lat: 33.75, lon: -84.39, tags: { manufacturer: 'Flock Safety' } },
    ];
    const cams = normalizeDeflock(records);
    expect(cams[0]!.direction).toBeUndefined();
    expect(cams[0]!.directionConfidence).toBe('unknown');
  });

  it('generates stable IDs from coordinates + type', () => {
    const records: RawDeflockRecord[] = [
      { id: 'a', lat: 33.75, lon: -84.39, tags: { manufacturer: 'Flock Safety' } },
      { id: 'b', lat: 33.7501, lon: -84.39, tags: { manufacturer: 'Flock Safety' } },
    ];
    const cams1 = normalizeDeflock(records);
    const cams2 = normalizeDeflock(records);
    expect(cams1[0]!.id).toBe(cams2[0]!.id);
    expect(cams1[0]!.id).not.toBe(cams1[1]!.id);
  });
});
