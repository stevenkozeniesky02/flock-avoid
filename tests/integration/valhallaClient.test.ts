import { describe, it, expect, beforeAll } from 'vitest';
import { ValhallaClient } from '../../src/routing/valhallaClient';

const VALHALLA_URL = process.env.VALHALLA_URL ?? 'http://localhost:8002';
let valhallaReady = false;

beforeAll(async () => {
  try {
    const resp = await fetch(`${VALHALLA_URL}/status`, { signal: AbortSignal.timeout(2000) });
    valhallaReady = resp.ok;
  } catch {
    valhallaReady = false;
  }
  if (!valhallaReady) {
    console.warn(
      `[skip] Valhalla not reachable at ${VALHALLA_URL} — ValhallaClient integration tests will be skipped. Start Valhalla and re-run.`,
    );
  }
});

describe('ValhallaClient (integration — requires local Valhalla)', () => {
  const client = new ValhallaClient(VALHALLA_URL);

  it('returns a route between two Atlanta points', async () => {
    if (!valhallaReady) return;
    const result = await client.route(
      { lat: 33.7490, lon: -84.3880 },
      { lat: 33.7700, lon: -84.3600 },
      [],
    );
    expect(result.polyline.length).toBeGreaterThan(2);
    expect(result.distanceMeters).toBeGreaterThan(1000);
    expect(result.durationSeconds).toBeGreaterThan(60);
  }, 15_000);

  it('accepts exclude_polygons and still returns a route', async () => {
    if (!valhallaReady) return;
    const box: [number, number][] = [
      [-84.3895, 33.7495],
      [-84.3885, 33.7495],
      [-84.3885, 33.7505],
      [-84.3895, 33.7505],
      [-84.3895, 33.7495],
    ];
    const result = await client.route(
      { lat: 33.7490, lon: -84.3880 },
      { lat: 33.7700, lon: -84.3600 },
      [box],
    );
    expect(result.polyline.length).toBeGreaterThan(2);
  }, 15_000);

  it('returns maneuvers with depart/arrive bookends', async () => {
    if (!valhallaReady) return;
    const result = await client.route(
      { lat: 33.7490, lon: -84.3880 },
      { lat: 33.7700, lon: -84.3600 },
      [],
    );
    expect(result.maneuvers.length).toBeGreaterThan(1);
    expect(result.maneuvers[0]!.kind).toBe('depart');
    expect(result.maneuvers[result.maneuvers.length - 1]!.kind).toBe('arrive');
    expect(result.maneuvers[0]!.rawValhallaType).toBeGreaterThan(0);
  }, 15_000);
});
