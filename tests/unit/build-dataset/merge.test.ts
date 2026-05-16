import { describe, it, expect } from 'vitest';
import { mergeDatasets, mergeWithStats } from '../../../scripts/build-dataset/merge';
import type { Camera } from '../../../src/domain/camera';

function cam(over: Partial<Camera> & { lat: number; lon: number; source: Camera['source'] }): Camera {
  return {
    id: `${over.source}-${over.lat}-${over.lon}`,
    type: 'alpr_government',
    confidence: 0.9,
    sources: [over.source],
    ...over,
  } as Camera;
}

describe('mergeDatasets', () => {
  it('keeps both records when they are 11m+ apart (below threshold)', () => {
    const deflock = [cam({ lat: 33.7500, lon: -84.3890, source: 'deflock' })];
    const osm = [cam({ lat: 33.75012, lon: -84.3890, source: 'osm' })];
    const merged = mergeDatasets(deflock, osm);
    expect(merged).toHaveLength(2);
  });

  it('merges two records within 10m', () => {
    const deflock = [cam({ lat: 33.7500, lon: -84.3890, source: 'deflock' })];
    const osm = [cam({ lat: 33.75005, lon: -84.3890, source: 'osm' })];
    const merged = mergeDatasets(deflock, osm);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.sources).toEqual(['deflock', 'osm']);
  });

  it('for ALPR type conflict, DeFlock wins', () => {
    const deflock = [cam({ lat: 33.75, lon: -84.39, source: 'deflock', type: 'alpr_government' })];
    const osm = [cam({ lat: 33.75, lon: -84.39, source: 'osm', type: 'cctv_municipal' })];
    const merged = mergeDatasets(deflock, osm);
    expect(merged[0]!.type).toBe('alpr_government');
    expect(merged[0]!.source).toBe('deflock');
  });

  it('OSM-only non-ALPR keeps OSM type', () => {
    const osm = [cam({ lat: 33.75, lon: -84.39, source: 'osm', type: 'red_light_camera' })];
    const merged = mergeDatasets([], osm);
    expect(merged[0]!.type).toBe('red_light_camera');
  });

  it('uses max confidence from both sources', () => {
    const deflock = [cam({ lat: 33.75, lon: -84.39, source: 'deflock', confidence: 0.7 })];
    const osm = [cam({ lat: 33.75, lon: -84.39, source: 'osm', confidence: 0.9 })];
    const merged = mergeDatasets(deflock, osm);
    expect(merged[0]!.confidence).toBe(0.9);
  });

  it('prefers known direction over unknown', () => {
    const deflock = [{ ...cam({ lat: 33.75, lon: -84.39, source: 'deflock' }), directionConfidence: 'unknown' as const }];
    const osm = [{ ...cam({ lat: 33.75, lon: -84.39, source: 'osm' }), direction: 90, directionConfidence: 'known' as const }];
    const merged = mergeDatasets(deflock, osm);
    expect(merged[0]!.direction).toBe(90);
    expect(merged[0]!.directionConfidence).toBe('known');
  });

  it('preserves both sources alphabetically sorted', () => {
    const deflock = [cam({ lat: 33.75, lon: -84.39, source: 'deflock' })];
    const osm = [cam({ lat: 33.75, lon: -84.39, source: 'osm' })];
    const merged = mergeDatasets(deflock, osm);
    expect(merged[0]!.sources).toEqual(['deflock', 'osm']);
  });

  it('reports dedup stats', () => {
    const deflock = [cam({ lat: 33.75, lon: -84.39, source: 'deflock' })];
    const osm = [cam({ lat: 33.75, lon: -84.39, source: 'osm' })];
    const { merged, stats } = mergeWithStats(deflock, osm);
    expect(merged).toHaveLength(1);
    expect(stats.duplicatesCollapsed).toBe(1);
    expect(stats.matchRadiusMeters).toBe(10);
  });
});
