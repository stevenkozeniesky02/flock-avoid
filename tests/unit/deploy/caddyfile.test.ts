import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CADDYFILE_PATH = resolve(__dirname, '../../../deploy/Caddyfile');
const SNIPPETS_PATH = resolve(__dirname, '../../../deploy/Caddyfile.snippets');

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

describe('production Caddyfile structure', () => {
  const caddyfile = read(CADDYFILE_PATH);

  it('imports the security_headers snippet', () => {
    expect(caddyfile).toMatch(/import\s+security_headers/);
  });

  it('reads FLOCK_DOMAIN env (with a localhost default for staging)', () => {
    expect(caddyfile).toMatch(/\{\$FLOCK_DOMAIN(:[\w.-]+)?\}/);
  });

  it('reads FLOCK_ACME_EMAIL env for Let\'s Encrypt notifications', () => {
    expect(caddyfile).toMatch(/email\s+\{\$FLOCK_ACME_EMAIL[^}]*\}/);
  });

  it('serves the SPA from /srv/dist with a SPA fallback to /index.html', () => {
    expect(caddyfile).toMatch(/root\s+\*\s+\/srv\/dist/);
    expect(caddyfile).toMatch(/try_files\s+\{path\}\s+\/index\.html/);
    expect(caddyfile).toMatch(/file_server/);
  });

  it('reverse-proxies /valhalla/* to the valhalla service on the docker network', () => {
    expect(caddyfile).toMatch(/handle_path\s+\/valhalla\/\*\s*\{[^}]*reverse_proxy\s+valhalla:8002[^}]*\}/s);
  });

  it('reverse-proxies /photon/* to photon.komoot.io with Host rewrite', () => {
    expect(caddyfile).toMatch(
      /handle_path\s+\/photon\/\*\s*\{[^}]*reverse_proxy\s+https:\/\/photon\.komoot\.io[^}]*\}/s,
    );
    const block = caddyfile.match(/handle_path\s+\/photon\/\*\s*\{([\s\S]*?)\n\s*\}\n/);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/header_up\s+Host\s+photon\.komoot\.io/);
    expect(block![1]).toMatch(/header_up\s+-X-Forwarded-For/);
    expect(block![1]).toMatch(/header_up\s+-X-Real-IP/);
  });

  it('reverse-proxies /dataset/* to github release downloads with the documented rewrite', () => {
    const block = caddyfile.match(/handle_path\s+\/dataset\/\*\s*\{([\s\S]*?)\n\s*\}\n/);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/rewrite\s+\*\s+\/stevenkozeniesky02\/flock-avoid\/releases\/latest\/download\{path\}/);
    expect(block![1]).toMatch(/reverse_proxy\s+https:\/\/github\.com/);
    expect(block![1]).toMatch(/header_up\s+Host\s+github\.com/);
    expect(block![1]).toMatch(/header_up\s+-X-Forwarded-For/);
    expect(block![1]).toMatch(/header_up\s+-X-Real-IP/);
  });

  it('serves /sw.js with no-store cache headers so a stuck SW can never become permanent', () => {
    const swMatcher = caddyfile.match(/@swfile\s+path\s+\/sw\.js/);
    expect(swMatcher).not.toBeNull();
    expect(caddyfile).toMatch(
      /header\s+@swfile\s+Cache-Control\s+"no-cache,\s*no-store,\s*must-revalidate"/,
    );
    expect(caddyfile).toMatch(
      /header\s+@swfile\s+Content-Type\s+"application\/javascript[^"]*"/,
    );
  });

  it('serves /manifest.webmanifest with no-cache and the manifest+json content type', () => {
    expect(caddyfile).toMatch(/@manifest\s+path\s+\/manifest\.webmanifest/);
    expect(caddyfile).toMatch(/header\s+@manifest\s+Cache-Control\s+"no-cache,\s*must-revalidate"/);
    expect(caddyfile).toMatch(/header\s+@manifest\s+Content-Type\s+"application\/manifest\+json"/);
  });

  it('serves /assets/* with immutable long-cache headers (Vite hashed outputs)', () => {
    expect(caddyfile).toMatch(/@assets\s+path\s+\/assets\/\*/);
    expect(caddyfile).toMatch(
      /header\s+@assets\s+Cache-Control\s+"public,\s*max-age=31536000,\s*immutable"/,
    );
  });

  it('strips privacy-sensitive fields from access logs (query, User-Agent, Cookie, Authorization)', () => {
    const logBlock = caddyfile.match(/log\s*\{([\s\S]*?)\n\s*\}\n/);
    expect(logBlock).not.toBeNull();
    expect(logBlock![1]).toMatch(/query\s+delete/);
    expect(logBlock![1]).toMatch(/User-Agent.*delete/);
    expect(logBlock![1]).toMatch(/Cookie.*delete/);
    expect(logBlock![1]).toMatch(/Authorization.*delete/);
  });

  it('does NOT introduce any new browser-facing host (no analytics, CDN, or third-party fetch)', () => {
    const knownUpstreams = ['valhalla', 'photon.komoot.io', 'github.com'];
    const httpRefs = caddyfile.match(/https?:\/\/[a-zA-Z0-9.-]+/g) ?? [];
    for (const ref of httpRefs) {
      const host = ref.replace(/^https?:\/\//, '');
      const isKnown = knownUpstreams.some((k) => host === k);
      const isLocalhost = host === 'localhost' || host === '127.0.0.1';
      expect(isKnown || isLocalhost, `unexpected host in Caddyfile: ${ref}`).toBe(true);
    }
  });
});

describe('Caddyfile.snippets — security_headers snippet', () => {
  const snippets = read(SNIPPETS_PATH);

  it('defines the security_headers snippet', () => {
    expect(snippets).toMatch(/\(security_headers\)\s*\{/);
  });

  it('uses a single header block (consistent with Caddy v2 syntax)', () => {
    // The snippet should wrap its directives in `header { ... }`.
    expect(snippets).toMatch(/header\s*\{[\s\S]*\}/);
  });
});
