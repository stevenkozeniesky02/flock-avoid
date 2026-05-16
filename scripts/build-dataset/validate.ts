import type { Camera } from '../../src/domain/camera';

const US_LAT_MIN = 24.0;
const US_LAT_MAX = 50.0;
const US_LON_MIN = -125.5;
const US_LON_MAX = -66.5;
const MAX_CAMERAS_PER_KM2 = 200;

export function validateDataset(cameras: readonly Camera[]): void {
  if (cameras.length === 0) {
    throw new Error('dataset is empty — refuse to publish');
  }
  for (const cam of cameras) {
    if (cam.lat < US_LAT_MIN || cam.lat > US_LAT_MAX) {
      throw new Error(`camera ${cam.id} has out-of-US lat: ${cam.lat}`);
    }
    if (cam.lon < US_LON_MIN || cam.lon > US_LON_MAX) {
      throw new Error(`camera ${cam.id} has out-of-US lon: ${cam.lon}`);
    }
  }
  const buckets = new Map<string, number>();
  for (const cam of cameras) {
    const key = `${Math.round(cam.lat * 100)}|${Math.round(cam.lon * 100)}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  for (const [key, count] of buckets) {
    if (count > MAX_CAMERAS_PER_KM2) {
      throw new Error(`density check failed: ~${count} cameras in 1km² cell at ${key} (max ${MAX_CAMERAS_PER_KM2})`);
    }
  }
}
