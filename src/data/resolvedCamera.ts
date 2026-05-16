import type { Camera } from '../domain/camera';
import { CAMERA_TYPE_DEFAULTS } from '../domain/cameraTypeDefaults';

export interface ResolvedCamera extends Camera {
  readonly effectiveRangeMeters: number;
  readonly effectiveFovDegrees: number;
  readonly effectiveDirection: number;
  readonly directionConfidence: 'known' | 'inferred' | 'unknown';
}

export function resolveCamera(camera: Camera): ResolvedCamera {
  const defaults = CAMERA_TYPE_DEFAULTS[camera.type];
  return {
    ...camera,
    effectiveRangeMeters: camera.rangeMeters ?? defaults.rangeMeters,
    effectiveFovDegrees: camera.fovDegrees ?? defaults.fovDegrees,
    effectiveDirection: camera.direction ?? 0,
    directionConfidence:
      camera.directionConfidence ?? (camera.direction != null ? 'known' : 'unknown'),
  };
}
