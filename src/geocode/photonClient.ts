import { GeocodeError, type GeocodeResult, type GeocodeResultType } from './geocodeTypes';

interface PhotonFeature {
  type: 'Feature';
  properties: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
    osm_key?: string;
    osm_value?: string;
    extent?: [number, number, number, number];
  };
  geometry: { type: 'Point'; coordinates: [number, number] };
}

interface PhotonResponse {
  type: 'FeatureCollection';
  features: readonly PhotonFeature[];
}

export class PhotonClient {
  constructor(private readonly baseUrl: string = '/photon') {}

  async search(query: string, signal?: AbortSignal): Promise<readonly GeocodeResult[]> {
    const q = query.trim();
    if (q.length === 0) return [];
    const url = `${this.baseUrl}/api?q=${encodeURIComponent(q)}&limit=5&lang=en`;
    let resp: Response;
    try {
      resp = await fetch(url, { signal: signal ?? null });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new GeocodeError('Search aborted', 'aborted');
      }
      throw new GeocodeError(
        err instanceof Error ? err.message : 'Network error',
        'network',
      );
    }
    if (!resp.ok) {
      throw new GeocodeError(`Photon returned ${resp.status}`, 'http', resp.status);
    }
    let json: PhotonResponse;
    try {
      json = (await resp.json()) as PhotonResponse;
    } catch (err) {
      throw new GeocodeError(
        err instanceof Error ? err.message : 'Malformed JSON',
        'parse',
      );
    }
    return json.features.map(featureToResult);
  }
}

function featureToResult(f: PhotonFeature): GeocodeResult {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const id =
    p.osm_type && p.osm_id !== undefined ? `${p.osm_type}/${p.osm_id}` : `${lat},${lon}`;
  const name = p.name ?? p.street ?? `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const secondary = buildSecondary(p);
  const type = inferType(p);
  const result: GeocodeResult = {
    id,
    name,
    secondary,
    type,
    lat,
    lon,
    ...(p.extent ? { bbox: p.extent } : {}),
  };
  return result;
}

function buildSecondary(p: PhotonFeature['properties']): string {
  const parts: string[] = [];
  if (p.housenumber && p.street) parts.push(`${p.housenumber} ${p.street}`);
  else if (p.street) parts.push(p.street);
  if (p.city) parts.push(p.city);
  if (p.state) parts.push(p.state);
  if (p.postcode) parts.push(p.postcode);
  return parts.join(', ');
}

function inferType(p: PhotonFeature['properties']): GeocodeResultType {
  const key = p.osm_key;
  const value = p.osm_value;
  if (key === 'place') {
    if (value === 'country') return 'country';
    if (value === 'state' || value === 'region') return 'state';
    if (value === 'city' || value === 'town' || value === 'village') return 'city';
  }
  if (key === 'highway') return 'street';
  if (key === 'shop' || key === 'amenity' || key === 'tourism' || key === 'leisure') return 'poi';
  if (p.housenumber) return 'address';
  return 'other';
}
