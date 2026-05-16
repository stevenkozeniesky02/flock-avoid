/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountErrorBanner, clearErrorBanners } from '../../../src/ui/errorBanner';

describe('errorBanner', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    container = document.getElementById('c')!;
  });

  it('mountErrorBanner appends an element with the given message', () => {
    mountErrorBanner(container, 'Something went wrong');
    const banner = container.querySelector('[data-error-banner]') as HTMLElement;
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain('Something went wrong');
  });

  it('clearErrorBanners removes all banners in the container', () => {
    mountErrorBanner(container, 'First error');
    mountErrorBanner(container, 'Second error');
    expect(container.querySelectorAll('[data-error-banner]')).toHaveLength(2);
    clearErrorBanners(container);
    expect(container.querySelectorAll('[data-error-banner]')).toHaveLength(0);
  });

  it('mountErrorBanner does NOT clear existing banners — it appends', () => {
    mountErrorBanner(container, 'First');
    mountErrorBanner(container, 'Second');
    expect(container.querySelectorAll('[data-error-banner]')).toHaveLength(2);
  });
});
