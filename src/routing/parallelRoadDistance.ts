const PARALLEL_ANGLE_TOLERANCE_DEG = 30;
const SAME_ROAD_DISTANCE_M = 12;

interface ValhallaLocateEdge {
  heading?: number;
  distance?: number;
}

interface ValhallaLocateResult {
  edges?: ValhallaLocateEdge[];
}

/** Distance to the nearest road running roughly parallel to `bearing`, or Infinity. */
export async function parallelRoadDistance(
  valhallaBaseUrl: string,
  lat: number,
  lon: number,
  bearing: number,
): Promise<number> {
  try {
    const resp = await fetch(`${valhallaBaseUrl}/locate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locations: [{ lat, lon }],
        costing: 'auto',
        verbose: true,
      }),
    });
    if (!resp.ok) return Infinity;
    const data = (await resp.json()) as ValhallaLocateResult[];
    const edges = data[0]?.edges ?? [];

    let nearest = Infinity;
    for (const edge of edges) {
      if (typeof edge.heading !== 'number' || typeof edge.distance !== 'number') continue;
      if (edge.distance < SAME_ROAD_DISTANCE_M) continue;
      if (!isRoughlyParallel(edge.heading, bearing)) continue;
      if (edge.distance < nearest) nearest = edge.distance;
    }
    return nearest;
  } catch {
    return Infinity;
  }
}

function isRoughlyParallel(a: number, b: number): boolean {
  const diff = Math.abs(((a - b + 540) % 360) - 180);
  const angularDistance = Math.min(diff, 180 - diff);
  return angularDistance <= PARALLEL_ANGLE_TOLERANCE_DEG;
}
