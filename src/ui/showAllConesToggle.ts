export interface ShowAllConesToggleCallbacks {
  readonly onChange: (pressed: boolean) => void;
}

export function mountShowAllConesToggle(
  container: HTMLElement,
  callbacks: ShowAllConesToggleCallbacks,
): { setPressed: (pressed: boolean) => void } {
  let pressed = false;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = 'Show all camera cones';
  btn.setAttribute('aria-pressed', 'false');
  btn.dataset['action'] = 'toggle-all-cones';
  paint(btn, pressed);
  btn.addEventListener('click', () => {
    pressed = !pressed;
    paint(btn, pressed);
    btn.setAttribute('aria-pressed', String(pressed));
    callbacks.onChange(pressed);
  });
  container.appendChild(btn);
  return {
    setPressed: (next: boolean): void => {
      pressed = next;
      paint(btn, pressed);
      btn.setAttribute('aria-pressed', String(pressed));
    },
  };
}

function paint(btn: HTMLButtonElement, pressed: boolean): void {
  const bg = pressed ? 'var(--color-brand-primary)' : 'var(--color-brand-surface)';
  const fg = pressed ? '#fff' : 'var(--color-brand-ink)';
  const border = pressed ? 'var(--color-brand-primary)' : 'var(--color-brand-border)';
  btn.style.cssText =
    `width:36px;height:36px;border-radius:var(--radius-md);background:${bg};` +
    `color:${fg};border:1px solid ${border};cursor:pointer;display:flex;` +
    `align-items:center;justify-content:center;box-shadow:var(--shadow-sm);` +
    'font-family:var(--font-family-sans);font-size:16px;font-weight:700';
  btn.innerHTML = '◢';
}
