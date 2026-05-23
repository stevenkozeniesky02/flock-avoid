/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountShowAllConesToggle } from '../../../src/ui/showAllConesToggle';

describe('showAllConesToggle as FAB', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="c"></div>'; });

  it('renders as a FAB with aria-pressed starting false', () => {
    const c = document.getElementById('c')!;
    mountShowAllConesToggle(c, { onChange: () => {} });
    const btn = c.querySelector('button[data-fab]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('clicking the FAB toggles aria-pressed and fires onChange', () => {
    const c = document.getElementById('c')!;
    const changes: boolean[] = [];
    mountShowAllConesToggle(c, { onChange: (p) => changes.push(p) });
    let btn = c.querySelector('button[data-fab]') as HTMLButtonElement;
    btn.click();
    btn = c.querySelector('button[data-fab]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(changes).toEqual([true]);

    btn.click();
    btn = c.querySelector('button[data-fab]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(changes).toEqual([true, false]);
  });

  it('has a descriptive aria-label', () => {
    const c = document.getElementById('c')!;
    mountShowAllConesToggle(c, { onChange: () => {} });
    const btn = c.querySelector('button[data-fab]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toMatch(/cones/i);
  });
});
