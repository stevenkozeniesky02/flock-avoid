export function mountErrorBanner(container: HTMLElement, message: string): void {
  const banner = document.createElement('div');
  banner.dataset['errorBanner'] = 'true';
  banner.style.cssText =
    'margin-top:var(--space-3);padding:var(--space-3);' +
    'background:var(--color-state-danger-soft);color:var(--color-state-danger);' +
    'border:1px solid var(--color-state-danger);border-radius:var(--radius-md);' +
    'font-size:var(--font-size-sm);font-family:var(--font-family-sans)';
  banner.textContent = `Routing failed: ${message}`;
  container.appendChild(banner);
}

export function clearErrorBanners(container: HTMLElement): void {
  container.querySelectorAll('[data-error-banner]').forEach((el) => el.remove());
}
