import { type CameraType } from './camera';

export type ProfilePreset = 'commuter' | 'activist' | 'vulnerable' | 'custom';

export interface ThreatProfile {
  readonly preset: ProfilePreset;
  readonly weights: Readonly<Record<CameraType, number>>;
  readonly toleranceMultiplier: number;
  readonly visibilityExpansionMultiplier: number;
}

function freeze(p: ThreatProfile): ThreatProfile {
  Object.freeze(p.weights);
  return Object.freeze(p);
}

export const COMMUTER_PROFILE: ThreatProfile = freeze({
  preset: 'commuter',
  weights: {
    alpr_government: 50,
    alpr_private: 50,
    cctv_municipal: 15,
    cctv_dot_traffic: 5,
    speed_camera: 20,
    red_light_camera: 20,
  },
  toleranceMultiplier: 0.6,
  visibilityExpansionMultiplier: 1.0,
});

export const ACTIVIST_PROFILE: ThreatProfile = freeze({
  preset: 'activist',
  weights: {
    alpr_government: 80,
    alpr_private: 80,
    cctv_municipal: 75,
    cctv_dot_traffic: 30,
    speed_camera: 40,
    red_light_camera: 40,
  },
  toleranceMultiplier: 1.0,
  visibilityExpansionMultiplier: 1.0,
});

export const VULNERABLE_PROFILE: ThreatProfile = freeze({
  preset: 'vulnerable',
  weights: {
    alpr_government: 100,
    alpr_private: 100,
    cctv_municipal: 60,
    cctv_dot_traffic: 30,
    speed_camera: 40,
    red_light_camera: 40,
  },
  toleranceMultiplier: 1.4,
  visibilityExpansionMultiplier: 1.1,
});

export const CUSTOM_PROFILE_DEFAULT: ThreatProfile = freeze({
  preset: 'custom',
  weights: {
    alpr_government: 50,
    alpr_private: 50,
    cctv_municipal: 30,
    cctv_dot_traffic: 15,
    speed_camera: 25,
    red_light_camera: 25,
  },
  toleranceMultiplier: 1.0,
  visibilityExpansionMultiplier: 1.0,
});

export const ALL_PRESETS: readonly ThreatProfile[] = Object.freeze([
  COMMUTER_PROFILE,
  ACTIVIST_PROFILE,
  VULNERABLE_PROFILE,
  CUSTOM_PROFILE_DEFAULT,
]);
