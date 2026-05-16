import { describe, it, expect, vi, afterEach } from 'vitest';
import { nearestRoadBearing } from '../../../src/routing/nearestRoadBearing';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('nearestRoadBearing', () => {
  it('returns the heading of the nearest edge when Valhalla finds one', async () => {
    const mockResp = [
      {
        edges: [
          { heading: 92.5, distance: 12, correlated_lat: 33.7501, correlated_lon: -84.3892 },
          { heading: 270, distance: 80, correlated_lat: 33.7505, correlated_lon: -84.3902 },
        ],
      },
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResp), { status: 200 }),
    );

    const bearing = await nearestRoadBearing('http://localhost:8002', 33.75, -84.389);
    expect(bearing).toBeCloseTo(92.5, 5);
  });

  it('returns null when Valhalla returns no edges within 50m', async () => {
    const mockResp = [{ edges: [{ heading: 0, distance: 500 }] }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResp), { status: 200 }),
    );

    const bearing = await nearestRoadBearing('http://localhost:8002', 33.75, -84.389);
    expect(bearing).toBeNull();
  });

  it('returns null when Valhalla request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('error', { status: 500 }),
    );
    const bearing = await nearestRoadBearing('http://localhost:8002', 33.75, -84.389);
    expect(bearing).toBeNull();
  });
});
