import type { Camera } from '../domain/camera';
import type { GeoPoint } from '../domain/route';

const EARTH_RADIUS_M = 6_371_000;

export class CameraStore {
  private readonly cameras: readonly Camera[];

  constructor(cameras: readonly Camera[]) {
    this.cameras = cameras;
  }

  static async loadFromUrl(url: string): Promise<CameraStore> {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to load camera dataset: ${resp.status}`);
    const body = (await resp.json()) as { cameras: Camera[] };
    return new CameraStore(body.cameras);
  }

  all(): readonly Camera[] {
    return this.cameras;
  }

  within(center: GeoPoint, radiusMeters: number): readonly Camera[] {
    if (radiusMeters <= 0) return [];
    return this.cameras.filter(
      (c) => CameraStore.distanceMeters(center, { lat: c.lat, lon: c.lon }) <= radiusMeters,
    );
  }

  static distanceMeters(a: GeoPoint, b: GeoPoint): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
  }
}
