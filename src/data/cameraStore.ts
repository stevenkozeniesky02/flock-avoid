import { isCameraType, type Camera } from '../domain/camera';
import type { GeoPoint } from '../domain/route';
import { isAllowedUrl } from '../privacy/networkAllowlist';
import { resolveCamera, type ResolvedCamera } from './resolvedCamera';

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
  if (typeof r['confidence'] !== 'number') throw new Error(`camera ${r['id']} has invalid confidence`);
  if (typeof r['source'] !== 'string' || !VALID_SOURCES.has(r['source'])) {
    throw new Error(`camera ${r['id']} has invalid source: ${String(r['source'])}`);
  }
  const base: Camera = {
    id: r['id'],
    type: r['type'],
    lat: r['lat'],
    lon: r['lon'],
    confidence: r['confidence'],
    source: r['source'] as Camera['source'],
  };
  const out: Camera = {
    ...base,
    ...(typeof r['direction'] === 'number' ? { direction: r['direction'] } : {}),
    ...(typeof r['rangeMeters'] === 'number' ? { rangeMeters: r['rangeMeters'] } : {}),
    ...(typeof r['fovDegrees'] === 'number' ? { fovDegrees: r['fovDegrees'] } : {}),
    ...(r['directionConfidence'] === 'known' ||
    r['directionConfidence'] === 'inferred' ||
    r['directionConfidence'] === 'unknown'
      ? { directionConfidence: r['directionConfidence'] }
      : {}),
  };
  return out;
}

export class CameraStore {
  private readonly cameras: readonly ResolvedCamera[];

  constructor(cameras: readonly ResolvedCamera[]) {
    this.cameras = cameras;
  }

  static async loadFromUrl(url: string): Promise<CameraStore> {
    if (url.startsWith('/') || url.startsWith('./')) {
      // same-origin, no allowlist check needed
    } else if (!isAllowedUrl(url)) {
      throw new Error(`Camera dataset URL not in allowlist: ${url}`);
    }
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to load camera dataset: ${resp.status}`);
    const body = (await resp.json()) as { cameras?: unknown };
    if (!Array.isArray(body.cameras)) {
      throw new Error('Camera dataset JSON missing top-level "cameras" array');
    }
    const resolved = body.cameras.map((raw, i) => resolveCamera(parseCamera(raw, i)));
    return new CameraStore(resolved);
  }

  all(): readonly ResolvedCamera[] {
    return this.cameras;
  }

  within(center: GeoPoint, radiusMeters: number): readonly ResolvedCamera[] {
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
