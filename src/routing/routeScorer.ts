import type { GeoPoint } from '../domain/route';
import type { ThreatProfile } from '../domain/threatProfile';
import type { ResolvedCamera } from '../data/resolvedCamera';
import { CameraStore } from '../data/cameraStore';
import { visibilityFactor, MAX_VISIBILITY_M } from './visibilityFactor';

export interface RouteScore {
  readonly camerasSeen: number;
  readonly surveillanceScore: number;
}

interface Encounter {
  readonly camera: ResolvedCamera;
  factor: number;
}

export function scoreRoute(
  polyline: readonly GeoPoint[],
  store: CameraStore,
  profile: ThreatProfile,
): RouteScore {
  if (polyline.length === 0) return { camerasSeen: 0, surveillanceScore: 0 };

  const encounters = new Map<string, Encounter>();

  for (const point of polyline) {
    const nearby = store.within(point, MAX_VISIBILITY_M);
    for (const cam of nearby) {
      const dist = CameraStore.distanceMeters(point, { lat: cam.lat, lon: cam.lon });
      if (dist > cam.effectiveRangeMeters) continue;
      if (!withinCone(cam, point)) continue;

      const factor = visibilityFactor(dist);
      const existing = encounters.get(cam.id);
      if (!existing) {
        encounters.set(cam.id, { camera: cam, factor });
      } else if (factor > existing.factor) {
        existing.factor = factor;
      }
    }
  }

  let score = 0;
  for (const { camera, factor } of encounters.values()) {
    score += profile.weights[camera.type] * factor;
  }

  return { camerasSeen: encounters.size, surveillanceScore: score };
}

function withinCone(cam: ResolvedCamera, point: GeoPoint): boolean {
  if (cam.effectiveFovDegrees >= 360) return true;
  const bearingToPoint = bearingDegrees(cam.lat, cam.lon, point.lat, point.lon);
  const halfFov = cam.effectiveFovDegrees / 2;
  const angularDiff = angularDifference(bearingToPoint, cam.effectiveDirection);
  return angularDiff <= halfFov;
}

function bearingDegrees(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const fromLatRad = toRad(fromLat);
  const toLatRad = toRad(toLat);
  const dLon = toRad(toLon - fromLon);
  const y = Math.sin(dLon) * Math.cos(toLatRad);
  const x =
    Math.cos(fromLatRad) * Math.sin(toLatRad) -
    Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(dLon);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

function angularDifference(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}
