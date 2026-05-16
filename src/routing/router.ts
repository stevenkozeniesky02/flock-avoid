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

    const shortestPromise = this.valhalla.route(start, end, []);
    const privatePromise = this.valhalla.route(start, end, exclusions).catch((err: unknown) => {
      if (err instanceof Error && /No path could be found/i.test(err.message)) {
        throw new Error(
          `No private route possible for the ${profile.preset} profile in this area — ` +
            `exclusion zones around nearby cameras completely block routing. ` +
            `Try a less restrictive profile (Commuter) or different start/end points.`,
        );
      }
      throw err;
    });

    const [shortestRaw, privateRaw] = await Promise.all([shortestPromise, privatePromise]);

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
