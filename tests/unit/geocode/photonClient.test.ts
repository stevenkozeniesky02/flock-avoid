import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PhotonClient } from '../../../src/geocode/photonClient';
import { GeocodeError } from '../../../src/geocode/geocodeTypes';

const photonResponse = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        osm_type: 'W', osm_id: 12345,
        name: 'Krog Street Market',
        street: 'Krog St NE', housenumber: '99',
        city: 'Atlanta', state: 'Georgia', country: 'United States',
        osm_key: 'shop', osm_value: 'mall',
      },
      geometry: { type: 'Point', coordinates: [-84.3617, 33.7553] },
    },
    {
      type: 'Feature',
      properties: {
        osm_type: 'N', osm_id: 67890,
        name: 'Atlanta', city: 'Atlanta', state: 'Georgia', country: 'United States',
        osm_key: 'place', osm_value: 'city',
        extent: [-84.55, 33.65, -84.30, 33.89],
      },
      geometry: { type: 'Point', coordinates: [-84.39, 33.749] },
    },
  ],
};

describe('PhotonClient', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('search() hits /photon/api with q and limit params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(photonResponse), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const client = new PhotonClient('/photon');
    await client.search('krog');
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = fetchMock.mock.calls[0]![0] as string;
    expect(url).toContain('/photon/api?');
    expect(url).toContain('q=krog');
    expect(url).toContain('limit=5');
    expect(url).toContain('lang=en');
  });

  it('parses POI features with name + secondary address', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(photonResponse), { status: 200 }),
    ));
    const results = await new PhotonClient('/photon').search('krog');
    expect(results[0]?.id).toBe('W/12345');
    expect(results[0]?.name).toBe('Krog Street Market');
    expect(results[0]?.secondary).toContain('99 Krog St NE');
    expect(results[0]?.secondary).toContain('Atlanta');
    expect(results[0]?.type).toBe('poi');
    expect(results[0]?.lat).toBeCloseTo(33.7553);
    expect(results[0]?.lon).toBeCloseTo(-84.3617);
  });

  it('infers city type and extracts bbox from "extent"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(photonResponse), { status: 200 }),
    ));
    const results = await new PhotonClient('/photon').search('atlanta');
    expect(results[1]?.type).toBe('city');
    expect(results[1]?.bbox).toEqual([-84.55, 33.65, -84.30, 33.89]);
  });

  it('throws GeocodeError(http) on non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 503 })));
    await expect(new PhotonClient('/photon').search('x')).rejects.toMatchObject({
      name: 'GeocodeError', kind: 'http', status: 503,
    });
  });

  it('throws GeocodeError(network) on fetch rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(new PhotonClient('/photon').search('x')).rejects.toMatchObject({
      name: 'GeocodeError', kind: 'network',
    });
  });

  it('throws GeocodeError(aborted) when signal aborts mid-flight', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException('aborted', 'AbortError'));
    }));
    await expect(
      new PhotonClient('/photon').search('x', controller.signal),
    ).rejects.toMatchObject({ name: 'GeocodeError', kind: 'aborted' });
  });

  it('forwards the AbortSignal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const ctrl = new AbortController();
    await new PhotonClient('/photon').search('x', ctrl.signal);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ signal: ctrl.signal });
  });

  it('returns [] for empty query without hitting the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const results = await new PhotonClient('/photon').search('   ');
    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
