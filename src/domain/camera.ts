export const ALL_CAMERA_TYPES = [
  'alpr_government',
  'alpr_private',
  'cctv_municipal',
  'cctv_dot_traffic',
  'speed_camera',
  'red_light_camera',
] as const;

export type CameraType = (typeof ALL_CAMERA_TYPES)[number];

export interface Camera {
  readonly id: string;
  readonly type: CameraType;
  readonly lat: number;
  readonly lon: number;
  readonly confidence: number;
  readonly source: 'seed' | 'deflock' | 'osm' | 'submission' | 'foia';
  readonly direction?: number;
  readonly rangeMeters?: number;
  readonly fovDegrees?: number;
  readonly directionConfidence?: 'known' | 'inferred' | 'unknown';
  readonly sources?: readonly ('deflock' | 'osm' | 'seed' | 'submission' | 'foia')[];
}

export function isCameraType(value: unknown): value is CameraType {
  return typeof value === 'string' && (ALL_CAMERA_TYPES as readonly string[]).includes(value);
}
