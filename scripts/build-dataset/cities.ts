export interface CityBbox {
  readonly slug: string;
  readonly minLat: number;
  readonly minLon: number;
  readonly maxLat: number;
  readonly maxLon: number;
}

export const BENCHMARK_CITIES: readonly CityBbox[] = Object.freeze([
  { slug: 'atlanta',      minLat: 33.62, minLon: -84.55, maxLat: 33.89, maxLon: -84.28 },
  { slug: 'memphis',      minLat: 35.00, minLon: -90.20, maxLat: 35.25, maxLon: -89.85 },
  { slug: 'detroit',      minLat: 42.25, minLon: -83.30, maxLat: 42.45, maxLon: -82.91 },
  { slug: 'dallas',       minLat: 32.62, minLon: -97.00, maxLat: 33.02, maxLon: -96.55 },
  { slug: 'sanfrancisco', minLat: 37.70, minLon: -122.52, maxLat: 37.83, maxLon: -122.36 },
]);

export const US_BBOX = Object.freeze({
  minLat: 24.396308,
  minLon: -125.000000,
  maxLat: 49.384358,
  maxLon: -66.934570,
});

/**
 * Split the contiguous-US bbox into a uniform grid for Overpass queries.
 * Overpass rejects/empties responses for very large bboxes (the CONUS bbox
 * spans ~58° lon × 25° lat — far too large for a single `man_made=surveillance`
 * query). 4 lat × 5 lon = 20 cells gives ~11.6° × 6.25° per cell, which is
 * comparable to a large US state and reliably returns under Overpass's
 * default ratelimits.
 *
 * Each cell is paired with a stable slug for logging.
 */
function buildUsQuadrants(): readonly CityBbox[] {
  const ROWS = 4;
  const COLS = 5;
  const latStep = (US_BBOX.maxLat - US_BBOX.minLat) / ROWS;
  const lonStep = (US_BBOX.maxLon - US_BBOX.minLon) / COLS;
  const cells: CityBbox[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      cells.push({
        slug: `us-r${r}c${c}`,
        minLat: US_BBOX.minLat + r * latStep,
        minLon: US_BBOX.minLon + c * lonStep,
        maxLat: US_BBOX.minLat + (r + 1) * latStep,
        maxLon: US_BBOX.minLon + (c + 1) * lonStep,
      });
    }
  }
  return Object.freeze(cells);
}

export const US_QUADRANTS_BBOX: readonly CityBbox[] = buildUsQuadrants();
