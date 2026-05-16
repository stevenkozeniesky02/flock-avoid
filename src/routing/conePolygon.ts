import type { ExclusionPolygon } from './conePolygon.types';

export interface ConeParams {
  readonly lat: number;
  readonly lon: number;
  readonly bearingDegrees: number;
  readonly fovDegrees: number;
  readonly rangeMeters: number;
}

const ARC_VERTICES = 14;
const FULL_CIRCLE_THRESHOLD = 350;
const M_PER_DEG_LAT = 111_320;

/** Build a sector polygon (cone) as a closed ring of [lon, lat] pairs. */
export function buildConePolygon(p: ConeParams): ExclusionPolygon {
  const { lat, lon, bearingDegrees, fovDegrees, rangeMeters } = p;
  const isFullCircle = fovDegrees >= FULL_CIRCLE_THRESHOLD;
  const effectiveFov = isFullCircle ? 360 : fovDegrees;
  const halfFov = effectiveFov / 2;

  const points: [number, number][] = [];

  if (!isFullCircle) {
    points.push([lon, lat]);
  } else {
    const first = pointAt(lat, lon, bearingDegrees - halfFov, rangeMeters);
    points.push(first);
  }

  const arcStart = bearingDegrees - halfFov;
  const step = effectiveFov / (ARC_VERTICES - 1);
  for (let i = 0; i < ARC_VERTICES; i++) {
    const angle = arcStart + step * i;
    points.push(pointAt(lat, lon, angle, rangeMeters));
  }

  if (!isFullCircle) {
    points.push([lon, lat]);
  } else {
    points.push(points[0]!);
  }

  return points;
}

function pointAt(
  lat: number,
  lon: number,
  bearingDegrees: number,
  rangeMeters: number,
): [number, number] {
  const bearingRad = (bearingDegrees * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const dNorth = Math.cos(bearingRad) * rangeMeters;
  const dEast = Math.sin(bearingRad) * rangeMeters;
  const dLat = dNorth / M_PER_DEG_LAT;
  const dLon = dEast / (M_PER_DEG_LAT * Math.cos(latRad));
  return [lon + dLon, lat + dLat];
}
