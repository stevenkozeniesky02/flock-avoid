/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldShowWelcomeModal,
  mountWelcomeModal,
  WELCOME_DISMISSED_KEY,
} from '../../../src/ui/welcomeModal';

describe('welcomeModal v0.2', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    localStorage.clear();
  });

  it('shouldShowWelcomeModal honors the dismissed flag', () => {
    expect(shouldShowWelcomeModal()).toBe(true);
    localStorage.setItem(WELCOME_DISMISSED_KEY, 'true');
    expect(shouldShowWelcomeModal()).toBe(false);
  });

  it('headline contains the v0.2 lede', () => {
    const c = document.getElementById('c')!;
    mountWelcomeModal(c, { onDismiss: () => {} });
    expect(c.textContent).toMatch(/Find a route the cameras don't see/);
  });

  it('discloses the three privacy promises (incl. Photon)', () => {
    const c = document.getElementById('c')!;
    mountWelcomeModal(c, { onDismiss: () => {} });
    expect(c.textContent).toMatch(/Routing runs on your device/);
    expect(c.textContent).toMatch(/No accounts\.\s*No analytics/);
    expect(c.textContent).toMatch(/photon\.komoot\.io/);
  });

  it('Get-started button dismisses and persists the flag', () => {
    const c = document.getElementById('c')!;
    let dismissed = false;
    mountWelcomeModal(c, { onDismiss: () => { dismissed = true; } });
    const btn = c.querySelector('button[data-action="welcome-dismiss"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    expect(dismissed).toBe(true);
    expect(localStorage.getItem(WELCOME_DISMISSED_KEY)).toBe('true');
  });
});
