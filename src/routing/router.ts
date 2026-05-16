import type { GeoPoint, RouteComparison, RouteResult, AlternativePreview } from '../domain/route';
import type { ThreatProfile } from '../domain/threatProfile';
import { ALL_PRESETS } from '../domain/threatProfile';
import type { CameraStore } from '../data/cameraStore';
import type { ValhallaClient } from './valhallaClient';
import type { ExclusionPolygon } from './conePolygon.types';
import { buildConePolygon } from './conePolygon';
import { coneForCamera } from './coneFromProfile';
import { parallelRoadDistance } from './parallelRoadDistance';
import { scoreRoute } from './routeScorer';

export class Router {
  private readonly parallelDistanceCache = new Map<string, number>();

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
    const exclusions = await this.buildExclusions(profile);

    const shortestPromise = this.valhalla.route(start, end, []);
    const privatePromise = this.valhalla.route(start, end, exclusions).catch((err: unknown) => {
      if (err instanceof Error && /No path could be found/i.test(err.message)) {
        return null; // signal: degrade
      }
      throw err;
    });

    const [shortestRaw, privateRaw] = await Promise.all([shortestPromise, privatePromise]);
    const shortest = this.annotate(shortestRaw, profile);

    if (privateRaw === null) {
      const previews = await this.buildAlternativePreviews(profile);
      return {
        start,
        end,
        shortest,
        private: shortest,
        diff: { extraSeconds: 0, extraMeters: 0, camerasAvoided: 0 },
        degradation: { reason: 'no_private_path', alternativePreviews: previews },
      };
    }

    const privateR = this.annotate(privateRaw, profile);
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

  private async buildExclusions(profile: ThreatProfile): Promise<ExclusionPolygon[]> {
    const polys: ExclusionPolygon[] = [];
    for (const cam of this.cameras.all()) {
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

  private async buildAlternativePreviews(
    currentProfile: ThreatProfile,
  ): Promise<readonly AlternativePreview[]> {
    const previews: AlternativePreview[] = [];
    for (const candidate of ALL_PRESETS) {
      if (candidate.preset === currentProfile.preset) continue;
      if (candidate.preset === 'custom') continue; // Custom isn't a useful suggestion
      let count = 0;
      for (const cam of this.cameras.all()) {
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

  private annotate(raw: RouteResult, profile: ThreatProfile): RouteResult {
    const score = scoreRoute(raw.polyline, this.cameras, profile);
    return {
      ...raw,
      camerasOnRoute: score.camerasSeen,
      surveillanceScore: score.surveillanceScore,
    };
  }
}
