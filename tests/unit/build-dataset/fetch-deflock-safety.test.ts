import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchDeflock } from '../../../scripts/build-dataset/fetch-deflock';

afterEach(() => { vi.restoreAllMocks(); });

describe('fetch-deflock SSRF protection', () => {
  it('rejects index.json with a malicious tile_url hostname', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('regions/index.json')) {
        return new Response(JSON.stringify({
          tile_url: 'https://evil.example.com/{lat}/{lon}.json',
          tile_size_degrees: 20,
          regions: ['40/-100'],
        }), { status: 200 });
      }
      // Should never reach here — assertTileUrlSafe should throw first.
      return new Response('{}', { status: 200 });
    });

    await expect(fetchDeflock()).rejects.toThrow(/does not match expected/);
  });

  it('accepts index.json with the expected cdn.deflock.me hostname', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('regions/index.json')) {
        return new Response(JSON.stringify({
          tile_url: 'https://cdn.deflock.me/tiles/v1/{lat}/{lon}.json',
          tile_size_degrees: 20,
          regions: ['40/-100'],
        }), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    await expect(fetchDeflock()).resolves.toBeDefined();
  });
});
