export type ManeuverKind =
  | 'depart'
  | 'arrive'
  | 'continue'
  | 'becomes'
  | 'stay-straight'
  | 'slight-right'
  | 'right'
  | 'sharp-right'
  | 'slight-left'
  | 'left'
  | 'sharp-left'
  | 'uturn-right'
  | 'uturn-left'
  | 'ramp-straight'
  | 'ramp-right'
  | 'ramp-left'
  | 'exit-right'
  | 'exit-left'
  | 'stay-right'
  | 'stay-left'
  | 'merge'
  | 'roundabout-enter'
  | 'roundabout-exit'
  | 'ferry-enter'
  | 'ferry-exit'
  | 'other';

export interface RouteManeuver {
  readonly kind: ManeuverKind;
  readonly instruction: string;
  readonly streetNames: readonly string[];
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly beginShapeIndex: number;
  readonly endShapeIndex: number;
  readonly rawValhallaType: number;
}
