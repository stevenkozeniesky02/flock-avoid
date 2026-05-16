import { describe, it, expect } from 'vitest';
import { scoreRoute } from '../../../src/routing/routeScorer';
import { CameraStore } from '../../../src/data/cameraStore';
import { resolveCamera } from '../../../src/data/resolvedCamera';
import {
  COMMUTER_PROFILE, VULNERABLE_PROFILE,
} from '../../../src/domain/threatProfile';
import type { Camera } from '../../../src/domain/camera';
import type { GeoPoint } from '../../../src/domain/route';

const CAM_FACING_NORTH: Camera = {
  id: 'n', type: 'alpr_government', lat: 33.7500, lon: -84.3890,
  confidence: 0.9, source: 'seed',
  direction: 0, rangeMeters: 35, fovDegrees: 30, directionConfidence: 'known',
};

const POINT_NORTH_OF_CAM: GeoPoint = { lat: 33.7503, lon: -84.3890 };  // ~33m N
const POINT_SOUTH_OF_CAM: GeoPoint = { lat: 33.7497, lon: -84.3890 };  // ~33m S

describe('scoreRoute (cone visibility)', () => {
  it('counts a camera when polyline passes through its cone', () => {
    const store = new CameraStore([resolveCamera(CAM_FACING_NORTH)]);
    const score = scoreRoute([POINT_NORTH_OF_CAM], store, COMMUTER_PROFILE);
    expect(score.camerasSeen).toBe(1);
  });

  it('does NOT count a camera facing AWAY from the polyline (south of north-facing cam)', () => {
    const store = new CameraStore([resolveCamera(CAM_FACING_NORTH)]);
    const score = scoreRoute([POINT_SOUTH_OF_CAM], store, COMMUTER_PROFILE);
    expect(score.camerasSeen).toBe(0);
  });

  it('still uses max visibility factor across encounters', () => {
    const store = new CameraStore([resolveCamera(CAM_FACING_NORTH)]);
    const far: GeoPoint = { lat: 33.7502, lon: -84.3890 };  // ~22m N
    const close: GeoPoint = { lat: 33.7501, lon: -84.3890 }; // ~11m N
    const sFar = scoreRoute([far], store, COMMUTER_PROFILE).surveillanceScore;
    const sBoth = scoreRoute([far, close], store, COMMUTER_PROFILE).surveillanceScore;
    expect(sBoth).toBeGreaterThan(sFar);
  });

  it('surveillance score is higher under Vulnerable than Commuter for same in-cone polyline', () => {
    const store = new CameraStore([resolveCamera(CAM_FACING_NORTH)]);
    const sCom = scoreRoute([POINT_NORTH_OF_CAM], store, COMMUTER_PROFILE).surveillanceScore;
    const sVul = scoreRoute([POINT_NORTH_OF_CAM], store, VULNERABLE_PROFILE).surveillanceScore;
    expect(sVul).toBeGreaterThan(sCom);
  });

  it('empty polyline scores zero', () => {
    const store = new CameraStore([resolveCamera(CAM_FACING_NORTH)]);
    const score = scoreRoute([], store, COMMUTER_PROFILE);
    expect(score.camerasSeen).toBe(0);
    expect(score.surveillanceScore).toBe(0);
  });

  it('an unknown-direction camera (fov 360) counts polylines passing in any direction', () => {
    const omni: Camera = {
      ...CAM_FACING_NORTH, id: 'o', direction: 0, fovDegrees: 360, directionConfidence: 'unknown',
    };
    const store = new CameraStore([resolveCamera(omni)]);
    expect(scoreRoute([POINT_SOUTH_OF_CAM], store, COMMUTER_PROFILE).camerasSeen).toBe(1);
  });
});
