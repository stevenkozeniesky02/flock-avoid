/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderDatasetFreshness } from '../../../src/ui/datasetFreshness';

describe('datasetFreshness v0.2 chip', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="c" style="position:relative"></div>'; });

  it('renders a floating chip at bottom-left with the dot indicator', () => {
    const c = document.getElementById('c')!;
    renderDatasetFreshness(c, { generatedAt: new Date().toISOString(), onRefresh: () => {} });
    const el = c.querySelector('[data-dataset-freshness]') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.style.position).toBe('absolute');
    expect(el.style.bottom).toBeTruthy();
    expect(el.style.left).toBeTruthy();
    expect(el.style.borderRadius).toBe('var(--radius-pill)');
    expect(c.querySelector('[data-dataset-freshness] [data-freshness-dot]')).toBeTruthy();
  });

  it('renders "Dataset" text and relative time formatting', () => {
    const c = document.getElementById('c')!;
    // 5 minutes ago
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    renderDatasetFreshness(c, { generatedAt: fiveMinAgo, onRefresh: () => {} });
    const el = c.querySelector('[data-dataset-freshness]') as HTMLElement;
    expect(el.textContent).toMatch(/Dataset/);
    expect(el.textContent).toMatch(/5\s*min\s*ago/);
  });

  it('clicking the chip fires onRefresh', () => {
    const c = document.getElementById('c')!;
    let refreshed = 0;
    renderDatasetFreshness(c, { generatedAt: new Date().toISOString(), onRefresh: () => { refreshed++; } });
    (c.querySelector('[data-dataset-freshness]') as HTMLElement).click();
    expect(refreshed).toBe(1);
  });

  it('calling renderDatasetFreshness twice replaces the existing chip (no duplicates)', () => {
    const c = document.getElementById('c')!;
    renderDatasetFreshness(c, { generatedAt: new Date().toISOString(), onRefresh: () => {} });
    renderDatasetFreshness(c, { generatedAt: new Date().toISOString(), onRefresh: () => {} });
    expect(c.querySelectorAll('[data-dataset-freshness]').length).toBe(1);
  });
});
