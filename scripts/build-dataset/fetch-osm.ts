import { US_QUADRANTS_BBOX, type CityBbox } from './cities';

export interface RawOsmElement {
  readonly type: 'node' | 'way' | 'relation';
  readonly id: number;
  readonly lat?: number;
  readonly lon?: number;
  readonly center?: { readonly lat: number; readonly lon: number };
  readonly tags?: Readonly<Record<string, string>>;
}

export interface FetchOsmOptions {
  /** Sleep between cell queries to respect Overpass rate-limit etiquette. Default 1000ms. */
  readonly delayMs?: number;
}

const OVERPASS_ENDPOINTS: readonly string[] = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const USER_AGENT =
  'flock-avoid-dataset-builder/0.1 (+https://github.com/stevenkozeniesky02/flock-avoid)';

// Per-cell timeout in seconds (Overpass server-side). 60s is generous for a
// state-sized bbox; the previous 120s+CONUS combination was the failure mode.
const OVERPASS_CELL_TIMEOUT_S = 60;

function buildQuery(cell: CityBbox): string {
  return `
[out:json][timeout:${OVERPASS_CELL_TIMEOUT_S}];
(
  node["man_made"="surveillance"](${cell.minLat},${cell.minLon},${cell.maxLat},${cell.maxLon});
  way["man_made"="surveillance"](${cell.minLat},${cell.minLon},${cell.maxLat},${cell.maxLon});
);
out center;
`.trim();
}

async function fetchCell(cell: CityBbox): Promise<readonly RawOsmElement[] | null> {
  const query = buildQuery(cell);
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!resp.ok) {
        console.warn(`Overpass ${endpoint} cell ${cell.slug}: ${resp.status}`);
        continue;
      }
      const data = (await resp.json()) as { elements?: unknown };
      if (!Array.isArray(data.elements)) {
        console.warn(`Overpass ${endpoint} cell ${cell.slug}: response missing "elements"`);
        continue;
      }
      return data.elements as RawOsmElement[];
    } catch (e) {
      console.warn(`Overpass ${endpoint} cell ${cell.slug}: ${String(e)}`);
      continue;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch all OSM `man_made=surveillance` elements in the contiguous US by
 * issuing one Overpass query per US quadrant (see `US_QUADRANTS_BBOX`).
 *
 * Per-cell behaviour: try each Overpass mirror in order; a cell whose mirrors
 * all fail is logged and skipped (mirrors fetch-deflock's per-tile policy).
 * Throws only if EVERY cell fails on every mirror.
 *
 * Deduplicates by `(type, id)` since a node on a quadrant boundary may appear
 * in two adjacent cells (Overpass bbox queries are inclusive on both sides).
 */
export async function fetchOsm(opts?: FetchOsmOptions): Promise<readonly RawOsmElement[]> {
  const delayMs = opts?.delayMs ?? 1000;
  const seen = new Map<string, RawOsmElement>();
  let cellsSucceeded = 0;

  for (let i = 0; i < US_QUADRANTS_BBOX.length; i++) {
    const cell = US_QUADRANTS_BBOX[i]!;
    const elements = await fetchCell(cell);
    if (elements == null) {
      console.warn(`OSM cell ${cell.slug} failed on all endpoints; skipping`);
    } else {
      cellsSucceeded++;
      for (const el of elements) {
        const key = `${el.type}/${el.id}`;
        if (!seen.has(key)) seen.set(key, el);
      }
    }
    if (delayMs > 0 && i < US_QUADRANTS_BBOX.length - 1) {
      await sleep(delayMs);
    }
  }

  if (cellsSucceeded === 0) {
    throw new Error(
      `All ${US_QUADRANTS_BBOX.length} Overpass cells failed on all endpoints`,
    );
  }

  return Array.from(seen.values());
}

export async function fetchOsmFromFixture(path: string): Promise<readonly RawOsmElement[]> {
  const fs = await import('node:fs/promises');
  const raw = await fs.readFile(path, 'utf-8');
  const data = JSON.parse(raw) as { elements: RawOsmElement[] };
  return data.elements;
}
