export interface UpdatePromptCallbacks {
  readonly onReload: () => void;
  readonly onDismiss: () => void;
}

export interface UpdatePromptController {
  readonly show: () => void;
  readonly dismiss: () => void;
}

export function mountUpdatePrompt(
  container: HTMLElement,
  cb: UpdatePromptCallbacks,
): UpdatePromptController {
  let el: HTMLElement | null = null;

  const dismiss = (): void => {
    if (el && el.parentElement) el.remove();
    el = null;
  };

  const show = (): void => {
    if (el) return;
    el = document.createElement('div');
    el.dataset['updatePrompt'] = 'true';
    el.style.cssText =
      'position:absolute;bottom:var(--space-4);right:var(--space-4);z-index:6;' +
      'display:inline-flex;align-items:center;gap:var(--space-3);' +
      'padding:var(--space-3) var(--space-4);background:var(--color-surface);' +
      'border:1px solid var(--color-border);border-radius:var(--radius-md);' +
      'box-shadow:var(--shadow-2);font-family:var(--font-family-sans);' +
      'font-size:var(--font-size-sm);color:var(--color-ink)';

    const message = document.createElement('span');
    message.textContent = 'A new version is available.';
    message.style.cssText = 'color:var(--color-ink-2);font-weight:500';

    const actions = document.createElement('span');
    actions.style.cssText = 'display:inline-flex;gap:var(--space-2)';

    const reload = makeButton('Reload', true, () => {
      cb.onReload();
    });
    reload.dataset['action'] = 'reload';

    const later = makeButton('Later', false, () => {
      cb.onDismiss();
      dismiss();
    });
    later.dataset['action'] = 'later';

    actions.appendChild(reload);
    actions.appendChild(later);
    el.appendChild(message);
    el.appendChild(actions);
    container.appendChild(el);
  };

  return { show, dismiss };
}

function makeButton(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.style.cssText =
    'padding:6px 14px;border-radius:var(--radius-pill);border:0;cursor:pointer;font:inherit;' +
    'font-size:var(--font-size-sm);font-weight:500;' +
    (primary
      ? 'background:var(--color-ink);color:var(--color-surface)'
      : 'background:transparent;color:var(--color-ink-2)');
  b.addEventListener('click', onClick);
  return b;
}
