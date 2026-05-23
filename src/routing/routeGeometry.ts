import type { GeoPoint } from '../domain/route';
import type { RouteManeuver } from '../domain/maneuver';

const EARTH_RADIUS_M = 6_371_000;
const METERS_PER_DEGREE_LAT = 111_320;
const DEG_TO_RAD = Math.PI / 180;

export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLon = (b.lon - a.lon) * DEG_TO_RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

interface LocalProjection {
  readonly x: number;
  readonly y: number;
}

function project(point: GeoPoint, originLat: number): LocalProjection {
  const cosLat = Math.cos(originLat * DEG_TO_RAD);
  return {
    x: point.lon * METERS_PER_DEGREE_LAT * cosLat,
    y: point.lat * METERS_PER_DEGREE_LAT,
  };
}

interface SegmentProjection {
  readonly distance: number;
  readonly t: number; // [0,1]: where the perpendicular falls on the segment
}

function projectOntoSegment(p: GeoPoint, a: GeoPoint, b: GeoPoint): SegmentProjection {
  const originLat = (a.lat + b.lat) / 2;
  const pp = project(p, originLat);
  const aa = project(a, originLat);
  const bb = project(b, originLat);
  const dx = bb.x - aa.x;
  const dy = bb.y - aa.y;
  const segLenSq = dx * dx + dy * dy;
  if (segLenSq === 0) {
    return { distance: haversineMeters(p, a), t: 0 };
  }
  const rawT = ((pp.x - aa.x) * dx + (pp.y - aa.y) * dy) / segLenSq;
  const t = Math.max(0, Math.min(1, rawT));
  const fx = aa.x + t * dx;
  const fy = aa.y + t * dy;
  const ex = pp.x - fx;
  const ey = pp.y - fy;
  return { distance: Math.sqrt(ex * ex + ey * ey), t };
}

export function perpendicularDistanceMeters(p: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  return projectOntoSegment(p, a, b).distance;
}

export interface SnapResult {
  readonly segmentIndex: number;
  readonly snapped: GeoPoint;
  readonly distanceMeters: number;
  readonly alongMeters: number;
}

function interpolate(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
}

export function snapToPolyline(p: GeoPoint, polyline: readonly GeoPoint[]): SnapResult {
  if (polyline.length === 0) {
    return { segmentIndex: 0, snapped: p, distanceMeters: 0, alongMeters: 0 };
  }
  if (polyline.length === 1) {
    const only = polyline[0]!;
    return {
      segmentIndex: 0,
      snapped: only,
      distanceMeters: haversineMeters(p, only),
      alongMeters: 0,
    };
  }

  let bestIdx = 0;
  let bestDistance = Infinity;
  let bestT = 0;
  let bestSegmentLen = 0;
  const cumulative: number[] = [0];
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i]!;
    const b = polyline[i + 1]!;
    const segLen = haversineMeters(a, b);
    cumulative.push(cumulative[i]! + segLen);
    const proj = projectOntoSegment(p, a, b);
    // When two segments tie (the user is exactly at the shared vertex), prefer
    // the *later* segment so we treat the vertex as "reached" rather than
    // "still approaching". This is what lets advanceManeuverIndex tick over
    // when the user crosses a maneuver's beginShapeIndex.
    if (proj.distance < bestDistance || (proj.distance === bestDistance && proj.t === 0 && bestT === 1)) {
      bestDistance = proj.distance;
      bestIdx = i;
      bestT = proj.t;
      bestSegmentLen = segLen;
    }
  }

  const snapped = interpolate(polyline[bestIdx]!, polyline[bestIdx + 1]!, bestT);
  const alongMeters = cumulative[bestIdx]! + bestT * bestSegmentLen;
  return { segmentIndex: bestIdx, snapped, distanceMeters: bestDistance, alongMeters };
}

export function advanceManeuverIndex(
  maneuvers: readonly RouteManeuver[],
  currentIndex: number,
  snappedSegmentIndex: number,
): number {
  if (maneuvers.length === 0) return 0;
  let next = Math.max(0, Math.min(currentIndex, maneuvers.length - 1));
  while (next < maneuvers.length - 1 && snappedSegmentIndex >= maneuvers[next + 1]!.beginShapeIndex) {
    next++;
  }
  return next;
}

export function distanceToManeuver(
  polyline: readonly GeoPoint[],
  snapped: SnapResult,
  maneuvers: readonly RouteManeuver[],
  targetIdx: number,
): number {
  if (maneuvers.length === 0 || polyline.length < 2) return 0;
  const target = maneuvers[Math.min(targetIdx, maneuvers.length - 1)]!;
  const targetShapeIdx = Math.min(target.beginShapeIndex, polyline.length - 1);

  // Distance from polyline[0] to polyline[targetShapeIdx]
  let totalToTarget = 0;
  for (let i = 0; i < targetShapeIdx; i++) {
    totalToTarget += haversineMeters(polyline[i]!, polyline[i + 1]!);
  }

  const remaining = totalToTarget - snapped.alongMeters;
  return remaining > 0 ? remaining : 0;
}
