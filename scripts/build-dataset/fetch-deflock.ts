import { US_BBOX } from './cities';

/**
 * A single camera record as returned by a DeFlock CDN tile.
 * Shape: bare JSON array of these per tile.
 * Verified against deflock.me / FoggedLens/deflock source — see DEFLOCK-ARCHITECTURE.md.
 */
export interface RawDeflockRecord {
  readonly id: string | number;
  readonly lat: number;
  readonly lon: number;
  readonly tags: Readonly<Record<string, string>>;
}

interface DeflockIndex {
  readonly tile_url: string;
  readonly tile_size_degrees: number;
  readonly regions: readonly string[];
  readonly expiration_utc?: string;
}

const DEFLOCK_INDEX_URL = 'https://cdn.deflock.me/regions/index.json';
const TILE_CONCURRENCY = 5;
const USER_AGENT =
  'flock-avoid-dataset-builder/0.1 (+https://github.com/stevenkozeniesky02/flock-avoid)';

/**
 * Fetch all DeFlock records that intersect the contiguous US bounding box.
 * Hits the real CDN: index → tile list → parallel tile fetches → flat array.
 */
export async function fetchDeflock(): Promise<readonly RawDeflockRecord[]> {
  const index = await fetchDeflockIndex();
  const usRegions = filterRegionsToUS(index);
  const tiles = await fetchTilesConcurrent(index.tile_url, usRegions);
  return tiles.flat();
}

async function fetchDeflockIndex(): Promise<DeflockIndex> {
  const resp = await fetch(DEFLOCK_INDEX_URL, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!resp.ok) {
    throw new Error(`DeFlock index fetch failed: ${resp.status} ${resp.statusText}`);
  }
  const data = (await resp.json()) as Record<string, unknown>;
  if (typeof data['tile_url'] !== 'string') {
    throw new Error('DeFlock index missing tile_url');
  }
  if (typeof data['tile_size_degrees'] !== 'number') {
    throw new Error('DeFlock index missing tile_size_degrees');
  }
  if (!Array.isArray(data['regions'])) {
    throw new Error('DeFlock index missing regions array');
  }
  return {
    tile_url: data['tile_url'],
    tile_size_degrees: data['tile_size_degrees'],
    regions: data['regions'] as string[],
    ...(typeof data['expiration_utc'] === 'string'
      ? { expiration_utc: data['expiration_utc'] }
      : {}),
  };
}

/**
 * Filter the full region list down to tiles that intersect the contiguous US bbox.
 * Each region key is "<tileLat>/<tileLon>" (southwest corner of the tile).
 * The tile covers [tileLat, tileLat + tile_size_degrees) × [tileLon, tileLon + tile_size_degrees).
 */
function filterRegionsToUS(index: DeflockIndex): readonly string[] {
  const out: string[] = [];
  for (const key of index.regions) {
    const parts = key.split('/');
    if (parts.length !== 2) continue;
    const tileLat = Number(parts[0]);
    const tileLon = Number(parts[1]);
    if (!Number.isFinite(tileLat) || !Number.isFinite(tileLon)) continue;
    const tileLatMax = tileLat + index.tile_size_degrees;
    const tileLonMax = tileLon + index.tile_size_degrees;
    // Tile does NOT intersect US bbox → skip
    if (tileLatMax < US_BBOX.minLat || tileLat > US_BBOX.maxLat) continue;
    if (tileLonMax < US_BBOX.minLon || tileLon > US_BBOX.maxLon) continue;
    out.push(key);
  }
  return out;
}

/**
 * Fetch tiles with a max concurrency of TILE_CONCURRENCY (CDN courtesy).
 * A single tile returning 4xx/5xx is logged and treated as empty — not fatal.
 */
async function fetchTilesConcurrent(
  tileUrlTemplate: string,
  regions: readonly string[],
): Promise<readonly RawDeflockRecord[][]> {
  const results: RawDeflockRecord[][] = [];
  for (let i = 0; i < regions.length; i += TILE_CONCURRENCY) {
    const batch = regions.slice(i, i + TILE_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((key) => fetchSingleTile(tileUrlTemplate, key)),
    );
    for (const tile of batchResults) results.push(tile);
  }
  return results;
}

async function fetchSingleTile(
  tileUrlTemplate: string,
  regionKey: string,
): Promise<RawDeflockRecord[]> {
  const [lat, lon] = regionKey.split('/');
  const url = tileUrlTemplate.replace('{lat}', lat!).replace('{lon}', lon!);
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!resp.ok) {
    console.warn(`DeFlock tile ${regionKey} returned ${resp.status}; treating as empty`);
    return [];
  }
  const data = (await resp.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error(`DeFlock tile ${regionKey} did not return an array`);
  }
  return data.filter((r): r is RawDeflockRecord => {
    if (typeof r !== 'object' || r === null) return false;
    const rec = r as Record<string, unknown>;
    return (
      (typeof rec['id'] === 'string' || typeof rec['id'] === 'number') &&
      typeof rec['lat'] === 'number' &&
      typeof rec['lon'] === 'number' &&
      typeof rec['tags'] === 'object' &&
      rec['tags'] !== null
    );
  });
}

/**
 * Test override: read fixtures instead of hitting the network.
 * `indexPath` provides the index.json shape; `tilePath` provides one tile's array.
 * The fixture pipeline pretends the fixture tile is the response for EVERY region
 * in the index that intersects US_BBOX — so dedup logic gets realistic variety.
 */
export async function fetchDeflockFromFixtures(
  indexPath: string,
  tilePath: string,
): Promise<readonly RawDeflockRecord[]> {
  const fs = await import('node:fs/promises');
  const indexRaw = await fs.readFile(indexPath, 'utf-8');
  const index = JSON.parse(indexRaw) as DeflockIndex;
  const usRegions = filterRegionsToUS(index);
  const tileRaw = await fs.readFile(tilePath, 'utf-8');
  const tile = JSON.parse(tileRaw) as RawDeflockRecord[];
  // Emit one copy of the tile per US region (exercises the concat/flat logic)
  return usRegions.flatMap(() => tile);
}
