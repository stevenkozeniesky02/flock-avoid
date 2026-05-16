import { type CameraType } from './camera';

export type DetourTolerance = 'low' | 'medium' | 'high' | 'unlimited';

export type ProfilePreset = 'commuter' | 'vulnerable';

export interface ThreatProfile {
  readonly preset: ProfilePreset;
  readonly weights: Readonly<Record<CameraType, number>>;
  readonly detourTolerance: DetourTolerance;
}

function freezeProfile(p: ThreatProfile): ThreatProfile {
  Object.freeze(p.weights);
  return Object.freeze(p);
}

export const COMMUTER_PROFILE: ThreatProfile = freezeProfile({
  preset: 'commuter',
  weights: {
    alpr_government: 50,
    alpr_private: 50,
    cctv_municipal: 15,
    cctv_dot_traffic: 5,
    speed_camera: 20,
    red_light_camera: 20,
  },
  detourTolerance: 'low',
});

export const VULNERABLE_PROFILE: ThreatProfile = freezeProfile({
  preset: 'vulnerable',
  weights: {
    alpr_government: 100,
    alpr_private: 100,
    cctv_municipal: 60,
    cctv_dot_traffic: 30,
    speed_camera: 40,
    red_light_camera: 40,
  },
  detourTolerance: 'high',
});

export const ALL_PRESETS: readonly ThreatProfile[] = Object.freeze([
  COMMUTER_PROFILE,
  VULNERABLE_PROFILE,
]);
