import type { CameraType } from './camera';

export interface CameraGeometry {
  readonly rangeMeters: number;
  readonly fovDegrees: number;
}

export const CAMERA_TYPE_DEFAULTS: Readonly<Record<CameraType, CameraGeometry>> = Object.freeze({
  alpr_government: { rangeMeters: 35, fovDegrees: 30 },
  alpr_private: { rangeMeters: 35, fovDegrees: 30 },
  cctv_municipal: { rangeMeters: 50, fovDegrees: 70 },
  cctv_dot_traffic: { rangeMeters: 80, fovDegrees: 60 },
  speed_camera: { rangeMeters: 30, fovDegrees: 25 },
  red_light_camera: { rangeMeters: 25, fovDegrees: 35 },
});
