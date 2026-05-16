import type { GeoPoint, RouteComparison, RouteResult, AlternativePreview } from '../domain/route';
import type { ThreatProfile } from '../domain/threatProfile';
import { ALL_PRESETS } from '../domain/threatProfile';
import { CameraStore } from '../data/cameraStore';
import type { ResolvedCamera } from '../data/resolvedCamera';
import type { ValhallaClient } from './valhallaClient';
import type { ExclusionPolygon } from './conePolygon.types';
import { buildConePolygon } from './conePolygon';
import { coneForCamera } from './coneFromProfile';
import { parallelRoadDistance } from './parallelRoadDistance';
import { nearestRoadBearing } from './nearestRoadBearing';
import { scoreRoute } from './routeScorer';

export class Router {
  private readonly parallelDistanceCache = new Map<string, number>();
  private readonly bearingCache = new Map<string, number | null | 'pending'>();

  constructor(
    private readonly valhalla: ValhallaClient,
    private readonly cameras: CameraStore,
    private readonly valhallaBaseUrlForLocate: string,
  ) {}

  async compareRoutes(
    start: GeoPoint,
    end: GeoPoint,
    profile: ThreatProfile,
  ): Promise<RouteComparison> {
    const effective = this.buildEffectiveCameras();
    const effectiveStore = new CameraStore(effective);
    const exclusions = await this.buildExclusions(profile, effective);

    const shortestPromise = this.valhalla.route(start, end, []);
    const privatePromise = this.valhalla.route(start, end, exclusions).catch((err: unknown) => {
      if (err instanceof Error && /No path could be found/i.test(err.message)) {
        return null; // signal: degrade
      }
      throw err;
    });

    const [shortestRaw, privateRaw] = await Promise.all([shortestPromise, privatePromise]);
    const shortest = this.annotate(shortestRaw, effectiveStore, profile);

    if (privateRaw === null) {
      const previews = this.buildAlternativePreviews(profile, shortest.polyline, effective);
      return {
        start,
        end,
        shortest,
        private: shortest,
        diff: { extraSeconds: 0, extraMeters: 0, camerasAvoided: 0 },
        degradation: { reason: 'no_private_path', alternativePreviews: previews },
      };
    }

    const privateR = this.annotate(privateRaw, effectiveStore, profile);
    return {
      start,
      end,
      shortest,
      private: privateR,
      diff: {
        extraSeconds: privateR.durationSeconds - shortest.durationSeconds,
        extraMeters: privateR.distanceMeters - shortest.distanceMeters,
        camerasAvoided: shortest.camerasOnRoute - privateR.camerasOnRoute,
      },
    };
  }

  /** Resolve all cameras, substituting inferred bearings for unknown-direction ones. */
  private buildEffectiveCameras(): readonly ResolvedCamera[] {
    return this.cameras.all().map((c) => this.resolveBearingIfUnknown(c));
  }

  resolveBearingIfUnknown(cam: ResolvedCamera): ResolvedCamera {
    if (cam.directionConfidence !== 'unknown') return cam;
    const inferred = this.cachedNearestRoadBearing(cam.lat, cam.lon);
    if (inferred == null) {
      // Pending (first call) OR lookup returned no road — fall back to full circle
      return { ...cam, effectiveFovDegrees: 360 };
    }
    return {
      ...cam,
      effectiveDirection: inferred,
      effectiveFovDegrees: 180,
      directionConfidence: 'inferred',
    };
  }

  private cachedNearestRoadBearing(lat: number, lon: number): number | null {
    const key = `${lat.toFixed(5)}|${lon.toFixed(5)}`;
    const cached = this.bearingCache.get(key);
    if (cached === 'pending') return null;
    if (cached !== undefined) return cached;
    this.bearingCache.set(key, 'pending');
    void this.fetchAndCacheBearing(key, lat, lon);
    return null;
  }

  private async fetchAndCacheBearing(key: string, lat: number, lon: number): Promise<void> {
    const b = await nearestRoadBearing(this.valhallaBaseUrlForLocate, lat, lon);
    this.bearingCache.set(key, b);
  }

  private async buildExclusions(
    profile: ThreatProfile,
    effective: readonly ResolvedCamera[],
  ): Promise<ExclusionPolygon[]> {
    const polys: ExclusionPolygon[] = [];
    for (const cam of effective) {
      const lookup = (lat: number, lon: number, bearing: number) =>
        this.cachedParallelDistance(lat, lon, bearing);
      const cone = coneForCamera(cam, profile, lookup);
      if (cone === null) continue;
      polys.push(buildConePolygon(cone));
    }
    return polys;
  }

  private cachedParallelDistance(lat: number, lon: number, bearing: number): number {
    const key = `${lat.toFixed(5)}|${lon.toFixed(5)}|${Math.round(bearing)}`;
    const cached = this.parallelDistanceCache.get(key);
    if (cached != null) return cached;
    // First call returns Infinity (no parallel-road constraint); the async
    // lookup is fired so subsequent route calls get the cached real value.
    void this.fetchAndCacheParallelDistance(key, lat, lon, bearing);
    return Infinity;
  }

  private async fetchAndCacheParallelDistance(
    key: string,
    lat: number,
    lon: number,
    bearing: number,
  ): Promise<void> {
    if (this.parallelDistanceCache.has(key)) return;
    const d = await parallelRoadDistance(this.valhallaBaseUrlForLocate, lat, lon, bearing);
    this.parallelDistanceCache.set(key, d);
  }

  private buildAlternativePreviews(
    currentProfile: ThreatProfile,
    shortestPolyline: readonly GeoPoint[],
    effective: readonly ResolvedCamera[],
  ): readonly AlternativePreview[] {
    const bbox = bboxAroundPolyline(shortestPolyline, 200);
    const inBox = (cam: ResolvedCamera): boolean =>
      cam.lat >= bbox.minLat &&
      cam.lat <= bbox.maxLat &&
      cam.lon >= bbox.minLon &&
      cam.lon <= bbox.maxLon;

    const previews: AlternativePreview[] = [];
    for (const candidate of ALL_PRESETS) {
      if (candidate.preset === currentProfile.preset) continue;
      if (candidate.preset === 'custom') continue;
      let count = 0;
      for (const cam of effective) {
        if (!inBox(cam)) continue;
        if (candidate.weights[cam.type] > 0) count++;
      }
      previews.push({
        profile: candidate,
        camerasAvoidedEstimate: count,
        extraTimeEstimate: 'unknown',
      });
    }
    return previews;
  }

  private annotate(raw: RouteResult, effectiveStore: CameraStore, profile: ThreatProfile): RouteResult {
    const score = scoreRoute(raw.polyline, effectiveStore, profile);
    return {
      ...raw,
      camerasOnRoute: score.camerasSeen,
      surveillanceScore: score.surveillanceScore,
    };
  }
}

function bboxAroundPolyline(
  poly: readonly GeoPoint[],
  paddingMeters: number,
): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  if (poly.length === 0) {
    return { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 };
  }
  let minLat = poly[0]!.lat;
  let maxLat = poly[0]!.lat;
  let minLon = poly[0]!.lon;
  let maxLon = poly[0]!.lon;
  for (const p of poly) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  const padLat = paddingMeters / 111_320;
  const avgLat = (minLat + maxLat) / 2;
  const padLon = paddingMeters / (111_320 * Math.cos((avgLat * Math.PI) / 180));
  return {
    minLat: minLat - padLat,
    maxLat: maxLat + padLat,
    minLon: minLon - padLon,
    maxLon: maxLon + padLon,
  };
}
