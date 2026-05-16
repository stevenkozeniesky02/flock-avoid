import { mountFab } from './fab';

export interface ShowAllConesToggleOptions {
  readonly onChange: (pressed: boolean) => void;
}

const TRIANGLE_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 14h16L12 2z"/></svg>';

export function mountShowAllConesToggle(container: HTMLElement, opts: ShowAllConesToggleOptions): void {
  let pressed = false;
  const remount = (): void => {
    container.innerHTML = '';
    mountFab(container, {
      ariaLabel: pressed ? 'Hide camera cones' : 'Show all camera cones',
      icon: TRIANGLE_ICON,
      pressed,
      onClick: () => {
        pressed = !pressed;
        remount();
        opts.onChange(pressed);
      },
    });
  };
  remount();
}
