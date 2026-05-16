import type { ThreatProfile } from './threatProfile';

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

export type DegradationReason = 'no_private_path';

export type ExtraTimeEstimate = 'small' | 'medium' | 'large' | 'unknown';

export interface AlternativePreview {
  readonly profile: ThreatProfile;
  readonly camerasAvoidedEstimate: number;
  readonly extraTimeEstimate: ExtraTimeEstimate;
}

export interface RouteDegradation {
  readonly reason: DegradationReason;
  readonly alternativePreviews: readonly AlternativePreview[];
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
  readonly degradation?: RouteDegradation;
}
