import type { GeoPoint } from '../domain/route';
import type { ThreatProfile } from '../domain/threatProfile';
import { CameraStore } from '../data/cameraStore';
import { visibilityFactor, MAX_VISIBILITY_M } from './visibilityFactor';

export interface RouteScore {
  readonly camerasSeen: number;
  readonly surveillanceScore: number;
}

export function scoreRoute(
  polyline: readonly GeoPoint[],
  store: CameraStore,
  profile: ThreatProfile,
): RouteScore {
  if (polyline.length === 0) return { camerasSeen: 0, surveillanceScore: 0 };

  const seenIds = new Set<string>();
  let score = 0;

  for (const point of polyline) {
    const nearby = store.within(point, MAX_VISIBILITY_M);
    for (const cam of nearby) {
      const dist = CameraStore.distanceMeters(point, { lat: cam.lat, lon: cam.lon });
      const factor = visibilityFactor(dist);
      const weight = profile.weights[cam.type];
      if (!seenIds.has(cam.id)) {
        seenIds.add(cam.id);
        score += weight * factor;
      }
    }
  }

  return { camerasSeen: seenIds.size, surveillanceScore: score };
}
