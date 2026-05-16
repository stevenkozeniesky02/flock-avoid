export const WELCOME_DISMISSED_KEY = 'flockavoid.welcomeDismissed.v1';

export interface WelcomeModalCallbacks {
  readonly onDismiss: () => void;
}

export function shouldShowWelcomeModal(): boolean {
  try { return localStorage.getItem(WELCOME_DISMISSED_KEY) !== 'true'; }
  catch { return true; }
}

export function mountWelcomeModal(container: HTMLElement, cb: WelcomeModalCallbacks): void {
  const backdrop = document.createElement('div');
  backdrop.dataset['welcomeModal'] = 'true';
  backdrop.style.cssText =
    'position:fixed;inset:0;background:rgba(10, 10, 11, 0.55);' +
    'display:flex;align-items:center;justify-content:center;z-index:1000;' +
    'padding:var(--space-5);font-family:var(--font-family-sans)';

  const card = document.createElement('div');
  card.style.cssText =
    'background:var(--color-surface);border:1px solid var(--color-border);' +
    'border-radius:var(--radius-xl);box-shadow:var(--shadow-3);' +
    'max-width:480px;width:100%;padding:var(--space-8)';
  card.innerHTML = `
    <div style="width:44px;height:44px;background:var(--color-ink);border-radius:var(--radius-md);margin-bottom:var(--space-5);position:relative">
      <div style="position:absolute;inset:11px;background:var(--color-surface);border-radius:4px;box-shadow:0 0 0 1.5px var(--color-ink) inset"></div>
    </div>
    <h1 style="font-size:var(--font-size-2xl);font-weight:600;letter-spacing:-0.025em;line-height:1.05;color:var(--color-ink);margin:0 0 var(--space-3)">Find a route the cameras don't see.</h1>
    <p style="font-size:var(--font-size-md);color:var(--color-muted);line-height:1.55;margin:0 0 var(--space-6)">Flock-Avoid plans driving routes around the surveillance cameras we know about. The map is yours. Your trips are yours.</p>
    <div style="display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-4);background:var(--color-bg-alt);border-radius:var(--radius-md);margin-bottom:var(--space-6)">
      <div style="display:grid;grid-template-columns:20px 1fr;gap:var(--space-3);align-items:start;font-size:var(--font-size-sm);color:var(--color-ink-2);line-height:1.5">
        <span style="width:18px;height:18px;border-radius:50%;background:var(--color-safe-soft);color:var(--color-safe);display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">✓</span>
        <span><strong>Routing runs on your device.</strong> Your trips never leave the browser.</span>
      </div>
      <div style="display:grid;grid-template-columns:20px 1fr;gap:var(--space-3);align-items:start;font-size:var(--font-size-sm);color:var(--color-ink-2);line-height:1.5">
        <span style="width:18px;height:18px;border-radius:50%;background:var(--color-safe-soft);color:var(--color-safe);display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">✓</span>
        <span><strong>No accounts. No analytics. No trackers.</strong> The code is open source.</span>
      </div>
      <div style="display:grid;grid-template-columns:20px 1fr;gap:var(--space-3);align-items:start;font-size:var(--font-size-sm);color:var(--color-ink-2);line-height:1.5">
        <span style="width:18px;height:18px;border-radius:50%;background:var(--color-accent-soft);color:var(--color-accent);display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:11px">i</span>
        <span><strong>Search uses <code style="font-family:var(--font-family-mono);font-size:0.92em;background:var(--color-surface);padding:1px 6px;border-radius:4px;border:1px solid var(--color-border)">photon.komoot.io</code></strong> — only what you type goes there, never your route.</span>
      </div>
    </div>
  `;
  const cta = document.createElement('div');
  cta.style.cssText = 'display:flex;gap:var(--space-3);align-items:center';
  const primary = document.createElement('button');
  primary.type = 'button';
  primary.dataset['action'] = 'welcome-dismiss';
  primary.textContent = 'Get started';
  primary.style.cssText =
    'flex:1;padding:12px 20px;background:var(--color-ink);color:var(--color-surface);' +
    'border:0;border-radius:var(--radius-pill);font:inherit;font-size:var(--font-size-md);' +
    'font-weight:500;cursor:pointer;transition:background var(--motion-fast) var(--easing-out)';
  primary.addEventListener('click', () => {
    try { localStorage.setItem(WELCOME_DISMISSED_KEY, 'true'); } catch { /* ignore */ }
    backdrop.remove();
    cb.onDismiss();
  });
  cta.appendChild(primary);
  card.appendChild(cta);
  backdrop.appendChild(card);
  container.appendChild(backdrop);
}
