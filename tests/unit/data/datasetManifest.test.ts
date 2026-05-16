import { describe, it, expect } from 'vitest';
import { parseDatasetManifest } from '../../../src/data/datasetManifest';

describe('parseDatasetManifest', () => {
  it('parses a well-formed v3 manifest', () => {
    const raw = JSON.stringify({
      schemaVersion: 3,
      generatedAt: '2026-05-16T07:00:00Z',
      totalCameras: 12345,
      sourceCounts: { deflock: 8000, osm: 6000, merged: 1655 },
      dedupStats: { duplicatesCollapsed: 332, matchRadiusMeters: 10 },
      buildRunUrl: 'https://github.com/x/y/actions/runs/123',
    });
    const m = parseDatasetManifest(raw);
    expect(m.totalCameras).toBe(12345);
    expect(m.sourceCounts.deflock).toBe(8000);
    expect(m.generatedAt).toBe('2026-05-16T07:00:00Z');
  });

  it('rejects wrong schemaVersion', () => {
    const raw = JSON.stringify({ schemaVersion: 2, generatedAt: 'x', totalCameras: 0 });
    expect(() => parseDatasetManifest(raw)).toThrow(/schema/i);
  });

  it('rejects non-JSON input', () => {
    expect(() => parseDatasetManifest('not json')).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => parseDatasetManifest(JSON.stringify({ schemaVersion: 3 }))).toThrow();
  });
});
