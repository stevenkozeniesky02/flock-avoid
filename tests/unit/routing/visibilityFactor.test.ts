import { describe, it, expect } from 'vitest';
import { visibilityFactor, MAX_VISIBILITY_M } from '../../../src/routing/visibilityFactor';

describe('visibilityFactor (linear falloff)', () => {
  it('is 1 at 0 meters', () => {
    expect(visibilityFactor(0)).toBe(1);
  });

  it('is 0 at and beyond MAX_VISIBILITY_M', () => {
    expect(visibilityFactor(MAX_VISIBILITY_M)).toBe(0);
    expect(visibilityFactor(MAX_VISIBILITY_M + 1)).toBe(0);
  });

  it('is 0.5 at half max', () => {
    expect(visibilityFactor(MAX_VISIBILITY_M / 2)).toBeCloseTo(0.5, 5);
  });

  it('never returns negative or > 1 even for nonsense input', () => {
    expect(visibilityFactor(-5)).toBe(1);
    expect(visibilityFactor(99999)).toBe(0);
  });
});
