import { describe, it, expect } from 'vitest';
import { maneuverKindToSvg } from '../../../src/ui/maneuverIcon';
import type { ManeuverKind } from '../../../src/domain/maneuver';

const ALL_KINDS: readonly ManeuverKind[] = [
  'depart', 'arrive', 'continue', 'becomes', 'stay-straight',
  'slight-right', 'right', 'sharp-right',
  'slight-left', 'left', 'sharp-left',
  'uturn-right', 'uturn-left',
  'ramp-straight', 'ramp-right', 'ramp-left',
  'exit-right', 'exit-left',
  'stay-right', 'stay-left',
  'merge',
  'roundabout-enter', 'roundabout-exit',
  'ferry-enter', 'ferry-exit',
  'other',
];

describe('maneuverKindToSvg', () => {
  it('returns a non-empty SVG for every maneuver kind', () => {
    for (const kind of ALL_KINDS) {
      const svg = maneuverKindToSvg(kind);
      expect(svg, `missing or empty SVG for ${kind}`).toBeTruthy();
      expect(svg.startsWith('<svg'), `not an SVG for ${kind}`).toBe(true);
    }
  });

  it('every SVG uses currentColor so dark theme inherits cleanly', () => {
    for (const kind of ALL_KINDS) {
      expect(maneuverKindToSvg(kind), `${kind} missing currentColor`).toContain('currentColor');
    }
  });
});
