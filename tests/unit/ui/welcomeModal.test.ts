/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldShowWelcomeModal,
  mountWelcomeModal,
  WELCOME_DISMISSED_KEY,
} from '../../../src/ui/welcomeModal';

describe('welcomeModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    localStorage.clear();
  });

  it('shouldShowWelcomeModal returns true when no flag set', () => {
    expect(shouldShowWelcomeModal()).toBe(true);
  });

  it('shouldShowWelcomeModal returns false when flag set', () => {
    localStorage.setItem(WELCOME_DISMISSED_KEY, 'true');
    expect(shouldShowWelcomeModal()).toBe(false);
  });

  it('mountWelcomeModal renders a modal with a "Get started" button', () => {
    const container = document.getElementById('c')!;
    mountWelcomeModal(container, { onDismiss: () => {} });
    expect(container.querySelector('[data-welcome-modal]')).toBeTruthy();
    expect(container.querySelector('button[data-action="welcome-dismiss"]')).toBeTruthy();
  });

  it('clicking "Get started" calls onDismiss and sets the localStorage flag', () => {
    const container = document.getElementById('c')!;
    let dismissed = false;
    mountWelcomeModal(container, { onDismiss: () => { dismissed = true; } });
    const btn = container.querySelector('button[data-action="welcome-dismiss"]') as HTMLButtonElement;
    btn.click();
    expect(dismissed).toBe(true);
    expect(localStorage.getItem(WELCOME_DISMISSED_KEY)).toBe('true');
  });

  it('modal contains the privacy promise text', () => {
    const container = document.getElementById('c')!;
    mountWelcomeModal(container, { onDismiss: () => {} });
    expect(container.textContent).toMatch(/location/i);
    expect(container.textContent).toMatch(/track/i);
  });
});
