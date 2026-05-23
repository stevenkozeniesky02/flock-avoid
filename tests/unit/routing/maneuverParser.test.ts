import { describe, it, expect } from 'vitest';
import {
  maneuverKindFromValhallaType,
  parseManeuvers,
  type ValhallaLeg,
} from '../../../src/routing/maneuverParser';

describe('maneuverKindFromValhallaType', () => {
  it('maps Valhalla integers to semantic kinds', () => {
    expect(maneuverKindFromValhallaType(1)).toBe('depart');
    expect(maneuverKindFromValhallaType(4)).toBe('arrive');
    expect(maneuverKindFromValhallaType(8)).toBe('continue');
    expect(maneuverKindFromValhallaType(9)).toBe('slight-right');
    expect(maneuverKindFromValhallaType(10)).toBe('right');
    expect(maneuverKindFromValhallaType(11)).toBe('sharp-right');
    expect(maneuverKindFromValhallaType(14)).toBe('sharp-left');
    expect(maneuverKindFromValhallaType(15)).toBe('left');
    expect(maneuverKindFromValhallaType(16)).toBe('slight-left');
    expect(maneuverKindFromValhallaType(26)).toBe('roundabout-enter');
    expect(maneuverKindFromValhallaType(27)).toBe('roundabout-exit');
  });

  it('defaults to "other" for unknown values', () => {
    expect(maneuverKindFromValhallaType(99)).toBe('other');
    expect(maneuverKindFromValhallaType(0)).toBe('other');
    expect(maneuverKindFromValhallaType(-1)).toBe('other');
  });
});

describe('parseManeuvers', () => {
  it('returns [] for empty legs', () => {
    expect(parseManeuvers([])).toEqual([]);
  });

  it('returns [] when a leg has no maneuvers field', () => {
    const legs: ValhallaLeg[] = [{ shape: 'abc' }];
    expect(parseManeuvers(legs)).toEqual([]);
  });

  it('parses a single leg with two maneuvers in order', () => {
    const legs: ValhallaLeg[] = [
      {
        shape: 'abc',
        maneuvers: [
          {
            type: 1,
            instruction: 'Drive east on Krog Street.',
            street_names: ['Krog Street'],
            length: 0.5,
            time: 60,
            begin_shape_index: 0,
            end_shape_index: 4,
          },
          {
            type: 4,
            instruction: 'You have arrived at your destination.',
            length: 0,
            time: 0,
            begin_shape_index: 4,
            end_shape_index: 4,
          },
        ],
      },
    ];

    const out = parseManeuvers(legs);
    expect(out).toHaveLength(2);
    expect(out[0]!.kind).toBe('depart');
    expect(out[0]!.instruction).toBe('Drive east on Krog Street.');
    expect(out[0]!.streetNames).toEqual(['Krog Street']);
    expect(out[0]!.distanceMeters).toBe(500);
    expect(out[0]!.durationSeconds).toBe(60);
    expect(out[0]!.beginShapeIndex).toBe(0);
    expect(out[0]!.endShapeIndex).toBe(4);
    expect(out[0]!.rawValhallaType).toBe(1);

    expect(out[1]!.kind).toBe('arrive');
    expect(out[1]!.distanceMeters).toBe(0);
    expect(out[1]!.streetNames).toEqual([]);
  });

  it('rounds non-integer kilometre values to whole meters', () => {
    const legs: ValhallaLeg[] = [
      {
        shape: 'abc',
        maneuvers: [
          {
            type: 10,
            instruction: 'Turn right.',
            length: 0.1237,
            time: 12,
            begin_shape_index: 0,
            end_shape_index: 1,
          },
        ],
      },
    ];
    expect(parseManeuvers(legs)[0]!.distanceMeters).toBe(124);
  });

  it('concatenates maneuvers across multiple legs in order', () => {
    const legs: ValhallaLeg[] = [
      {
        shape: 'leg1',
        maneuvers: [
          { type: 1, instruction: 'A', length: 0.1, time: 10, begin_shape_index: 0, end_shape_index: 1 },
          { type: 10, instruction: 'B', length: 0.2, time: 20, begin_shape_index: 1, end_shape_index: 2 },
        ],
      },
      {
        shape: 'leg2',
        maneuvers: [
          { type: 15, instruction: 'C', length: 0.3, time: 30, begin_shape_index: 0, end_shape_index: 1 },
          { type: 4, instruction: 'D', length: 0, time: 0, begin_shape_index: 1, end_shape_index: 1 },
        ],
      },
    ];
    const out = parseManeuvers(legs);
    expect(out.map((m) => m.instruction)).toEqual(['A', 'B', 'C', 'D']);
    expect(out.map((m) => m.kind)).toEqual(['depart', 'right', 'left', 'arrive']);
  });

  it('treats missing street_names as []', () => {
    const legs: ValhallaLeg[] = [
      {
        shape: 'abc',
        maneuvers: [
          { type: 8, instruction: 'Continue.', length: 0.4, time: 30, begin_shape_index: 0, end_shape_index: 3 },
        ],
      },
    ];
    expect(parseManeuvers(legs)[0]!.streetNames).toEqual([]);
  });

  it('preserves the raw Valhalla type integer', () => {
    const legs: ValhallaLeg[] = [
      {
        shape: 'abc',
        maneuvers: [
          { type: 26, instruction: 'Enter roundabout.', length: 0.05, time: 5, begin_shape_index: 0, end_shape_index: 1 },
        ],
      },
    ];
    expect(parseManeuvers(legs)[0]!.rawValhallaType).toBe(26);
  });
});
