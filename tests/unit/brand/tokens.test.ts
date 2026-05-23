import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND_TOKENS } from '../../../src/brand/tokens';

describe('brand tokens v0.2', () => {
  it('exports the v0.2 color palette', () => {
    expect(BRAND_TOKENS.color.ink).toBe('#0a0a0b');
    expect(BRAND_TOKENS.color.surface).toBe('#ffffff');
    expect(BRAND_TOKENS.color['bg-alt']).toBe('#f7f7f5');
    expect(BRAND_TOKENS.color.muted).toBe('#71717a');
    expect(BRAND_TOKENS.color.accent).toBe('#2f54ff');
    expect(BRAND_TOKENS.color['accent-soft']).toBe('#eef1ff');
    expect(BRAND_TOKENS.color.threat).toBe('#dc2626');
    expect(BRAND_TOKENS.color.safe).toBe('#059669');
  });

  it('exports the v0.2 spacing scale', () => {
    expect(BRAND_TOKENS.space['1']).toBe('4px');
    expect(BRAND_TOKENS.space['8']).toBe('48px');
  });

  it('exports the v0.2 radius scale including pill', () => {
    expect(BRAND_TOKENS.radius.pill).toBe('999px');
  });

  it('TS and CSS files agree on every token (light theme)', () => {
    const cssPath = join(__dirname, '../../../src/brand/tokens.css');
    const cssRaw = readFileSync(cssPath, 'utf-8');
    for (const [key, value] of Object.entries(BRAND_TOKENS.color)) {
      expect(cssRaw, `missing --color-${key} in tokens.css`).toContain(`--color-${key}: ${value}`);
    }
    for (const [key, value] of Object.entries(BRAND_TOKENS.space)) {
      expect(cssRaw).toContain(`--space-${key}: ${value}`);
    }
    for (const [key, value] of Object.entries(BRAND_TOKENS.radius)) {
      expect(cssRaw).toContain(`--radius-${key}: ${value}`);
    }
    for (const [key, value] of Object.entries(BRAND_TOKENS.shadow)) {
      expect(cssRaw).toContain(`--shadow-${key}: ${value}`);
    }
    for (const [key, value] of Object.entries(BRAND_TOKENS.fontSize)) {
      expect(cssRaw).toContain(`--font-size-${key}: ${value}`);
    }
  });

  it('CSS declares a dark theme via [data-theme="dark"]', () => {
    const cssPath = join(__dirname, '../../../src/brand/tokens.css');
    const cssRaw = readFileSync(cssPath, 'utf-8');
    expect(cssRaw).toMatch(/\[data-theme="dark"\]\s*\{/);
  });

  it('CSS declares Geist + Geist Mono @font-face blocks (self-hosted)', () => {
    const cssPath = join(__dirname, '../../../src/brand/tokens.css');
    const cssRaw = readFileSync(cssPath, 'utf-8');
    expect(cssRaw).toContain(`font-family: 'Geist'`);
    expect(cssRaw).toContain(`font-family: 'Geist Mono'`);
    expect(cssRaw).toContain(`/fonts/Geist-Regular.woff2`);
    expect(cssRaw).toContain(`/fonts/GeistMono-Regular.woff2`);
  });

  it('CSS does NOT reference Inter (cleaned up from Phase 0b-3a)', () => {
    const cssPath = join(__dirname, '../../../src/brand/tokens.css');
    const cssRaw = readFileSync(cssPath, 'utf-8');
    expect(cssRaw).not.toMatch(/Inter/);
  });
});
