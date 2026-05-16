import { describe, it, expect, beforeAll, vi } from 'vitest';
import { CameraStore } from '../../../src/data/cameraStore';
import { resolveCamera } from '../../../src/data/resolvedCamera';
import type { Camera } from '../../../src/domain/camera';

const SAMPLE: readonly Camera[] = [
  { id: 'a', type: 'alpr_government', lat: 33.7490, lon: -84.3880, confidence: 0.9, source: 'seed' },
  { id: 'b', type: 'alpr_government', lat: 33.7510, lon: -84.3900, confidence: 0.9, source: 'seed' },
  { id: 'c', type: 'cctv_municipal', lat: 34.0000, lon: -84.0000, confidence: 0.8, source: 'seed' },
];

describe('CameraStore', () => {
  let store: CameraStore;
  beforeAll(() => {
    store = new CameraStore(SAMPLE.map(resolveCamera));
  });

  it('all() returns every camera as ResolvedCamera', () => {
    const list = store.all();
    expect(list).toHaveLength(3);
    expect(list[0]!.effectiveRangeMeters).toBeGreaterThan(0);
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

  it('distanceMeters Haversine', () => {
    const d = CameraStore.distanceMeters(
      { lat: 33.7490, lon: -84.3880 },
      { lat: 33.7510, lon: -84.3900 },
    );
    expect(d).toBeGreaterThan(250);
    expect(d).toBeLessThan(310);
  });

  it('loadFromUrl rejects URLs not in the allowlist', async () => {
    await expect(CameraStore.loadFromUrl('https://evil.example.com/cameras.json'))
      .rejects.toThrow(/not in allowlist/);
  });

  it('loadFromUrl resolves loaded cameras (fills defaults)', async () => {
    const body = {
      cameras: [
        { id: 'r', type: 'alpr_government', lat: 33.75, lon: -84.39, confidence: 0.9, source: 'seed' },
      ],
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    );
    const loaded = await CameraStore.loadFromUrl('/data/x.json');
    expect(loaded.all()[0]!.effectiveRangeMeters).toBeGreaterThan(0);
    expect(loaded.all()[0]!.directionConfidence).toBe('unknown');
    fetchSpy.mockRestore();
  });

  it('loadFromUrl throws when cameras array is missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    await expect(CameraStore.loadFromUrl('/data/test.json'))
      .rejects.toThrow(/missing top-level/);
    fetchSpy.mockRestore();
  });

  it('loadFromUrl throws when a camera has an unknown type', async () => {
    const bad = { cameras: [{ id: 'x', type: 'unknown_type', lat: 0, lon: 0, confidence: 1, source: 'seed' }] };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(bad), { status: 200 }),
    );
    await expect(CameraStore.loadFromUrl('/data/test.json'))
      .rejects.toThrow(/invalid type/);
    fetchSpy.mockRestore();
  });
});
