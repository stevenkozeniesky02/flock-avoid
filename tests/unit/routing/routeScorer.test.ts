import { describe, it, expect } from 'vitest';
import { scoreRoute } from '../../../src/routing/routeScorer';
import { CameraStore } from '../../../src/data/cameraStore';
import { COMMUTER_PROFILE, VULNERABLE_PROFILE } from '../../../src/domain/threatProfile';
import type { Camera } from '../../../src/domain/camera';
import type { GeoPoint } from '../../../src/domain/route';

const ALPR_ON_ROUTE: Camera = {
  id: 'on', type: 'alpr_government', lat: 33.7500, lon: -84.3890, confidence: 0.9, source: 'seed',
};
const ALPR_FAR_AWAY: Camera = {
  id: 'far', type: 'alpr_government', lat: 34.0000, lon: -84.0000, confidence: 0.9, source: 'seed',
};
const STRAIGHT_LINE: readonly GeoPoint[] = [
  { lat: 33.7495, lon: -84.3895 },
  { lat: 33.7505, lon: -84.3885 },
];

describe('scoreRoute', () => {
  it('counts a camera within visibility of the polyline as seen', () => {
    const store = new CameraStore([ALPR_ON_ROUTE, ALPR_FAR_AWAY]);
    const result = scoreRoute(STRAIGHT_LINE, store, COMMUTER_PROFILE);
    expect(result.camerasSeen).toBe(1);
  });

  it('surveillance score is higher under Vulnerable than Commuter for same route', () => {
    const store = new CameraStore([ALPR_ON_ROUTE]);
    const commuterScore = scoreRoute(STRAIGHT_LINE, store, COMMUTER_PROFILE).surveillanceScore;
    const vulnerableScore = scoreRoute(STRAIGHT_LINE, store, VULNERABLE_PROFILE).surveillanceScore;
    expect(vulnerableScore).toBeGreaterThan(commuterScore);
  });

  it('an empty polyline scores zero', () => {
    const store = new CameraStore([ALPR_ON_ROUTE]);
    const result = scoreRoute([], store, COMMUTER_PROFILE);
    expect(result.camerasSeen).toBe(0);
    expect(result.surveillanceScore).toBe(0);
  });
});
