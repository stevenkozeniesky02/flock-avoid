const ROW_HEIGHTS_PX = [40, 56, 56];

export function mountLoadingSkeleton(container: HTMLElement): void {
  clearLoadingSkeleton(container);
  const wrapper = document.createElement('div');
  wrapper.dataset['skeletonWrapper'] = 'true';
  wrapper.style.cssText = 'padding:var(--space-4);display:flex;flex-direction:column;gap:var(--space-3)';
  for (const h of ROW_HEIGHTS_PX) {
    const row = document.createElement('div');
    row.dataset['skeletonRow'] = 'true';
    row.style.cssText =
      `height:${h}px;border-radius:var(--radius-md);` +
      'background:linear-gradient(90deg, var(--color-brand-border) 25%, var(--color-brand-primary-soft) 50%, var(--color-brand-border) 75%);' +
      'background-size:200% 100%;animation:flockavoid-shimmer 1.4s ease-in-out infinite';
    wrapper.appendChild(row);
  }
  container.appendChild(wrapper);
  if (!document.getElementById('flockavoid-shimmer-keyframes')) {
    const style = document.createElement('style');
    style.id = 'flockavoid-shimmer-keyframes';
    style.textContent = '@keyframes flockavoid-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }';
    document.head.appendChild(style);
  }
}

export function clearLoadingSkeleton(container: HTMLElement): void {
  container.querySelectorAll('[data-skeleton-wrapper]').forEach((el) => el.remove());
}
