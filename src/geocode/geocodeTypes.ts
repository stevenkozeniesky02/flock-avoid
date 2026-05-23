export type GeocodeResultType =
  | 'city'
  | 'state'
  | 'country'
  | 'street'
  | 'address'
  | 'poi'
  | 'other';

export interface GeocodeResult {
  /** Stable id: `${osm_type}/${osm_id}` when available, else `${lat},${lon}`. */
  readonly id: string;
  /** Primary label, e.g. "Krog Street Market". */
  readonly name: string;
  /** Secondary label, e.g. "99 Krog St NE, Inman Park, Atlanta GA". */
  readonly secondary: string;
  readonly type: GeocodeResultType;
  readonly lat: number;
  readonly lon: number;
  /** [minLon, minLat, maxLon, maxLat] when Photon provides one. */
  readonly bbox?: readonly [number, number, number, number];
}

export class GeocodeError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'http' | 'parse' | 'aborted',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GeocodeError';
  }
}
