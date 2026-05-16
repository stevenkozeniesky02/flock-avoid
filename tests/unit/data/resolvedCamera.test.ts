import { describe, it, expect } from 'vitest';
import { resolveCamera } from '../../../src/data/resolvedCamera';
import { CAMERA_TYPE_DEFAULTS } from '../../../src/domain/cameraTypeDefaults';
import type { Camera } from '../../../src/domain/camera';

const ALPR_KNOWN: Camera = {
  id: 'k', type: 'alpr_government', lat: 33.75, lon: -84.39,
  confidence: 0.9, source: 'seed',
  direction: 90, rangeMeters: 40, fovDegrees: 28, directionConfidence: 'known',
};

const ALPR_BARE: Camera = {
  id: 'b', type: 'alpr_government', lat: 33.75, lon: -84.39,
  confidence: 0.9, source: 'seed',
};

describe('resolveCamera', () => {
  it('preserves provided direction/range/fov when present', () => {
    const r = resolveCamera(ALPR_KNOWN);
    expect(r.effectiveDirection).toBe(90);
    expect(r.effectiveRangeMeters).toBe(40);
    expect(r.effectiveFovDegrees).toBe(28);
    expect(r.directionConfidence).toBe('known');
  });

  it('fills missing range + fov from per-type defaults', () => {
    const r = resolveCamera(ALPR_BARE);
    expect(r.effectiveRangeMeters).toBe(CAMERA_TYPE_DEFAULTS.alpr_government.rangeMeters);
    expect(r.effectiveFovDegrees).toBe(CAMERA_TYPE_DEFAULTS.alpr_government.fovDegrees);
  });

  it("marks confidence as 'unknown' when direction is absent", () => {
    const r = resolveCamera(ALPR_BARE);
    expect(r.directionConfidence).toBe('unknown');
    expect(r.effectiveDirection).toBe(0);
  });

  it('preserves all the original Camera fields', () => {
    const r = resolveCamera(ALPR_KNOWN);
    expect(r.id).toBe(ALPR_KNOWN.id);
    expect(r.type).toBe(ALPR_KNOWN.type);
    expect(r.lat).toBe(ALPR_KNOWN.lat);
    expect(r.lon).toBe(ALPR_KNOWN.lon);
    expect(r.confidence).toBe(ALPR_KNOWN.confidence);
    expect(r.source).toBe(ALPR_KNOWN.source);
  });
});
