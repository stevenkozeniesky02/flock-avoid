import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchOsm } from '../../../scripts/build-dataset/fetch-osm';
import { US_QUADRANTS_BBOX } from '../../../scripts/build-dataset/cities';

afterEach(() => { vi.restoreAllMocks(); });

function okResponse(elements: unknown[]): Response {
  return new Response(JSON.stringify({ elements }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('fetchOsm split-bbox queries', () => {
  it('issues one POST per US quadrant', async () => {
    let count = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      count++;
      return okResponse([]);
    });
    await fetchOsm({ delayMs: 0 });
    expect(count).toBe(US_QUADRANTS_BBOX.length);
  });

  it('concatenates results across quadrants', async () => {
    let idx = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      idx++;
      return okResponse([
        { type: 'node', id: idx, lat: 40, lon: -100, tags: { man_made: 'surveillance' } },
      ]);
    });
    const result = await fetchOsm({ delayMs: 0 });
    expect(result.length).toBe(US_QUADRANTS_BBOX.length);
  });

  it('deduplicates elements by (type, id) across quadrants', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      // Same element id returned by every cell — must dedup to 1.
      return okResponse([
        { type: 'node', id: 42, lat: 40, lon: -100, tags: { man_made: 'surveillance' } },
      ]);
    });
    const result = await fetchOsm({ delayMs: 0 });
    expect(result.length).toBe(1);
  });

  it('treats type/id collisions across types as distinct', async () => {
    let n = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      n++;
      return okResponse([
        { type: n % 2 === 0 ? 'node' : 'way', id: 7, center: { lat: 40, lon: -100 }, tags: { man_made: 'surveillance' } },
      ]);
    });
    const result = await fetchOsm({ delayMs: 0 });
    // 2 distinct (type,id) pairs total despite same id
    expect(new Set(result.map((e) => `${e.type}/${e.id}`)).size).toBe(2);
  });

  it('falls back to next endpoint when the first returns 5xx', async () => {
    let attempts = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      attempts++;
      if (attempts === 1) return new Response('boom', { status: 500 });
      return okResponse([]);
    });
    await expect(fetchOsm({ delayMs: 0 })).resolves.toBeDefined();
    // first cell retries once (1 fail + 1 success) + remaining cells = quadrants + 1
    expect(attempts).toBe(US_QUADRANTS_BBOX.length + 1);
  });

  it('skips a cell whose endpoints all fail but keeps results from other cells', async () => {
    const failCell = US_QUADRANTS_BBOX[0]!;
    const failBboxFragment = `(${failCell.minLat},${failCell.minLon},`;
    let failingCellAttempts = 0;
    let succeedingCellAttempts = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const decoded = decodeURIComponent(String(init?.body ?? '').replace(/^data=/, ''));
      if (decoded.includes(failBboxFragment)) {
        failingCellAttempts++;
        return new Response('rate limited', { status: 429 });
      }
      succeedingCellAttempts++;
      return okResponse([
        { type: 'node', id: succeedingCellAttempts, lat: 40, lon: -100, tags: { man_made: 'surveillance' } },
      ]);
    });
    const result = await fetchOsm({ delayMs: 0 });
    // Failing cell tried all 3 endpoints; remaining cells succeeded once each.
    expect(failingCellAttempts).toBe(3);
    expect(succeedingCellAttempts).toBe(US_QUADRANTS_BBOX.length - 1);
    expect(result.length).toBe(US_QUADRANTS_BBOX.length - 1);
  });

  it('throws when every cell fails on every endpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('upstream broken', { status: 503 }),
    );
    await expect(fetchOsm({ delayMs: 0 })).rejects.toThrow(/overpass/i);
  });

  it('issues queries with a bbox matching each quadrant', async () => {
    const seenBboxes: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      // Body is `data=<urlencoded-query>` — decode to read the bbox.
      const raw = String(init?.body ?? '');
      const decoded = decodeURIComponent(raw.replace(/^data=/, ''));
      const match = decoded.match(/\((-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*),(-?\d+\.?\d*)\)/);
      if (match) seenBboxes.push(match[0]!);
      return okResponse([]);
    });
    await fetchOsm({ delayMs: 0 });
    // Every quadrant's bbox should appear at least once in some query body.
    for (const q of US_QUADRANTS_BBOX) {
      const expected = `(${q.minLat},${q.minLon},${q.maxLat},${q.maxLon})`;
      expect(seenBboxes).toContain(expected);
    }
  });
});
