import type { ManeuverKind, RouteManeuver } from '../domain/maneuver';

export interface ValhallaManeuverIn {
  readonly type: number;
  readonly instruction: string;
  readonly street_names?: readonly string[];
  readonly length: number;
  readonly time: number;
  readonly begin_shape_index: number;
  readonly end_shape_index: number;
}

export interface ValhallaLeg {
  readonly shape: string;
  readonly maneuvers?: readonly ValhallaManeuverIn[];
}

const VALHALLA_TYPE_TO_KIND: ReadonlyMap<number, ManeuverKind> = new Map([
  [1, 'depart'],
  [2, 'depart'],
  [3, 'depart'],
  [4, 'arrive'],
  [5, 'arrive'],
  [6, 'arrive'],
  [7, 'becomes'],
  [8, 'continue'],
  [9, 'slight-right'],
  [10, 'right'],
  [11, 'sharp-right'],
  [12, 'uturn-right'],
  [13, 'uturn-left'],
  [14, 'sharp-left'],
  [15, 'left'],
  [16, 'slight-left'],
  [17, 'ramp-straight'],
  [18, 'ramp-right'],
  [19, 'ramp-left'],
  [20, 'exit-right'],
  [21, 'exit-left'],
  [22, 'stay-straight'],
  [23, 'stay-right'],
  [24, 'stay-left'],
  [25, 'merge'],
  [26, 'roundabout-enter'],
  [27, 'roundabout-exit'],
  [28, 'ferry-enter'],
  [29, 'ferry-exit'],
]);

export function maneuverKindFromValhallaType(type: number): ManeuverKind {
  return VALHALLA_TYPE_TO_KIND.get(type) ?? 'other';
}

export function parseManeuvers(legs: readonly ValhallaLeg[]): readonly RouteManeuver[] {
  const out: RouteManeuver[] = [];
  for (const leg of legs) {
    const list = leg.maneuvers ?? [];
    for (const m of list) {
      out.push({
        kind: maneuverKindFromValhallaType(m.type),
        instruction: m.instruction,
        streetNames: m.street_names ?? [],
        distanceMeters: Math.round(m.length * 1000),
        durationSeconds: Math.round(m.time),
        beginShapeIndex: m.begin_shape_index,
        endShapeIndex: m.end_shape_index,
        rawValhallaType: m.type,
      });
    }
  }
  return out;
}
