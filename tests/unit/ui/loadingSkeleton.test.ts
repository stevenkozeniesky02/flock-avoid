/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountLoadingSkeleton, clearLoadingSkeleton } from '../../../src/ui/loadingSkeleton';

describe('loadingSkeleton', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    container = document.getElementById('c')!;
  });

  it('mounts three placeholder rows', () => {
    mountLoadingSkeleton(container);
    const rows = container.querySelectorAll('[data-skeleton-row]');
    expect(rows.length).toBe(3);
  });

  it('clears cleanly', () => {
    mountLoadingSkeleton(container);
    clearLoadingSkeleton(container);
    expect(container.querySelectorAll('[data-skeleton-row]')).toHaveLength(0);
  });

  it('replaces previous skeleton if mounted twice', () => {
    mountLoadingSkeleton(container);
    mountLoadingSkeleton(container);
    expect(container.querySelectorAll('[data-skeleton-row]')).toHaveLength(3);
  });
});
