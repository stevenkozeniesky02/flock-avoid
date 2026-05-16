import type { GeoPoint } from '../domain/route';
import type { ThreatProfile } from '../domain/threatProfile';
import type { Camera } from '../domain/camera';
import { CameraStore } from '../data/cameraStore';
import { visibilityFactor, MAX_VISIBILITY_M } from './visibilityFactor';

export interface RouteScore {
  readonly camerasSeen: number;
  readonly surveillanceScore: number;
}

interface Encounter {
  readonly camera: Camera;
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
