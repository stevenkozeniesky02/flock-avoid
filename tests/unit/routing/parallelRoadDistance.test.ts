import { describe, it, expect, vi, afterEach } from 'vitest';
import { parallelRoadDistance } from '../../../src/routing/parallelRoadDistance';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parallelRoadDistance', () => {
  it('returns the smallest distance among edges within ±30° of the target bearing', async () => {
    const mockResp = [
      {
        edges: [
          { heading: 0, distance: 5 },     // same road, skip (distance < 12)
          { heading: 90, distance: 60 },   // ~parallel (target 88), distance 60
          { heading: 92, distance: 40 },   // ~parallel, distance 40 -- nearest parallel
          { heading: 200, distance: 30 },  // not parallel
        ],
      },
    ];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResp), { status: 200 }),
    );

    const d = await parallelRoadDistance('http://localhost:8002', 33.75, -84.389, 88);
    expect(d).toBeCloseTo(40, 5);
  });

  it('returns Infinity when no parallel road found', async () => {
    const mockResp = [{ edges: [{ heading: 0, distance: 5 }] }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockResp), { status: 200 }),
    );

    const d = await parallelRoadDistance('http://localhost:8002', 33.75, -84.389, 90);
    expect(d).toBe(Infinity);
  });

  it('returns Infinity on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('boom', { status: 500 }),
    );
    expect(await parallelRoadDistance('http://localhost:8002', 33.75, -84.389, 90)).toBe(Infinity);
  });
});
