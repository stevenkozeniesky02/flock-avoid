import { describe, it, expect, beforeAll } from 'vitest';
import { CameraStore } from '../../../src/data/cameraStore';
import type { Camera } from '../../../src/domain/camera';

const SAMPLE: readonly Camera[] = [
  { id: 'a', type: 'alpr_government', lat: 33.7490, lon: -84.3880, confidence: 0.9, source: 'seed' },
  { id: 'b', type: 'alpr_government', lat: 33.7510, lon: -84.3900, confidence: 0.9, source: 'seed' },
  { id: 'c', type: 'cctv_municipal', lat: 34.0000, lon: -84.0000, confidence: 0.8, source: 'seed' },
];

describe('CameraStore', () => {
  let store: CameraStore;
  beforeAll(() => {
    store = new CameraStore(SAMPLE);
  });

  it('all() returns every camera', () => {
    expect(store.all()).toHaveLength(3);
  });

  it('within() returns cameras inside the bounding circle', () => {
    const result = store.within({ lat: 33.7500, lon: -84.3890 }, 500);
    expect(result.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('within() excludes cameras outside the radius', () => {
    const result = store.within({ lat: 33.7500, lon: -84.3890 }, 500);
    expect(result.find((c) => c.id === 'c')).toBeUndefined();
  });

  it('within() radius 0 returns nothing', () => {
    expect(store.within({ lat: 33.7500, lon: -84.3890 }, 0)).toHaveLength(0);
  });

  it('distanceMeters computes Haversine distance between two points', () => {
    const d = CameraStore.distanceMeters(
      { lat: 33.7490, lon: -84.3880 },
      { lat: 33.7510, lon: -84.3900 },
    );
    expect(d).toBeGreaterThan(250);
    expect(d).toBeLessThan(310);
  });
});
