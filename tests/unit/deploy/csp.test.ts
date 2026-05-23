import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SNIPPETS_PATH = resolve(__dirname, '../../../deploy/Caddyfile.snippets');

function readSnippets(): string {
  return readFileSync(SNIPPETS_PATH, 'utf8');
}

function extractCspValue(snippets: string): string {
  const match = snippets.match(/Content-Security-Policy\s+"([^"]+)"/);
  if (!match || !match[1]) {
    throw new Error('Content-Security-Policy header not found in Caddyfile.snippets');
  }
  return match[1];
}

function parseCspDirectives(csp: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of csp.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/\s+/);
    const name = tokens[0];
    if (!name) continue;
    const values = tokens.slice(1);
    directives.set(name, values);
  }
  return directives;
}

describe('production CSP composition', () => {
  const snippets = readSnippets();
  const cspValue = extractCspValue(snippets);
  const directives = parseCspDirectives(cspValue);

  it('declares default-src as self only', () => {
    expect(directives.get('default-src')).toEqual(["'self'"]);
  });

  it('declares script-src as self only — no unsafe-inline, no unsafe-eval', () => {
    const scriptSrc = directives.get('script-src');
    expect(scriptSrc).toEqual(["'self'"]);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it('allows unsafe-inline on style-src only (legacy inline style attributes in index.html)', () => {
    const styleSrc = directives.get('style-src');
    expect(styleSrc).toContain("'self'");
    expect(styleSrc).toContain("'unsafe-inline'");
  });

  it('allows OSM tile hosts in connect-src and only those cross-origin hosts', () => {
    const connectSrc = directives.get('connect-src') ?? [];
    expect(connectSrc).toContain("'self'");
    expect(connectSrc).toContain('https://a.tile.openstreetmap.org');
    expect(connectSrc).toContain('https://b.tile.openstreetmap.org');
    expect(connectSrc).toContain('https://c.tile.openstreetmap.org');
    const externalHosts = connectSrc.filter(
      (v) => v.startsWith('http://') || v.startsWith('https://'),
    );
    for (const host of externalHosts) {
      expect(host).toMatch(/^https:\/\/[abc]\.tile\.openstreetmap\.org$/);
    }
  });

  it('allows OSM tile hosts plus data/blob in img-src and only those cross-origin hosts', () => {
    const imgSrc = directives.get('img-src') ?? [];
    expect(imgSrc).toContain("'self'");
    expect(imgSrc).toContain('data:');
    expect(imgSrc).toContain('blob:');
    expect(imgSrc).toContain('https://a.tile.openstreetmap.org');
    expect(imgSrc).toContain('https://b.tile.openstreetmap.org');
    expect(imgSrc).toContain('https://c.tile.openstreetmap.org');
    const externalHosts = imgSrc.filter(
      (v) => v.startsWith('http://') || v.startsWith('https://'),
    );
    for (const host of externalHosts) {
      expect(host).toMatch(/^https:\/\/[abc]\.tile\.openstreetmap\.org$/);
    }
  });

  it('declares font-src as self only', () => {
    expect(directives.get('font-src')).toEqual(["'self'"]);
  });

  it('allows blob: in worker-src for MapLibre workers', () => {
    const workerSrc = directives.get('worker-src') ?? [];
    expect(workerSrc).toContain("'self'");
    expect(workerSrc).toContain('blob:');
  });

  it('declares manifest-src as self only', () => {
    expect(directives.get('manifest-src')).toEqual(["'self'"]);
  });

  it('declares object-src as none', () => {
    expect(directives.get('object-src')).toEqual(["'none'"]);
  });

  it('declares base-uri as self', () => {
    expect(directives.get('base-uri')).toEqual(["'self'"]);
  });

  it('declares form-action as self', () => {
    expect(directives.get('form-action')).toEqual(["'self'"]);
  });

  it('declares frame-ancestors as none (clickjacking + embed defense)', () => {
    expect(directives.get('frame-ancestors')).toEqual(["'none'"]);
  });

  it('includes upgrade-insecure-requests boolean directive', () => {
    expect(directives.has('upgrade-insecure-requests')).toBe(true);
  });

  it('does not declare report-uri or report-to (no phone-home for CSP violations)', () => {
    expect(directives.has('report-uri')).toBe(false);
    expect(directives.has('report-to')).toBe(false);
  });

  it('does not use wildcard (*) as the only source for any non-boolean directive', () => {
    for (const [name, values] of directives) {
      if (values.length === 0) continue;
      expect(values, `directive ${name} should not be * alone`).not.toEqual(['*']);
    }
  });
});

describe('other security headers', () => {
  const snippets = readSnippets();

  it('sets Strict-Transport-Security with a long max-age and includeSubDomains', () => {
    const match = snippets.match(/Strict-Transport-Security\s+"([^"]+)"/);
    expect(match).not.toBeNull();
    const value = match?.[1] ?? '';
    expect(value).toMatch(/max-age=\d+/);
    const maxAgeMatch = value.match(/max-age=(\d+)/);
    expect(maxAgeMatch).not.toBeNull();
    const maxAge = Number(maxAgeMatch?.[1] ?? '0');
    expect(maxAge).toBeGreaterThanOrEqual(31_536_000);
    expect(value).toContain('includeSubDomains');
  });

  it('sets X-Content-Type-Options to nosniff', () => {
    expect(snippets).toMatch(/X-Content-Type-Options\s+"nosniff"/);
  });

  it('sets Referrer-Policy to no-referrer', () => {
    expect(snippets).toMatch(/Referrer-Policy\s+"no-referrer"/);
  });

  it('sets X-Frame-Options to DENY (legacy companion to frame-ancestors)', () => {
    expect(snippets).toMatch(/X-Frame-Options\s+"DENY"/);
  });

  it('sets a Permissions-Policy that denies sensors + advertising cohorts', () => {
    const match = snippets.match(/Permissions-Policy\s+"([^"]+)"/);
    expect(match).not.toBeNull();
    const value = match?.[1] ?? '';
    for (const feature of [
      'geolocation',
      'camera',
      'microphone',
      'payment',
      'usb',
      'accelerometer',
      'gyroscope',
      'magnetometer',
      'interest-cohort',
      'browsing-topics',
    ]) {
      expect(value, `Permissions-Policy should deny ${feature}`).toMatch(
        new RegExp(`${feature}=\\(\\)`),
      );
    }
  });

  it('sets Cross-Origin-Opener-Policy to same-origin', () => {
    expect(snippets).toMatch(/Cross-Origin-Opener-Policy\s+"same-origin"/);
  });

  it('removes the Server identifier header', () => {
    expect(snippets).toMatch(/-Server/);
  });
});
