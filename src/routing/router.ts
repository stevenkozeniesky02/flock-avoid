import type { GeoPoint, RouteComparison, RouteResult } from '../domain/route';
import type { ThreatProfile } from '../domain/threatProfile';
import type { CameraStore } from '../data/cameraStore';
import type { ValhallaClient } from './valhallaClient';
import { camerasToExclusionPolygons } from './exclusionPolygons';
import { scoreRoute } from './routeScorer';

export class Router {
  constructor(
    private readonly valhalla: ValhallaClient,
    private readonly cameras: CameraStore,
  ) {}

  async compareRoutes(
    start: GeoPoint,
    end: GeoPoint,
    profile: ThreatProfile,
  ): Promise<RouteComparison> {
    const exclusions = camerasToExclusionPolygons(this.cameras.all(), profile);

    const [shortestRaw, privateRaw] = await Promise.all([
      this.valhalla.route(start, end, []),
      this.valhalla.route(start, end, exclusions),
    ]);

    const shortest = this.annotate(shortestRaw, profile);
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

  private annotate(raw: RouteResult, profile: ThreatProfile): RouteResult {
    const score = scoreRoute(raw.polyline, this.cameras, profile);
    return {
      ...raw,
      camerasOnRoute: score.camerasSeen,
      surveillanceScore: score.surveillanceScore,
    };
  }
}
