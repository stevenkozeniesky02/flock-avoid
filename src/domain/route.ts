export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

export interface RouteResult {
  readonly polyline: readonly GeoPoint[];
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly camerasOnRoute: number;
  readonly surveillanceScore: number;
}

export interface RouteComparison {
  readonly start: GeoPoint;
  readonly end: GeoPoint;
  readonly shortest: RouteResult;
  readonly private: RouteResult;
  readonly diff: {
    readonly extraSeconds: number;
    readonly extraMeters: number;
    readonly camerasAvoided: number;
  };
}
