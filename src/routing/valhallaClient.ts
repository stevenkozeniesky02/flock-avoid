import type { GeoPoint, RouteResult } from '../domain/route';
import type { ExclusionPolygon } from './conePolygon.types';
import { isAllowedUrl } from '../privacy/networkAllowlist';
import { parseManeuvers, type ValhallaLeg } from './maneuverParser';

interface ValhallaRouteResponse {
  trip: {
    summary: { length: number; time: number };
    legs: ValhallaLeg[];
  };
}

export class ValhallaClient {
  constructor(private readonly baseUrl: string) {
    const isRelative = baseUrl.startsWith('/') || baseUrl.startsWith('./');
    if (!isRelative && !isAllowedUrl(`${baseUrl}/status`)) {
      throw new Error(`Valhalla baseUrl not in allowlist: ${baseUrl}`);
    }
  }

  async route(
    start: GeoPoint,
    end: GeoPoint,
    excludePolygons: readonly ExclusionPolygon[],
  ): Promise<RouteResult> {
    const body = {
      locations: [
        { lat: start.lat, lon: start.lon },
        { lat: end.lat, lon: end.lon },
      ],
      costing: 'auto',
      directions_options: { units: 'kilometers' },
      exclude_polygons: excludePolygons.map((p) => p.map((point) => [...point])),
    };

    const resp = await fetch(`${this.baseUrl}/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      throw new Error(`Valhalla error ${resp.status}: ${await resp.text()}`);
    }
    const data = (await resp.json()) as ValhallaRouteResponse;
    const polyline = data.trip.legs.flatMap((leg) => decodePolyline6(leg.shape));
    const maneuvers = parseManeuvers(data.trip.legs);
    return {
      polyline,
      distanceMeters: Math.round(data.trip.summary.length * 1000),
      durationSeconds: Math.round(data.trip.summary.time),
      camerasOnRoute: 0,
      surveillanceScore: 0,
      maneuvers,
    };
  }
}

/** Decode Valhalla's polyline6 format (Google Polyline with precision 1e-6). */
function decodePolyline6(encoded: string): GeoPoint[] {
  const points: GeoPoint[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dLat;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dLon = result & 1 ? ~(result >> 1) : result >> 1;
    lon += dLon;

    points.push({ lat: lat / 1e6, lon: lon / 1e6 });
  }
  return points;
}
