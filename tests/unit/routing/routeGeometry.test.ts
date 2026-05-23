import { describe, it, expect } from 'vitest';
import {
  haversineMeters,
  perpendicularDistanceMeters,
  snapToPolyline,
  advanceManeuverIndex,
  distanceToManeuver,
} from '../../../src/routing/routeGeometry';
import type { GeoPoint } from '../../../src/domain/route';
import type { RouteManeuver } from '../../../src/domain/maneuver';

function maneuver(over: Partial<RouteManeuver>): RouteManeuver {
  return {
    kind: 'continue',
    instruction: '',
    streetNames: [],
    distanceMeters: 0,
    durationSeconds: 0,
    beginShapeIndex: 0,
    endShapeIndex: 0,
    rawValhallaType: 8,
    ...over,
  };
}

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0);
  });

  it('approximates one degree of longitude at the equator as ~111.32 km', () => {
    const d = haversineMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 1 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it('approximates a city block in Atlanta (~111 m)', () => {
    const d = haversineMeters({ lat: 33.75, lon: -84.39 }, { lat: 33.751, lon: -84.39 });
    expect(d).toBeGreaterThan(106);
    expect(d).toBeLessThan(116);
  });

  it('is symmetric', () => {
    const a: GeoPoint = { lat: 33.75, lon: -84.39 };
    const b: GeoPoint = { lat: 33.76, lon: -84.40 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 5);
  });
});

describe('perpendicularDistanceMeters', () => {
  it('returns 0 for a point exactly on the segment', () => {
    const a: GeoPoint = { lat: 0, lon: 0 };
    const b: GeoPoint = { lat: 0, lon: 0.01 };
    const onLine: GeoPoint = { lat: 0, lon: 0.005 };
    expect(perpendicularDistanceMeters(onLine, a, b)).toBeLessThan(0.5);
  });

  it('returns 0 at an endpoint', () => {
    const a: GeoPoint = { lat: 0, lon: 0 };
    const b: GeoPoint = { lat: 0, lon: 0.01 };
    expect(perpendicularDistanceMeters(a, a, b)).toBeLessThan(0.5);
  });

  it('measures perpendicular offset (low-latitude right-triangle case)', () => {
    const a: GeoPoint = { lat: 0, lon: 0 };
    const b: GeoPoint = { lat: 0, lon: 0.01 };       // ~1113 m east-west
    const p: GeoPoint = { lat: 0.0001, lon: 0.005 };  // ~11.13 m north of the midpoint
    const d = perpendicularDistanceMeters(p, a, b);
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(13);
  });

  it('falls back to endpoint distance when the projection is beyond the segment', () => {
    const a: GeoPoint = { lat: 0, lon: 0 };
    const b: GeoPoint = { lat: 0, lon: 0.01 };
    const beyond: GeoPoint = { lat: 0, lon: 0.02 }; // beyond b
    // expect approximately haversine(beyond, b)
    const expected = haversineMeters(beyond, b);
    const got = perpendicularDistanceMeters(beyond, a, b);
    expect(Math.abs(got - expected)).toBeLessThan(2);
  });
});

describe('snapToPolyline', () => {
  it('returns segment 0 with near-zero distance for the start vertex', () => {
    const polyline: GeoPoint[] = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 0.001 },
      { lat: 0, lon: 0.002 },
    ];
    const snap = snapToPolyline({ lat: 0, lon: 0 }, polyline);
    expect(snap.segmentIndex).toBe(0);
    expect(snap.distanceMeters).toBeLessThan(0.5);
    expect(snap.alongMeters).toBeLessThan(0.5);
  });

  it('reports alongMeters approximately equal to the start-to-snapped distance on a straight polyline', () => {
    const polyline: GeoPoint[] = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 0.001 }, // ~111 m east
      { lat: 0, lon: 0.002 }, // ~222 m east
    ];
    const queryNearMid: GeoPoint = { lat: 0, lon: 0.0015 };
    const snap = snapToPolyline(queryNearMid, polyline);
    expect(snap.alongMeters).toBeGreaterThan(160);
    expect(snap.alongMeters).toBeLessThan(180);
  });

  it('returns the last segment for a point past the end', () => {
    const polyline: GeoPoint[] = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 0.001 },
      { lat: 0, lon: 0.002 },
    ];
    const beyond: GeoPoint = { lat: 0, lon: 0.005 };
    const snap = snapToPolyline(beyond, polyline);
    expect(snap.segmentIndex).toBe(polyline.length - 2);
  });

  it('handles a single-vertex degenerate polyline', () => {
    const polyline: GeoPoint[] = [{ lat: 33.75, lon: -84.39 }];
    const query: GeoPoint = { lat: 33.76, lon: -84.39 };
    const snap = snapToPolyline(query, polyline);
    expect(snap.segmentIndex).toBe(0);
    expect(snap.distanceMeters).toBeCloseTo(haversineMeters(query, polyline[0]!), 1);
  });
});

describe('advanceManeuverIndex', () => {
  const maneuvers: readonly RouteManeuver[] = [
    maneuver({ beginShapeIndex: 0, endShapeIndex: 2 }),
    maneuver({ beginShapeIndex: 2, endShapeIndex: 5 }),
    maneuver({ beginShapeIndex: 5, endShapeIndex: 7 }),
  ];

  it('stays on the current maneuver when the snapped segment is before the next begin', () => {
    expect(advanceManeuverIndex(maneuvers, 0, 1)).toBe(0);
  });

  it('advances when the snapped segment reaches the next maneuver begin', () => {
    expect(advanceManeuverIndex(maneuvers, 0, 2)).toBe(1);
  });

  it('advances multiple times for a fast jump forward', () => {
    expect(advanceManeuverIndex(maneuvers, 0, 5)).toBe(2);
  });

  it('clamps at the final maneuver', () => {
    expect(advanceManeuverIndex(maneuvers, 0, 999)).toBe(2);
  });

  it('never goes backwards', () => {
    expect(advanceManeuverIndex(maneuvers, 2, 0)).toBe(2);
  });

  it('handles an empty maneuver list defensively', () => {
    expect(advanceManeuverIndex([], 0, 0)).toBe(0);
  });
});

describe('distanceToManeuver', () => {
  const polyline: GeoPoint[] = [
    { lat: 0, lon: 0 },        // 0 m
    { lat: 0, lon: 0.001 },    // ~111 m east
    { lat: 0, lon: 0.0025 },   // ~278 m east
  ];
  const maneuvers: readonly RouteManeuver[] = [
    maneuver({ beginShapeIndex: 0, endShapeIndex: 1 }),
    maneuver({ beginShapeIndex: 1, endShapeIndex: 2 }),
    maneuver({ beginShapeIndex: 2, endShapeIndex: 2 }),
  ];

  it('returns ~total when snapped at start, target = last index', () => {
    const snap = snapToPolyline(polyline[0]!, polyline);
    const d = distanceToManeuver(polyline, snap, maneuvers, 2);
    expect(d).toBeGreaterThan(265);
    expect(d).toBeLessThan(285);
  });

  it('subtracts the along-segment progress', () => {
    // Snap to a point halfway between vertex 0 and 1
    const halfway: GeoPoint = { lat: 0, lon: 0.0005 };
    const snap = snapToPolyline(halfway, polyline);
    const d = distanceToManeuver(polyline, snap, maneuvers, 2);
    expect(d).toBeGreaterThan(210);
    expect(d).toBeLessThan(230);
  });

  it('returns 0 when target index is at or behind the current snap', () => {
    const snap = snapToPolyline(polyline[2]!, polyline);
    const d = distanceToManeuver(polyline, snap, maneuvers, 0);
    expect(d).toBe(0);
  });
});
