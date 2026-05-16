import type { Camera } from '../../src/domain/camera';

const MATCH_RADIUS_M = 10;
const EARTH_RADIUS_M = 6_371_000;

export interface MergeStats {
  readonly duplicatesCollapsed: number;
  readonly matchRadiusMeters: 10;
}

export function mergeDatasets(
  deflock: readonly Camera[],
  osm: readonly Camera[],
): Camera[] {
  return mergeWithStats(deflock, osm).merged;
}

export function mergeWithStats(
  deflock: readonly Camera[],
  osm: readonly Camera[],
): { merged: Camera[]; stats: MergeStats } {
  const all = [...deflock, ...osm];
  const used = new Set<number>();
  const merged: Camera[] = [];
  let duplicatesCollapsed = 0;

  for (let i = 0; i < all.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    let acc = all[i]!;
    for (let j = i + 1; j < all.length; j++) {
      if (used.has(j)) continue;
      const other = all[j]!;
      if (distanceMeters(acc.lat, acc.lon, other.lat, other.lon) <= MATCH_RADIUS_M) {
        used.add(j);
        acc = mergeRecords(acc, other);
        duplicatesCollapsed++;
      }
    }
    merged.push(acc);
  }
  return { merged, stats: { duplicatesCollapsed, matchRadiusMeters: 10 } };
}

function mergeRecords(a: Camera, b: Camera): Camera {
  const aIsAlpr = a.type === 'alpr_government' || a.type === 'alpr_private';
  const bIsAlpr = b.type === 'alpr_government' || b.type === 'alpr_private';
  let primary: Camera;
  let secondary: Camera;
  if (aIsAlpr && bIsAlpr) {
    primary = a.source === 'deflock' ? a : b;
    secondary = primary === a ? b : a;
  } else if (aIsAlpr) {
    primary = a; secondary = b;
  } else if (bIsAlpr) {
    primary = b; secondary = a;
  } else {
    primary = a.source === 'osm' ? a : b;
    secondary = primary === a ? b : a;
  }

  let direction = primary.direction;
  let directionConfidence = primary.directionConfidence;
  if (directionConfidence !== 'known' && secondary.directionConfidence === 'known') {
    direction = secondary.direction;
    directionConfidence = 'known';
  }

  const aSources = a.sources ?? ([a.source] as const);
  const bSources = b.sources ?? ([b.source] as const);
  type SourceEntry = NonNullable<Camera['sources']>[number];
  const sources: readonly SourceEntry[] = Array.from(
    new Set([...aSources, ...bSources]),
  ).sort() as SourceEntry[];

  const out: Camera = {
    id: primary.id,
    type: primary.type,
    lat: primary.lat,
    lon: primary.lon,
    confidence: Math.max(a.confidence, b.confidence),
    source: primary.source,
    ...(direction != null ? { direction } : {}),
    ...(directionConfidence != null ? { directionConfidence } : {}),
    ...(primary.rangeMeters != null ? { rangeMeters: primary.rangeMeters } : {}),
    ...(primary.fovDegrees != null ? { fovDegrees: primary.fovDegrees } : {}),
    sources,
  };
  return out;
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}
