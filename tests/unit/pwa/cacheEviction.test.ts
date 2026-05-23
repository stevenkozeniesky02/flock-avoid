import { describe, it, expect } from 'vitest';
import { pickEvictionTargets } from '../../../src/pwa/cacheEviction';

describe('pickEvictionTargets', () => {
  it('returns empty for empty input', () => {
    expect(pickEvictionTargets([], 100)).toEqual([]);
  });

  it('returns empty when within bound', () => {
    expect(pickEvictionTargets(['a', 'b', 'c'], 5)).toEqual([]);
  });

  it('returns empty when at bound', () => {
    expect(pickEvictionTargets(['a', 'b', 'c', 'd', 'e'], 5)).toEqual([]);
  });

  it('returns the single oldest when one over bound', () => {
    expect(pickEvictionTargets(['a', 'b', 'c', 'd', 'e', 'f'], 5)).toEqual(['a']);
  });

  it('returns multiple oldest in FIFO order when several over bound', () => {
    expect(pickEvictionTargets(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 5)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('evicts everything when max is zero', () => {
    expect(pickEvictionTargets(['x', 'y'], 0)).toEqual(['x', 'y']);
  });

  it('does not mutate its input', () => {
    const input = Object.freeze(['a', 'b', 'c', 'd']);
    expect(() => pickEvictionTargets(input, 2)).not.toThrow();
    expect(input).toEqual(['a', 'b', 'c', 'd']);
  });
});
