import type { ManeuverKind } from '../domain/maneuver';

const OPEN =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
const CLOSE = '</svg>';

function svg(body: string): string {
  return `${OPEN}${body}${CLOSE}`;
}

const STRAIGHT = svg('<path d="M12 20V4"/><path d="m6 10 6-6 6 6"/>');
const ARRIVE = svg('<circle cx="12" cy="10" r="3"/><path d="M12 13v8M9 20l3 1 3-1"/>');
const DEPART = svg('<circle cx="12" cy="5" r="2"/><path d="M12 7v13"/>');
const RIGHT = svg('<path d="M4 18V8a4 4 0 0 1 4-4h10"/><path d="m14 8 4-4-4-4" transform="translate(0 4)"/>');
const LEFT = svg('<path d="M20 18V8a4 4 0 0 0-4-4H6"/><path d="m10 8-4-4 4-4" transform="translate(0 4)"/>');
const SLIGHT_RIGHT = svg('<path d="M7 20V8l9-4"/><path d="m12 4 4 0 0 4"/>');
const SLIGHT_LEFT = svg('<path d="M17 20V8L8 4"/><path d="m12 4-4 0 0 4"/>');
const SHARP_RIGHT = svg('<path d="M6 20V10a2 2 0 0 1 2-2h10"/><path d="m14 4 4 4-4 4"/>');
const SHARP_LEFT = svg('<path d="M18 20V10a2 2 0 0 0-2-2H6"/><path d="m10 4-4 4 4 4"/>');
const UTURN_RIGHT = svg('<path d="M8 20V10a4 4 0 0 1 8 0v10"/><path d="m12 16 4 4 4-4"/>');
const UTURN_LEFT = svg('<path d="M16 20V10a4 4 0 0 0-8 0v10"/><path d="m4 16 4 4 4-4"/>');
const ROUNDABOUT_ENTER = svg('<circle cx="12" cy="12" r="5"/><path d="M12 22v-5"/>');
const ROUNDABOUT_EXIT = svg('<circle cx="12" cy="12" r="5"/><path d="M22 12h-5M12 22v-5"/>');
const MERGE = svg('<path d="M6 22V12a6 6 0 0 1 6-6h6"/><path d="m14 2 4 4-4 4"/>');
const FERRY = svg('<path d="M3 17h18M5 13h14l-2-5H7Z"/><path d="M12 4v4"/>');
const RAMP_RIGHT = svg('<path d="M6 22V8"/><path d="M6 8c6 0 12 4 14 12"/>');
const RAMP_LEFT = svg('<path d="M18 22V8"/><path d="M18 8c-6 0-12 4-14 12"/>');
const EXIT_RIGHT = svg('<path d="M4 22V4"/><path d="M4 12h14m-3-4 4 4-4 4"/>');
const EXIT_LEFT = svg('<path d="M20 22V4"/><path d="M20 12H6m3-4-4 4 4 4"/>');

const KIND_TO_SVG: ReadonlyMap<ManeuverKind, string> = new Map([
  ['depart', DEPART],
  ['arrive', ARRIVE],
  ['continue', STRAIGHT],
  ['becomes', STRAIGHT],
  ['stay-straight', STRAIGHT],
  ['slight-right', SLIGHT_RIGHT],
  ['right', RIGHT],
  ['sharp-right', SHARP_RIGHT],
  ['slight-left', SLIGHT_LEFT],
  ['left', LEFT],
  ['sharp-left', SHARP_LEFT],
  ['uturn-right', UTURN_RIGHT],
  ['uturn-left', UTURN_LEFT],
  ['ramp-straight', STRAIGHT],
  ['ramp-right', RAMP_RIGHT],
  ['ramp-left', RAMP_LEFT],
  ['exit-right', EXIT_RIGHT],
  ['exit-left', EXIT_LEFT],
  ['stay-right', SLIGHT_RIGHT],
  ['stay-left', SLIGHT_LEFT],
  ['merge', MERGE],
  ['roundabout-enter', ROUNDABOUT_ENTER],
  ['roundabout-exit', ROUNDABOUT_EXIT],
  ['ferry-enter', FERRY],
  ['ferry-exit', FERRY],
  ['other', STRAIGHT],
]);

export function maneuverKindToSvg(kind: ManeuverKind): string {
  return KIND_TO_SVG.get(kind) ?? STRAIGHT;
}
