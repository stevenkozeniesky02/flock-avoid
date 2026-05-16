export const WELCOME_DISMISSED_KEY = 'flockavoid.welcomeDismissed.v1';

export interface WelcomeModalCallbacks {
  readonly onDismiss: () => void;
}

export function shouldShowWelcomeModal(): boolean {
  try {
    return localStorage.getItem(WELCOME_DISMISSED_KEY) !== 'true';
  } catch {
    return true;
  }
}

export function mountWelcomeModal(
  container: HTMLElement,
  callbacks: WelcomeModalCallbacks,
): void {
  const backdrop = document.createElement('div');
  backdrop.dataset['welcomeModal'] = 'true';
  backdrop.style.cssText =
    'position:fixed;inset:0;background:rgba(13, 26, 58, 0.6);' +
    'display:flex;align-items:center;justify-content:center;z-index:1000;' +
    'font-family:var(--font-family-sans)';

  const card = document.createElement('div');
  card.style.cssText =
    'background:var(--color-brand-surface);border-radius:var(--radius-xl);' +
    'padding:var(--space-6);max-width:420px;width:calc(100% - var(--space-8));' +
    'box-shadow:var(--shadow-lg)';

  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-4)">
      <div style="width:24px;height:24px;background:var(--color-brand-primary);border-radius:var(--radius-md);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px">F</div>
      <strong style="color:var(--color-brand-ink);font-size:var(--font-size-md)">flockavoid</strong>
    </div>
    <h2 style="margin:0 0 var(--space-3);font-size:var(--font-size-xl);color:var(--color-brand-ink);font-weight:700;line-height:1.2">
      Route around surveillance.
    </h2>
    <p style="margin:0 0 var(--space-4);color:var(--color-brand-ink-muted);font-size:var(--font-size-sm);line-height:1.5">
      A privacy-first map for avoiding ALPR cameras and other watchers.
    </p>
    <div style="background:var(--color-brand-primary-soft);border-radius:var(--radius-md);padding:var(--space-3);margin-bottom:var(--space-4)">
      <div style="font-size:var(--font-size-xs);font-weight:700;color:var(--color-brand-primary);letter-spacing:1px;margin-bottom:var(--space-1)">YOUR LOCATION STAYS LOCAL</div>
      <div style="font-size:var(--font-size-sm);color:var(--color-brand-ink);line-height:1.5">Routes compute on this device. We don't track your trips. Ever.</div>
    </div>
  `;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset['action'] = 'welcome-dismiss';
  btn.textContent = 'Get started';
  btn.style.cssText =
    'display:block;width:100%;padding:var(--space-3);background:var(--color-brand-primary);' +
    'color:#fff;border:0;border-radius:var(--radius-md);cursor:pointer;' +
    'font:inherit;font-size:var(--font-size-base);font-weight:600';
  btn.addEventListener('click', () => {
    try { localStorage.setItem(WELCOME_DISMISSED_KEY, 'true'); } catch { /* ignore */ }
    backdrop.remove();
    callbacks.onDismiss();
  });
  card.appendChild(btn);

  backdrop.appendChild(card);
  container.appendChild(backdrop);
}
