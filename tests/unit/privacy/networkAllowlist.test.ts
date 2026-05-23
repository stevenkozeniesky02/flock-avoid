import { describe, it, expect } from 'vitest';
import { ALLOWED_HOSTS, isAllowedUrl } from '../../../src/privacy/networkAllowlist';

describe('networkAllowlist', () => {
  it('includes localhost Valhalla on port 8002', () => {
    expect(ALLOWED_HOSTS).toContain('localhost:8002');
  });

  it('includes the public OSM tile server we use in v0a', () => {
    expect(ALLOWED_HOSTS.some((h) => h.endsWith('tile.openstreetmap.org'))).toBe(true);
  });

  it('accepts allowed URLs', () => {
    expect(isAllowedUrl('http://localhost:8002/route')).toBe(true);
    expect(isAllowedUrl('https://a.tile.openstreetmap.org/1/2/3.png')).toBe(true);
  });

  it('rejects unknown hosts', () => {
    expect(isAllowedUrl('https://evil.example.com/track')).toBe(false);
    expect(isAllowedUrl('https://google-analytics.com/collect')).toBe(false);
  });

  it('includes the GitHub release CDN hosts', () => {
    expect(ALLOWED_HOSTS).toContain('github.com');
    expect(ALLOWED_HOSTS).toContain('objects.githubusercontent.com');
    expect(ALLOWED_HOSTS).toContain('release-assets.githubusercontent.com');
  });

  it('includes photon.komoot.io for geocoding', () => {
    expect(ALLOWED_HOSTS).toContain('photon.komoot.io');
  });

  it('accepts a Photon search URL', () => {
    expect(isAllowedUrl('https://photon.komoot.io/api?q=krog')).toBe(true);
  });
});
