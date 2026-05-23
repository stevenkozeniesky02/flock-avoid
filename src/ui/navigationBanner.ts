import type { NavigationView } from '../nav/navigationSession';
import { formatDistanceImperial } from './formatDistanceImperial';
import { maneuverKindToSvg } from './maneuverIcon';

export interface NavigationBannerOptions {
  readonly onEnd: () => void;
}

const ERROR_AUTO_DISMISS_MS = 6000;

export class NavigationBanner {
  private root: HTMLElement;
  private liveRegion!: HTMLElement;
  private iconEl!: HTMLElement;
  private distanceEl!: HTMLElement;
  private instructionEl!: HTMLElement;
  private etaEl!: HTMLElement;
  private endBtn!: HTMLButtonElement;
  private actionsRow!: HTMLElement;
  private reroutingEl: HTMLElement | null = null;
  private errorEl: HTMLElement | null = null;
  private errorTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly escHandler: (e: KeyboardEvent) => void;
  private destroyed = false;

  constructor(private readonly container: HTMLElement, private readonly opts: NavigationBannerOptions) {
    this.root = this.render();
    this.container.appendChild(this.root);
    this.escHandler = (e) => {
      if (e.key === 'Escape') this.opts.onEnd();
    };
    document.addEventListener('keydown', this.escHandler);
  }

  update(view: NavigationView): void {
    if (this.destroyed) return;
    this.iconEl.innerHTML = maneuverKindToSvg(view.nextManeuverKind);
    if (view.hasArrived) {
      this.distanceEl.textContent = '';
      this.instructionEl.textContent = "You've arrived.";
      this.endBtn.textContent = 'Done';
    } else {
      this.distanceEl.textContent = formatDistanceImperial(view.distanceToNextManeuverMeters);
      this.instructionEl.textContent = view.nextManeuverInstruction;
      this.endBtn.textContent = 'End';
    }
    this.etaEl.textContent = `ETA ${Math.max(0, Math.round(view.etaSeconds / 60))} min`;
    this.updateRerouting(view.isRerouting);
  }

  showError(message: string): void {
    if (this.destroyed) return;
    if (this.errorEl) this.errorEl.remove();
    if (this.errorTimer) clearTimeout(this.errorTimer);
    const strip = document.createElement('div');
    strip.dataset['bannerError'] = 'true';
    strip.setAttribute('role', 'alert');
    strip.style.cssText =
      'margin-top:var(--space-2);padding:var(--space-2) var(--space-3);' +
      'border-radius:var(--radius-md);background:var(--color-threat-soft);' +
      'color:var(--color-threat);font-size:var(--font-size-sm);font-weight:500';
    strip.textContent = message;
    this.root.appendChild(strip);
    this.errorEl = strip;
    this.errorTimer = setTimeout(() => {
      if (this.errorEl) { this.errorEl.remove(); this.errorEl = null; }
      this.errorTimer = null;
    }, ERROR_AUTO_DISMISS_MS);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    document.removeEventListener('keydown', this.escHandler);
    if (this.errorTimer) clearTimeout(this.errorTimer);
    this.root.remove();
  }

  private render(): HTMLElement {
    const root = document.createElement('aside');
    root.dataset['navigationBanner'] = 'true';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Navigation');
    root.style.cssText =
      'position:absolute;left:50%;top:var(--space-4);transform:translateX(-50%);' +
      'width:min(560px, calc(100% - 32px));background:var(--color-surface);' +
      'border-radius:var(--radius-lg);box-shadow:var(--shadow-3);' +
      'border:1px solid var(--color-border);padding:var(--space-4);z-index:7;' +
      'display:flex;flex-direction:column;gap:var(--space-3)';

    const top = document.createElement('div');
    top.style.cssText =
      'display:grid;grid-template-columns:36px minmax(0, 1fr) auto;' +
      'align-items:center;gap:var(--space-3)';

    this.iconEl = document.createElement('span');
    this.iconEl.dataset['navIcon'] = 'true';
    this.iconEl.style.cssText =
      'display:inline-flex;align-items:center;justify-content:center;' +
      'width:36px;height:36px;color:var(--color-ink);' +
      'border-radius:var(--radius-md);background:var(--color-bg-alt)';

    this.liveRegion = document.createElement('div');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');
    this.liveRegion.style.cssText =
      'min-width:0;display:flex;flex-direction:column;gap:2px';

    this.distanceEl = document.createElement('div');
    this.distanceEl.dataset['navDistance'] = 'true';
    this.distanceEl.style.cssText =
      'font-size:var(--font-size-xl);font-weight:600;letter-spacing:-0.02em;color:var(--color-ink)';

    this.instructionEl = document.createElement('div');
    this.instructionEl.dataset['navInstruction'] = 'true';
    this.instructionEl.style.cssText =
      'font-size:var(--font-size-base);font-weight:500;color:var(--color-ink-2);' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

    this.liveRegion.appendChild(this.distanceEl);
    this.liveRegion.appendChild(this.instructionEl);

    this.etaEl = document.createElement('span');
    this.etaEl.dataset['navEta'] = 'true';
    this.etaEl.style.cssText =
      'padding:4px 10px;border-radius:var(--radius-pill);' +
      'background:var(--color-bg-alt);color:var(--color-ink-2);' +
      'font-size:var(--font-size-xs);font-weight:500;white-space:nowrap';
    this.etaEl.textContent = 'ETA — min';

    top.appendChild(this.iconEl);
    top.appendChild(this.liveRegion);
    top.appendChild(this.etaEl);

    const bottom = document.createElement('div');
    bottom.style.cssText =
      'display:flex;align-items:center;justify-content:flex-end;gap:var(--space-2);' +
      'padding-top:var(--space-2);border-top:1px solid var(--color-hairline)';

    this.actionsRow = bottom;

    this.endBtn = document.createElement('button');
    this.endBtn.type = 'button';
    this.endBtn.dataset['action'] = 'end-navigation';
    this.endBtn.textContent = 'End';
    this.endBtn.style.cssText =
      'padding:8px 14px;border-radius:var(--radius-pill);border:0;cursor:pointer;font:inherit;' +
      'font-size:var(--font-size-sm);font-weight:500;' +
      'background:var(--color-ink);color:var(--color-surface)';
    this.endBtn.addEventListener('click', () => this.opts.onEnd());

    bottom.appendChild(this.endBtn);

    root.appendChild(top);
    root.appendChild(bottom);
    return root;
  }

  private updateRerouting(isRerouting: boolean): void {
    if (isRerouting && !this.reroutingEl) {
      const pill = document.createElement('span');
      pill.dataset['rerouting'] = 'true';
      pill.style.cssText =
        'padding:4px 10px;border-radius:var(--radius-pill);' +
        'background:var(--color-accent-soft);color:var(--color-accent);' +
        'font-size:var(--font-size-xs);font-weight:500;white-space:nowrap';
      pill.textContent = 'Re-routing…';
      this.actionsRow.insertBefore(pill, this.endBtn);
      this.reroutingEl = pill;
    } else if (!isRerouting && this.reroutingEl) {
      this.reroutingEl.remove();
      this.reroutingEl = null;
    }
  }
}
