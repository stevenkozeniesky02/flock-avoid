/** Polygon ring in Valhalla's `exclude_polygons` format: [[lon,lat], ...closed]. */
export type ExclusionPolygon = readonly (readonly [number, number])[];
