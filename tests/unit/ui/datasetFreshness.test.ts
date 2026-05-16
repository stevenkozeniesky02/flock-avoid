/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderDatasetFreshness } from '../../../src/ui/datasetFreshness';

describe('DatasetFreshness', () => {
  let container: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    container = document.getElementById('c')!;
  });

  it('renders the relative-time string for a recent timestamp', () => {
    const generatedAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    renderDatasetFreshness(container, { generatedAt, onRefresh: () => {} });
    expect(container.textContent).toMatch(/3 hours ago|3h ago|Data: 3/);
  });

  it('shows a refresh button that fires the callback', () => {
    let fired = false;
    renderDatasetFreshness(container, {
      generatedAt: new Date().toISOString(),
      onRefresh: () => { fired = true; },
    });
    const btn = container.querySelector('button[data-action="refresh-dataset"]') as HTMLButtonElement;
    btn.click();
    expect(fired).toBe(true);
  });
});
