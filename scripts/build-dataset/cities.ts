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
