import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(HERE, '..', '..', '..', 'public');
const MANIFEST_PATH = resolve(PUBLIC_DIR, 'manifest.webmanifest');

interface ManifestIcon {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  readonly purpose: string;
}

interface Manifest {
  readonly name: string;
  readonly short_name: string;
  readonly start_url: string;
  readonly scope: string;
  readonly display: string;
  readonly theme_color: string;
  readonly background_color: string;
  readonly icons: readonly ManifestIcon[];
}

function loadManifest(): Manifest {
  const raw = readFileSync(MANIFEST_PATH, 'utf8');
  return JSON.parse(raw) as Manifest;
}

describe('web app manifest', () => {
  it('exists at public/manifest.webmanifest and parses as JSON', () => {
    expect(() => loadManifest()).not.toThrow();
  });

  it('declares the product name and short_name', () => {
    const m = loadManifest();
    expect(m.name).toBe('Flock-Avoid');
    expect(m.short_name).toBe('Flock-Avoid');
  });

  it('uses a clean start_url and scope without tracking parameters', () => {
    const m = loadManifest();
    expect(m.start_url).toBe('/');
    expect(m.scope).toBe('/');
  });

  it('declares display: standalone for an app-like presentation', () => {
    const m = loadManifest();
    expect(m.display).toBe('standalone');
  });

  it('uses the v0.2 ink color for theme_color and white for background_color', () => {
    const m = loadManifest();
    expect(m.theme_color.toLowerCase()).toBe('#0a0a0b');
    expect(m.background_color.toLowerCase()).toBe('#ffffff');
  });

  it('declares at least four icons with src/sizes/type/purpose populated', () => {
    const m = loadManifest();
    expect(m.icons.length).toBeGreaterThanOrEqual(4);
    for (const icon of m.icons) {
      expect(icon.src).toBeTruthy();
      expect(icon.sizes).toBeTruthy();
      expect(icon.type).toBeTruthy();
      expect(icon.purpose).toBeTruthy();
    }
  });

  it('every referenced icon file exists on disk', () => {
    const m = loadManifest();
    for (const icon of m.icons) {
      const path = resolve(PUBLIC_DIR, icon.src.replace(/^\//, ''));
      expect(existsSync(path), `icon file missing: ${icon.src}`).toBe(true);
    }
  });

  it('declares a 192 and 512 PNG icon with purpose "any"', () => {
    const m = loadManifest();
    expect(
      m.icons.some((i) => i.sizes === '192x192' && i.type === 'image/png' && i.purpose === 'any'),
    ).toBe(true);
    expect(
      m.icons.some((i) => i.sizes === '512x512' && i.type === 'image/png' && i.purpose === 'any'),
    ).toBe(true);
  });

  it('declares a 192 and 512 PNG icon with purpose "maskable"', () => {
    const m = loadManifest();
    expect(
      m.icons.some(
        (i) => i.sizes === '192x192' && i.type === 'image/png' && i.purpose === 'maskable',
      ),
    ).toBe(true);
    expect(
      m.icons.some(
        (i) => i.sizes === '512x512' && i.type === 'image/png' && i.purpose === 'maskable',
      ),
    ).toBe(true);
  });

  it('declares an SVG icon as a scalable alternate', () => {
    const m = loadManifest();
    expect(m.icons.some((i) => i.type === 'image/svg+xml')).toBe(true);
  });
});
