const MAX_EDGE_DISTANCE_M = 50;

interface ValhallaLocateEdge {
  heading?: number;
  distance?: number;
}

interface ValhallaLocateResult {
  edges?: ValhallaLocateEdge[];
}

/** Returns the bearing (0-360°) of the road edge nearest to (lat, lon), or null. */
export async function nearestRoadBearing(
  valhallaBaseUrl: string,
  lat: number,
  lon: number,
): Promise<number | null> {
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
    if (!resp.ok) return null;
    const data = (await resp.json()) as ValhallaLocateResult[];
    const edges = data[0]?.edges ?? [];
    const closest = edges
      .filter((e) => typeof e.distance === 'number' && e.distance <= MAX_EDGE_DISTANCE_M)
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))[0];
    if (!closest || typeof closest.heading !== 'number') return null;
    return closest.heading;
  } catch {
    return null;
  }
}
