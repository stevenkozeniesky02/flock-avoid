import { describe, it, expect } from 'vitest';
import { buildConePolygon } from '../../../src/routing/conePolygon';

describe('buildConePolygon', () => {
  it('returns a closed ring (first vertex == last vertex)', () => {
    const ring = buildConePolygon({
      lat: 33.75, lon: -84.39, bearingDegrees: 0, fovDegrees: 30, rangeMeters: 35,
    });
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('apex is at the camera location', () => {
    const ring = buildConePolygon({
      lat: 33.75, lon: -84.39, bearingDegrees: 90, fovDegrees: 30, rangeMeters: 35,
    });
    const apex = ring[0]!;
    expect(apex[0]).toBeCloseTo(-84.39, 6);
    expect(apex[1]).toBeCloseTo(33.75, 6);
  });

  it('cone facing north (bearing 0) reaches points north of apex', () => {
    const ring = buildConePolygon({
      lat: 33.75, lon: -84.39, bearingDegrees: 0, fovDegrees: 30, rangeMeters: 50,
    });
    // The arc midpoint should be roughly due north
    const midIdx = Math.floor(ring.length / 2);
    const midpoint = ring[midIdx]!;
    expect(midpoint[1]).toBeGreaterThan(33.75);
    expect(Math.abs(midpoint[0] - -84.39)).toBeLessThan(0.001);
  });

  it('FOV >= 350 collapses to a full circle (>= 16 distinct arc points)', () => {
    const ring = buildConePolygon({
      lat: 33.75, lon: -84.39, bearingDegrees: 180, fovDegrees: 360, rangeMeters: 35,
    });
    expect(ring.length).toBeGreaterThanOrEqual(16);
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    expect(first).toEqual(last);
  });

  it('vertex count is 16 for a normal cone (apex + 14 arc points + close)', () => {
    const ring = buildConePolygon({
      lat: 33.75, lon: -84.39, bearingDegrees: 90, fovDegrees: 30, rangeMeters: 35,
    });
    expect(ring.length).toBe(16);
  });
});
