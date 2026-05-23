export interface SearchBarCallbacks {
  readonly onActivate: () => void;
  readonly onUseLocation: () => void;
}

const SEARCH_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/></svg>';
const LOC_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M22 12h-3M5 12H2"/></svg>';
const ARROW_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h13M11 6l6 6-6 6"/></svg>';

export function mountSearchBar(container: HTMLElement, cb: SearchBarCallbacks): HTMLElement {
  const bar = document.createElement('div');
  bar.dataset['searchBar'] = 'true';
  bar.style.cssText =
    'position:absolute;top:var(--space-4);left:50%;transform:translateX(-50%);' +
    'width:min(520px, calc(100% - 32px));background:var(--color-surface);' +
    'border-radius:var(--radius-pill);box-shadow:var(--shadow-2);' +
    'display:grid;grid-template-columns:auto minmax(0, 1fr) auto auto auto;' +
    'align-items:center;gap:var(--space-2);' +
    'padding:6px var(--space-2) 6px var(--space-4);' +
    'border:1px solid var(--color-border);z-index:5';

  const icon = document.createElement('span');
  icon.style.cssText = 'color:var(--color-muted);display:inline-flex';
  icon.innerHTML = SEARCH_ICON;

  const input = document.createElement('button');
  input.dataset['searchBarActivate'] = 'true';
  input.type = 'button';
  input.style.cssText =
    'background:transparent;border:0;padding:8px 0;text-align:left;font:inherit;' +
    'font-size:var(--font-size-md);color:var(--color-muted);cursor:pointer';
  input.textContent = 'Search a place, address, or coordinate';
  input.addEventListener('click', () => cb.onActivate());

  const sep = document.createElement('span');
  sep.style.cssText = 'width:1px;height:22px;background:var(--color-border);margin:0 var(--space-1)';

  const locBtn = document.createElement('button');
  locBtn.type = 'button';
  locBtn.dataset['action'] = 'use-location';
  locBtn.setAttribute('aria-label', 'Use my location');
  locBtn.innerHTML = LOC_ICON;
  locBtn.style.cssText = iconBtnCss();
  locBtn.addEventListener('click', () => cb.onUseLocation());

  const primary = document.createElement('button');
  primary.type = 'button';
  primary.dataset['action'] = 'plan';
  primary.setAttribute('aria-label', 'Plan route');
  primary.innerHTML = ARROW_ICON;
  primary.style.cssText = iconBtnCss() + 'background:var(--color-accent);color:#fff';
  primary.addEventListener('click', () => cb.onActivate());

  bar.appendChild(icon);
  bar.appendChild(input);
  bar.appendChild(sep);
  bar.appendChild(locBtn);
  bar.appendChild(primary);
  container.appendChild(bar);
  return bar;
}

function iconBtnCss(): string {
  return (
    'width:36px;height:36px;border-radius:var(--radius-pill);' +
    'display:inline-flex;align-items:center;justify-content:center;' +
    'color:var(--color-ink-2);background:transparent;border:0;cursor:pointer;' +
    'transition:background var(--motion-fast) var(--easing-out);'
  );
}
