import { describe, it, expect } from 'vitest';
import { pickStrategy } from '../../../src/pwa/cacheStrategy';

const APP_ORIGIN = 'https://app.local';

describe('pickStrategy', () => {
  describe('same-origin navigations + assets → app-shell', () => {
    it('routes navigation requests (text/html accept) to app-shell', () => {
      expect(pickStrategy({ url: `${APP_ORIGIN}/`, accept: 'text/html', sameOrigin: true })).toBe(
        'app-shell',
      );
    });

    it('routes the bare root to app-shell when accept lacks text/html', () => {
      expect(pickStrategy({ url: `${APP_ORIGIN}/`, accept: '*/*', sameOrigin: true })).toBe(
        'app-shell',
      );
    });

    it('routes JS module entry to app-shell', () => {
      expect(
        pickStrategy({ url: `${APP_ORIGIN}/src/main.ts`, accept: '*/*', sameOrigin: true }),
      ).toBe('app-shell');
    });

    it('routes hashed JS chunk to app-shell', () => {
      expect(
        pickStrategy({ url: `${APP_ORIGIN}/assets/index-abc.js`, accept: '*/*', sameOrigin: true }),
      ).toBe('app-shell');
    });

    it('routes hashed CSS chunk to app-shell', () => {
      expect(
        pickStrategy({ url: `${APP_ORIGIN}/assets/index-abc.css`, accept: '*/*', sameOrigin: true }),
      ).toBe('app-shell');
    });

    it('routes woff2 fonts to app-shell', () => {
      expect(
        pickStrategy({
          url: `${APP_ORIGIN}/fonts/Geist-Regular.woff2`,
          accept: '*/*',
          sameOrigin: true,
        }),
      ).toBe('app-shell');
    });

    it('routes icons to app-shell', () => {
      expect(
        pickStrategy({
          url: `${APP_ORIGIN}/icons/icon-192.png`,
          accept: '*/*',
          sameOrigin: true,
        }),
      ).toBe('app-shell');
    });

    it('routes the manifest to app-shell', () => {
      expect(
        pickStrategy({
          url: `${APP_ORIGIN}/manifest.webmanifest`,
          accept: '*/*',
          sameOrigin: true,
        }),
      ).toBe('app-shell');
    });
  });

  describe('same-origin dataset routes → dataset / dataset-meta', () => {
    it('routes /data/cameras-atlanta-seed.json to dataset', () => {
      expect(
        pickStrategy({
          url: `${APP_ORIGIN}/data/cameras-atlanta-seed.json`,
          accept: '*/*',
          sameOrigin: true,
        }),
      ).toBe('dataset');
    });

    it('routes /dataset/cameras-us.json to dataset', () => {
      expect(
        pickStrategy({
          url: `${APP_ORIGIN}/dataset/cameras-us.json`,
          accept: '*/*',
          sameOrigin: true,
        }),
      ).toBe('dataset');
    });

    it('routes /dataset/*.meta.json to dataset-meta', () => {
      expect(
        pickStrategy({
          url: `${APP_ORIGIN}/dataset/cameras-us.json.meta.json`,
          accept: '*/*',
          sameOrigin: true,
        }),
      ).toBe('dataset-meta');
    });

    it('routes /data/*.meta.json to dataset-meta', () => {
      expect(
        pickStrategy({
          url: `${APP_ORIGIN}/data/cameras-us.json.meta.json`,
          accept: '*/*',
          sameOrigin: true,
        }),
      ).toBe('dataset-meta');
    });
  });

  describe('OSM tile hosts → tiles', () => {
    it('routes a.tile.openstreetmap.org to tiles', () => {
      expect(
        pickStrategy({
          url: 'https://a.tile.openstreetmap.org/14/8763/5350.png',
          accept: 'image/png',
          sameOrigin: false,
        }),
      ).toBe('tiles');
    });

    it('routes b.tile.openstreetmap.org to tiles', () => {
      expect(
        pickStrategy({
          url: 'https://b.tile.openstreetmap.org/1/2/3.png',
          accept: 'image/png',
          sameOrigin: false,
        }),
      ).toBe('tiles');
    });

    it('routes c.tile.openstreetmap.org to tiles', () => {
      expect(
        pickStrategy({
          url: 'https://c.tile.openstreetmap.org/0/0/0.png',
          accept: 'image/png',
          sameOrigin: false,
        }),
      ).toBe('tiles');
    });
  });

  describe('routing + geocoding → pass-through (privacy)', () => {
    it('routes /valhalla/route to pass-through', () => {
      expect(
        pickStrategy({
          url: `${APP_ORIGIN}/valhalla/route`,
          accept: 'application/json',
          sameOrigin: true,
        }),
      ).toBe('pass-through');
    });

    it('routes /photon/api to pass-through (search queries are user text)', () => {
      expect(
        pickStrategy({
          url: `${APP_ORIGIN}/photon/api?q=Krog%20Street`,
          accept: 'application/json',
          sameOrigin: true,
        }),
      ).toBe('pass-through');
    });
  });

  describe('unknown cross-origin → pass-through (never caches unfamiliar hosts)', () => {
    it('routes an unknown cross-origin host to pass-through', () => {
      expect(
        pickStrategy({
          url: 'https://example.com/foo',
          accept: '*/*',
          sameOrigin: false,
        }),
      ).toBe('pass-through');
    });

    it('routes an unrecognized cross-origin even if path looks like a tile', () => {
      expect(
        pickStrategy({
          url: 'https://evil.example.com/1/2/3.png',
          accept: 'image/png',
          sameOrigin: false,
        }),
      ).toBe('pass-through');
    });
  });
});
