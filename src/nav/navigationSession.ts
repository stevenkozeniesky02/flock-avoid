import type { GeoPoint, RouteComparison, RouteResult } from '../domain/route';
import type { ManeuverKind } from '../domain/maneuver';
import type { ThreatProfile } from '../domain/threatProfile';
import type { LocationStore } from '../location/locationStore';
import type { Router } from '../routing/router';
import {
  haversineMeters,
  snapToPolyline,
  advanceManeuverIndex,
  distanceToManeuver,
} from '../routing/routeGeometry';

export interface NavigationView {
  readonly activeRouteKind: 'shortest' | 'private';
  readonly activeManeuverIdx: number;
  readonly nextManeuverInstruction: string;
  readonly nextManeuverKind: ManeuverKind;
  readonly distanceToNextManeuverMeters: number;
  readonly distanceOffRouteMeters: number;
  readonly etaSeconds: number;
  readonly isRerouting: boolean;
  readonly hasArrived: boolean;
}

export interface NavigationSessionOptions {
  readonly initialComparison: RouteComparison;
  readonly initialRouteKind: 'shortest' | 'private';
  readonly threatProfile: ThreatProfile;
  readonly router: Router;
  readonly locationStore: LocationStore;
  readonly offRouteMeters?: number;
  readonly offRoutePersistMs?: number;
  readonly rerouteCooldownMs?: number;
  readonly arrivalRadiusMeters?: number;
  readonly now?: () => number;
  readonly onUpdate: (view: NavigationView) => void;
  readonly onRouteChanged: (cmp: RouteComparison, kind: 'shortest' | 'private') => void;
  readonly onError: (message: string) => void;
}

const DEFAULTS = {
  offRouteMeters: 40,
  offRoutePersistMs: 5000,
  rerouteCooldownMs: 10_000,
  arrivalRadiusMeters: 30,
} as const;

export class NavigationSession {
  private readonly activeKind: 'shortest' | 'private';
  private readonly originalDestination: GeoPoint;
  private readonly threatProfile: ThreatProfile;
  private readonly router: Router;
  private readonly locationStore: LocationStore;
  private readonly offRouteMeters: number;
  private readonly offRoutePersistMs: number;
  private readonly rerouteCooldownMs: number;
  private readonly arrivalRadiusMeters: number;
  private readonly now: () => number;

  private onUpdate: ((view: NavigationView) => void) | null;
  private readonly onRouteChanged: (cmp: RouteComparison, kind: 'shortest' | 'private') => void;
  private readonly onError: (message: string) => void;

  private comparison: RouteComparison;
  private activeRoute: RouteResult;
  private activeManeuverIdx = 0;
  private offRouteSinceMs: number | null = null;
  private lastRerouteAtMs = -Infinity;
  private isRerouting = false;
  private hasArrived = false;
  private unsubscribe: (() => void) | null = null;
  private latestSnapDistance = 0;
  private latestDistanceToNext = 0;
  private latestEtaSeconds = 0;

  constructor(opts: NavigationSessionOptions) {
    this.activeKind = opts.initialRouteKind;
    this.comparison = opts.initialComparison;
    this.activeRoute = pickRoute(this.comparison, this.activeKind);
    this.originalDestination = opts.initialComparison.end;
    this.threatProfile = opts.threatProfile;
    this.router = opts.router;
    this.locationStore = opts.locationStore;
    this.offRouteMeters = opts.offRouteMeters ?? DEFAULTS.offRouteMeters;
    this.offRoutePersistMs = opts.offRoutePersistMs ?? DEFAULTS.offRoutePersistMs;
    this.rerouteCooldownMs = opts.rerouteCooldownMs ?? DEFAULTS.rerouteCooldownMs;
    this.arrivalRadiusMeters = opts.arrivalRadiusMeters ?? DEFAULTS.arrivalRadiusMeters;
    this.now = opts.now ?? (() => Date.now());
    this.onUpdate = opts.onUpdate;
    this.onRouteChanged = opts.onRouteChanged;
    this.onError = opts.onError;
    this.latestEtaSeconds = this.activeRoute.durationSeconds;
  }

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.locationStore.subscribe((state) => {
      if (state.status === 'tracking') {
        this.feedPosition({ lat: state.position.lat, lon: state.position.lon });
      }
    });
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  destroy(): void {
    this.stop();
    this.onUpdate = null;
  }

  feedPosition(p: GeoPoint): void {
    if (this.hasArrived) return;

    const polyline = this.activeRoute.polyline;
    const snap = snapToPolyline(p, polyline);
    this.latestSnapDistance = snap.distanceMeters;
    this.activeManeuverIdx = advanceManeuverIndex(
      this.activeRoute.maneuvers,
      this.activeManeuverIdx,
      snap.segmentIndex,
    );

    const nextIdx = Math.min(this.activeManeuverIdx + 1, this.activeRoute.maneuvers.length - 1);
    this.latestDistanceToNext = distanceToManeuver(
      polyline,
      snap,
      this.activeRoute.maneuvers,
      nextIdx,
    );

    const totalMeters = this.activeRoute.distanceMeters || 1;
    const fractionComplete = Math.max(0, Math.min(1, snap.alongMeters / totalMeters));
    this.latestEtaSeconds = Math.round(this.activeRoute.durationSeconds * (1 - fractionComplete));

    // Arrival check (independent of the polyline — we measure to the user's intended destination).
    const distToDestination = haversineMeters(p, this.originalDestination);
    if (distToDestination <= this.arrivalRadiusMeters) {
      this.hasArrived = true;
      this.emit();
      this.stop();
      return;
    }

    // Off-route bookkeeping. Only the user's own position can ever set this state.
    const t = this.now();
    if (snap.distanceMeters > this.offRouteMeters) {
      if (this.offRouteSinceMs === null) {
        this.offRouteSinceMs = t;
      }
      if (
        !this.isRerouting &&
        t - this.offRouteSinceMs >= this.offRoutePersistMs &&
        t - this.lastRerouteAtMs >= this.rerouteCooldownMs
      ) {
        void this.kickReroute(p, t);
      }
    } else {
      this.offRouteSinceMs = null;
    }

    this.emit();
  }

  private async kickReroute(p: GeoPoint, atMs: number): Promise<void> {
    this.isRerouting = true;
    this.emit();
    try {
      const cmp = await this.router.compareRoutes(p, this.originalDestination, this.threatProfile);
      this.comparison = cmp;
      this.activeRoute = pickRoute(cmp, this.activeKind);
      this.activeManeuverIdx = 0;
      this.offRouteSinceMs = null;
      this.lastRerouteAtMs = atMs;
      this.isRerouting = false;
      this.onRouteChanged(cmp, this.activeKind);
      this.emit();
    } catch (err) {
      this.isRerouting = false;
      this.lastRerouteAtMs = atMs;
      this.offRouteSinceMs = null;
      this.emit();
      const msg = err instanceof Error ? err.message : String(err);
      this.onError(`Re-route failed: ${msg}`);
    }
  }

  private emit(): void {
    if (!this.onUpdate) return;
    const maneuvers = this.activeRoute.maneuvers;
    const nextIdx = Math.min(this.activeManeuverIdx + 1, maneuvers.length - 1);
    const next = maneuvers[nextIdx] ?? maneuvers[0];
    this.onUpdate({
      activeRouteKind: this.activeKind,
      activeManeuverIdx: this.activeManeuverIdx,
      nextManeuverInstruction: next?.instruction ?? '',
      nextManeuverKind: next?.kind ?? 'other',
      distanceToNextManeuverMeters: this.latestDistanceToNext,
      distanceOffRouteMeters: this.latestSnapDistance,
      etaSeconds: this.latestEtaSeconds,
      isRerouting: this.isRerouting,
      hasArrived: this.hasArrived,
    });
  }
}

function pickRoute(cmp: RouteComparison, kind: 'shortest' | 'private'): RouteResult {
  return kind === 'private' ? cmp.private : cmp.shortest;
}
