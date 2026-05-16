/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountFab, mountFabStack } from '../../../src/ui/fab';

describe('fab', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="c"></div>'; });

  it('mountFab renders a square button with aria-label', () => {
    const c = document.getElementById('c')!;
    mountFab(c, { ariaLabel: 'Recenter on me', icon: '<svg/>', onClick: () => {} });
    const btn = c.querySelector('button[data-fab]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute('aria-label')).toBe('Recenter on me');
    expect(btn.innerHTML).toContain('<svg');
  });

  it('mountFab forwards onClick', () => {
    const c = document.getElementById('c')!;
    let clicked = 0;
    mountFab(c, { ariaLabel: 'X', icon: '·', onClick: () => { clicked++; } });
    (c.querySelector('button[data-fab]') as HTMLButtonElement).click();
    expect(clicked).toBe(1);
  });

  it('mountFab respects pressed: true → aria-pressed=true + active class', () => {
    const c = document.getElementById('c')!;
    mountFab(c, { ariaLabel: 'Toggle', icon: '·', onClick: () => {}, pressed: true });
    const btn = c.querySelector('button[data-fab]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(btn.dataset['active']).toBe('true');
  });

  it('mountFabStack creates a positioned container at top:50% right:s-4', () => {
    const c = document.getElementById('c')!;
    const stack = mountFabStack(c);
    expect(stack.tagName).toBe('DIV');
    expect(stack.dataset['fabStack']).toBe('true');
    expect(stack.style.position).toBe('absolute');
    expect(c.contains(stack)).toBe(true);
  });
});
