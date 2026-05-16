import { US_BBOX } from './cities.ts';

export interface RawOsmElement {
  readonly type: 'node' | 'way' | 'relation';
  readonly id: number;
  readonly lat?: number;
  readonly lon?: number;
  readonly center?: { readonly lat: number; readonly lon: number };
  readonly tags?: Readonly<Record<string, string>>;
}

const OVERPASS_ENDPOINTS: readonly string[] = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const USER_AGENT =
  'flock-avoid-dataset-builder/0.1 (+https://github.com/stevenkozeniesky02/flock-avoid)';

const OVERPASS_QUERY = `
[out:json][timeout:120];
(
  node["man_made"="surveillance"](${US_BBOX.minLat},${US_BBOX.minLon},${US_BBOX.maxLat},${US_BBOX.maxLon});
  way["man_made"="surveillance"](${US_BBOX.minLat},${US_BBOX.minLon},${US_BBOX.maxLat},${US_BBOX.maxLon});
);
out center;
`.trim();

export async function fetchOsm(): Promise<readonly RawOsmElement[]> {
  let lastErr: unknown = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
      });
      if (!resp.ok) {
        lastErr = new Error(`Overpass ${endpoint} returned ${resp.status}`);
        continue;
      }
      const data = (await resp.json()) as { elements?: unknown };
      if (!Array.isArray(data.elements)) {
        lastErr = new Error(`Overpass ${endpoint} response missing "elements"`);
        continue;
      }
      return data.elements as RawOsmElement[];
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  throw new Error(`All Overpass endpoints failed; last error: ${String(lastErr)}`);
}

export async function fetchOsmFromFixture(path: string): Promise<readonly RawOsmElement[]> {
  const fs = await import('node:fs/promises');
  const raw = await fs.readFile(path, 'utf-8');
  const data = JSON.parse(raw) as { elements: RawOsmElement[] };
  return data.elements;
}
