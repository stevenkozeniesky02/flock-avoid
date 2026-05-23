import { describe, it, expect } from 'vitest';
import { zoomForType } from '../../../src/geocode/zoomForType';

describe('zoomForType', () => {
  it('returns 6 for state', () => { expect(zoomForType('state')).toBe(6); });
  it('returns 4 for country', () => { expect(zoomForType('country')).toBe(4); });
  it('returns 11 for city', () => { expect(zoomForType('city')).toBe(11); });
  it('returns 15 for street', () => { expect(zoomForType('street')).toBe(15); });
  it('returns 16 for address', () => { expect(zoomForType('address')).toBe(16); });
  it('returns 16 for poi', () => { expect(zoomForType('poi')).toBe(16); });
  it('returns 13 for other (safe default)', () => { expect(zoomForType('other')).toBe(13); });
});
