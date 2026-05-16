export interface FabOptions {
  readonly ariaLabel: string;
  /** Inline SVG markup string. */
  readonly icon: string;
  readonly onClick: () => void;
  readonly pressed?: boolean;
}

export function mountFab(container: HTMLElement, opts: FabOptions): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset['fab'] = 'true';
  if (opts.pressed !== undefined) {
    btn.setAttribute('aria-pressed', String(opts.pressed));
    if (opts.pressed) btn.dataset['active'] = 'true';
  }
  btn.setAttribute('aria-label', opts.ariaLabel);
  btn.innerHTML = opts.icon;
  btn.style.cssText =
    'width:40px;height:40px;border-radius:var(--radius-md);' +
    'background:var(--color-surface);box-shadow:var(--shadow-2);' +
    'border:1px solid var(--color-border);color:var(--color-ink-2);' +
    'display:inline-flex;align-items:center;justify-content:center;' +
    'cursor:pointer;transition:background var(--motion-fast) var(--easing-out)';
  if (opts.pressed) {
    btn.style.background = 'var(--color-accent)';
    btn.style.color = '#fff';
    btn.style.borderColor = 'transparent';
  }
  btn.addEventListener('click', opts.onClick);
  container.appendChild(btn);
  return btn;
}

export function mountFabStack(container: HTMLElement): HTMLDivElement {
  const stack = document.createElement('div');
  stack.dataset['fabStack'] = 'true';
  stack.style.cssText =
    'position:absolute;right:var(--space-4);top:50%;transform:translateY(-50%);' +
    'display:flex;flex-direction:column;gap:var(--space-2);z-index:5';
  container.appendChild(stack);
  return stack;
}
