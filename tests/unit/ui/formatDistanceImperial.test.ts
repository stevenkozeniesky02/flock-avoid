import { describe, it, expect } from 'vitest';
import { formatDistanceImperial } from '../../../src/ui/formatDistanceImperial';

describe('formatDistanceImperial', () => {
  it('shows 0 ft for zero meters', () => {
    expect(formatDistanceImperial(0)).toBe('0 ft');
  });

  it('rounds short distances to nearest 10 ft', () => {
    expect(formatDistanceImperial(30)).toBe('100 ft'); // 30m ≈ 98.4ft → 100
    expect(formatDistanceImperial(50)).toBe('160 ft'); // 50m ≈ 164.0ft → 160
    expect(formatDistanceImperial(155)).toBe('510 ft'); // 155m ≈ 508.5ft → 510
  });

  it('switches to miles at the 161 m boundary', () => {
    expect(formatDistanceImperial(161)).toBe('0.1 mi');
  });

  it('shows miles to one decimal for longer distances', () => {
    expect(formatDistanceImperial(1610)).toBe('1.0 mi');
    expect(formatDistanceImperial(8050)).toBe('5.0 mi');
    expect(formatDistanceImperial(2414)).toBe('1.5 mi');
  });
});
