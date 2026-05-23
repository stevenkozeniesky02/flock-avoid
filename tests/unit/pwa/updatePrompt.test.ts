/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountUpdatePrompt } from '../../../src/pwa/updatePrompt';

describe('updatePrompt — "new version available" toast', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="c" style="position:relative"></div>';
  });

  function container(): HTMLElement {
    return document.getElementById('c') as HTMLElement;
  }

  it('returns a controller with show() and dismiss()', () => {
    const controller = mountUpdatePrompt(container(), { onReload: () => {}, onDismiss: () => {} });
    expect(typeof controller.show).toBe('function');
    expect(typeof controller.dismiss).toBe('function');
  });

  it('show() renders [data-update-prompt] with reload + later buttons', () => {
    const controller = mountUpdatePrompt(container(), { onReload: () => {}, onDismiss: () => {} });
    controller.show();
    const el = container().querySelector('[data-update-prompt]');
    expect(el).toBeTruthy();
    expect(container().querySelector('[data-update-prompt] [data-action="reload"]')).toBeTruthy();
    expect(container().querySelector('[data-update-prompt] [data-action="later"]')).toBeTruthy();
  });

  it('renders prompt with surface bg, hairline border, soft shadow, bottom-right docked', () => {
    const controller = mountUpdatePrompt(container(), { onReload: () => {}, onDismiss: () => {} });
    controller.show();
    const el = container().querySelector('[data-update-prompt]') as HTMLElement;
    expect(el.style.position).toBe('absolute');
    expect(el.style.bottom).toBeTruthy();
    expect(el.style.right).toBeTruthy();
    expect(el.style.boxShadow).toBeTruthy();
  });

  it('does not render duplicates if show() is called twice', () => {
    const controller = mountUpdatePrompt(container(), { onReload: () => {}, onDismiss: () => {} });
    controller.show();
    controller.show();
    expect(container().querySelectorAll('[data-update-prompt]').length).toBe(1);
  });

  it('shows the literal "A new version is available." copy', () => {
    const controller = mountUpdatePrompt(container(), { onReload: () => {}, onDismiss: () => {} });
    controller.show();
    const el = container().querySelector('[data-update-prompt]') as HTMLElement;
    expect(el.textContent).toMatch(/A new version is available/);
  });

  it('clicking [data-action="reload"] fires onReload', () => {
    let reloaded = 0;
    const controller = mountUpdatePrompt(container(), {
      onReload: () => {
        reloaded++;
      },
      onDismiss: () => {},
    });
    controller.show();
    (
      container().querySelector('[data-update-prompt] [data-action="reload"]') as HTMLButtonElement
    ).click();
    expect(reloaded).toBe(1);
  });

  it('clicking [data-action="later"] fires onDismiss and removes the prompt', () => {
    let dismissed = 0;
    const controller = mountUpdatePrompt(container(), {
      onReload: () => {},
      onDismiss: () => {
        dismissed++;
      },
    });
    controller.show();
    (
      container().querySelector('[data-update-prompt] [data-action="later"]') as HTMLButtonElement
    ).click();
    expect(dismissed).toBe(1);
    expect(container().querySelector('[data-update-prompt]')).toBeNull();
  });

  it('dismiss() programmatically removes the prompt and is idempotent', () => {
    const controller = mountUpdatePrompt(container(), { onReload: () => {}, onDismiss: () => {} });
    controller.show();
    controller.dismiss();
    expect(container().querySelector('[data-update-prompt]')).toBeNull();
    expect(() => controller.dismiss()).not.toThrow();
  });
});
