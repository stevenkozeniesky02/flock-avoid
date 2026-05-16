import type { Camera } from '../domain/camera';
import type { ThreatProfile } from '../domain/threatProfile';

/**
 * Polygon ring in Valhalla's `exclude_polygons` format: [[lon,lat], ...closed].
 */
export type ExclusionPolygon = readonly (readonly [number, number])[];

const BASE_RADIUS_AT_FULL_WEIGHT_M = 60;

export function exclusionRadiusForCamera(camera: Camera, profile: ThreatProfile): number {
  const weight = profile.weights[camera.type];
  if (weight <= 0) return 0;
  const normWeight = weight / 100;
  return BASE_RADIUS_AT_FULL_WEIGHT_M * normWeight * profile.toleranceMultiplier;
}

export function camerasToExclusionPolygons(
  cameras: readonly Camera[],
  profile: ThreatProfile,
): ExclusionPolygon[] {
  const polys: ExclusionPolygon[] = [];
  for (const c of cameras) {
    const radius = exclusionRadiusForCamera(c, profile);
    if (radius <= 0) continue;
    polys.push(squareAround(c.lat, c.lon, radius));
  }
  return polys;
}

function squareAround(lat: number, lon: number, radiusMeters: number): ExclusionPolygon {
  const latDelta = radiusMeters / 111_320;
  const lonDelta = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
  const n = lat + latDelta;
  const s = lat - latDelta;
  const e = lon + lonDelta;
  const w = lon - lonDelta;
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ];
}
