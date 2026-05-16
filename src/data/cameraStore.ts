import { isCameraType, type Camera } from '../domain/camera';
import type { GeoPoint } from '../domain/route';
import { isAllowedUrl } from '../privacy/networkAllowlist';

const EARTH_RADIUS_M = 6_371_000;

const VALID_SOURCES = new Set(['seed', 'deflock', 'osm', 'submission', 'foia']);

function parseCamera(raw: unknown, index: number): Camera {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`camera at index ${index} is not an object`);
  }
  const r = raw as Record<string, unknown>;
  if (typeof r['id'] !== 'string') throw new Error(`camera at index ${index} has invalid id`);
  if (!isCameraType(r['type'])) {
    throw new Error(`camera at index ${index} has invalid type: ${String(r['type'])}`);
  }
  if (typeof r['lat'] !== 'number') throw new Error(`camera ${r['id']} has invalid lat`);
  if (typeof r['lon'] !== 'number') throw new Error(`camera ${r['id']} has invalid lon`);
  if (typeof r['confidence'] !== 'number') {
    throw new Error(`camera ${r['id']} has invalid confidence`);
  }
  if (typeof r['source'] !== 'string' || !VALID_SOURCES.has(r['source'])) {
    throw new Error(`camera ${r['id']} has invalid source: ${String(r['source'])}`);
  }
  return {
    id: r['id'],
    type: r['type'],
    lat: r['lat'] as number,
    lon: r['lon'] as number,
    confidence: r['confidence'] as number,
    source: r['source'] as Camera['source'],
  };
}

export class CameraStore {
  private readonly cameras: readonly Camera[];

  constructor(cameras: readonly Camera[]) {
    this.cameras = cameras;
  }

  static async loadFromUrl(url: string): Promise<CameraStore> {
    if (url.startsWith('/') || url.startsWith('./')) {
      // relative URL — same-origin by construction, no allowlist check needed
    } else if (!isAllowedUrl(url)) {
      throw new Error(`Camera dataset URL not in allowlist: ${url}`);
    }
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to load camera dataset: ${resp.status}`);
    const body = (await resp.json()) as { cameras?: unknown };
    if (!Array.isArray(body.cameras)) {
      throw new Error('Camera dataset JSON missing top-level "cameras" array');
    }
    const cameras = body.cameras.map((raw, i) => parseCamera(raw, i));
    return new CameraStore(cameras);
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
