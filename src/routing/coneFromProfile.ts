import type { ResolvedCamera } from '../data/resolvedCamera';
import type { ThreatProfile } from '../domain/threatProfile';
import type { ConeParams } from './conePolygon';

const RANGE_FLOOR_M = 8;
const RANGE_HARD_CAP_M = 45;
const PARALLEL_ROAD_SAFETY_FRACTION = 0.7;

export function coneForCamera(
  camera: ResolvedCamera,
  profile: ThreatProfile,
  parallelRoadDistanceLookup: (lat: number, lon: number, bearing: number) => number,
): ConeParams | null {
  const weight = profile.weights[camera.type];
  if (weight <= 0) return null;

  const expandedRange = camera.effectiveRangeMeters * profile.toleranceMultiplier;
  const parallelLimit =
    parallelRoadDistanceLookup(camera.lat, camera.lon, camera.effectiveDirection) *
    PARALLEL_ROAD_SAFETY_FRACTION;
  const upperBound = Math.min(RANGE_HARD_CAP_M, parallelLimit);
  const finalRange = Math.max(RANGE_FLOOR_M, Math.min(expandedRange, upperBound));

  const expandedFov = camera.effectiveFovDegrees * profile.visibilityExpansionMultiplier;
  const finalFov = Math.min(360, Math.max(0, expandedFov));

  return {
    lat: camera.lat,
    lon: camera.lon,
    bearingDegrees: camera.effectiveDirection,
    fovDegrees: finalFov,
    rangeMeters: finalRange,
  };
}
