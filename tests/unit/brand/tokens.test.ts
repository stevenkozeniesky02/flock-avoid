import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND_TOKENS } from '../../../src/brand/tokens';

describe('brand tokens', () => {
  it('TS exports every documented spec token', () => {
    expect(BRAND_TOKENS.color['brand-primary']).toBe('#3a5fff');
    expect(BRAND_TOKENS.color['brand-primary-soft']).toBe('#eef1ff');
    expect(BRAND_TOKENS.color['brand-surface']).toBe('#ffffff');
    expect(BRAND_TOKENS.color['brand-canvas']).toBe('#f7f3ec');
    expect(BRAND_TOKENS.color['brand-ink']).toBe('#0d1a3a');
    expect(BRAND_TOKENS.color['brand-ink-muted']).toBe('#6b7280');
    expect(BRAND_TOKENS.color['brand-border']).toBe('#e5e8f0');
    expect(BRAND_TOKENS.color['state-success']).toBe('#15803d');
    expect(BRAND_TOKENS.color['state-success-soft']).toBe('#ecfdf5');
    expect(BRAND_TOKENS.color['state-danger']).toBe('#b91c1c');
    expect(BRAND_TOKENS.color['state-danger-soft']).toBe('#fef2f2');
    expect(BRAND_TOKENS.color['state-warning']).toBe('#b45309');
    expect(BRAND_TOKENS.color['state-warning-soft']).toBe('#fef3c7');
  });

  it('TS and CSS files agree on every token', () => {
    const cssPath = join(__dirname, '../../../src/brand/tokens.css');
    const cssRaw = readFileSync(cssPath, 'utf-8');
    for (const [key, value] of Object.entries(BRAND_TOKENS.color)) {
      const cssVarName = `--color-${key}`;
      expect(cssRaw, `missing ${cssVarName} in tokens.css`).toContain(`${cssVarName}: ${value}`);
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
});
