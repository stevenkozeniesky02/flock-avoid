import type { RouteComparison, RouteResult } from '../domain/route';
import type { RouteManeuver } from '../domain/maneuver';
import { formatDistanceImperial } from './formatDistanceImperial';
import { maneuverKindToSvg } from './maneuverIcon';

export interface DirectionsPanelOptions {
  readonly comparison: RouteComparison;
  readonly initialSelectedRoute: 'shortest' | 'private';
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly onClose: () => void;
}

const METERS_PER_MILE = 1609.344;

export class DirectionsPanel {
  private root!: HTMLElement;
  private chip!: HTMLElement;
  private summaryLine!: HTMLElement;
  private listEl!: HTMLOListElement;
  private selected: 'shortest' | 'private';
  private readonly escHandler: (e: KeyboardEvent) => void;
  private destroyed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly opts: DirectionsPanelOptions,
  ) {
    this.selected = opts.initialSelectedRoute;
    this.escHandler = (e) => {
      if (e.key === 'Escape') opts.onClose();
    };
    document.addEventListener('keydown', this.escHandler);
    this.render();
  }

  setRoute(kind: 'shortest' | 'private'): void {
    if (this.destroyed) return;
    if (this.selected === kind) {
      this.renderList();
      this.renderChip();
      this.renderSummary();
      return;
    }
    this.selected = kind;
    this.renderList();
    this.renderChip();
    this.renderSummary();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    document.removeEventListener('keydown', this.escHandler);
    this.root.remove();
  }

  private render(): void {
    const root = document.createElement('aside');
    root.dataset['directionsPanel'] = 'true';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Driving directions');
    root.style.cssText =
      'position:absolute;left:50%;bottom:var(--space-4);transform:translateX(-50%);' +
      'width:min(560px, calc(100% - 32px));background:var(--color-surface);' +
      'border-radius:var(--radius-lg);box-shadow:var(--shadow-3);' +
      'border:1px solid var(--color-border);padding:var(--space-4);z-index:6;' +
      'display:flex;flex-direction:column;gap:var(--space-3);' +
      'max-height:70vh;overflow:hidden';

    root.appendChild(this.buildHeader());
    this.summaryLine = this.buildSummary();
    root.appendChild(this.summaryLine);

    this.listEl = document.createElement('ol');
    this.listEl.dataset['maneuverList'] = 'true';
    this.listEl.setAttribute('aria-label', 'Turn-by-turn maneuvers');
    this.listEl.style.cssText =
      'list-style:none;margin:0;padding:0;overflow-y:auto;' +
      'border-top:1px solid var(--color-hairline)';
    root.appendChild(this.listEl);

    this.container.appendChild(root);
    this.root = root;
    this.renderList();
    this.renderSummary();
  }

  private buildHeader(): HTMLElement {
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:var(--space-3)';

    const close = document.createElement('button');
    close.type = 'button';
    close.dataset['action'] = 'close';
    close.setAttribute('aria-label', 'Close directions');
    close.textContent = '←';
    close.style.cssText =
      'width:32px;height:32px;border-radius:var(--radius-pill);border:0;' +
      'background:transparent;cursor:pointer;font-size:18px;color:var(--color-ink-2)';
    close.addEventListener('click', () => this.opts.onClose());

    const labels = document.createElement('div');
    labels.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px';
    const od = document.createElement('div');
    od.style.cssText =
      'font-size:var(--font-size-md);font-weight:600;color:var(--color-ink);' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    od.textContent = `${this.opts.originLabel} → ${this.opts.destinationLabel}`;
    labels.appendChild(od);

    this.chip = document.createElement('span');
    this.chip.dataset['routeKindChip'] = 'true';
    this.chip.style.cssText =
      'padding:4px 10px;border-radius:var(--radius-pill);font-size:var(--font-size-xs);' +
      'font-weight:500;border:1px solid var(--color-border)';

    head.appendChild(close);
    head.appendChild(labels);
    head.appendChild(this.chip);
    this.renderChip();
    return head;
  }

  private buildSummary(): HTMLElement {
    const line = document.createElement('div');
    line.dataset['directionsSummary'] = 'true';
    line.style.cssText =
      'display:flex;align-items:baseline;gap:var(--space-3);' +
      'font-size:var(--font-size-sm);color:var(--color-muted);' +
      'padding-bottom:var(--space-2)';
    return line;
  }

  private renderChip(): void {
    const isPrivate = this.selected === 'private';
    this.chip.textContent = isPrivate ? 'Private' : 'Shortest';
    const accent = isPrivate ? 'var(--color-safe)' : 'var(--color-threat)';
    const softBg = isPrivate ? 'var(--color-safe-soft)' : 'var(--color-threat-soft)';
    this.chip.style.color = accent;
    this.chip.style.background = softBg;
    this.chip.style.borderColor = 'transparent';
  }

  private renderSummary(): void {
    const route = this.currentRoute();
    const miles = (route.distanceMeters / METERS_PER_MILE).toFixed(1);
    const minutes = Math.round(route.durationSeconds / 60);
    this.summaryLine.innerHTML = '';
    const left = document.createElement('span');
    left.style.cssText = 'color:var(--color-ink-2);font-weight:500';
    left.textContent = `${miles} mi`;
    const dot = document.createElement('span');
    dot.textContent = '·';
    dot.style.cssText = 'color:var(--color-muted-2)';
    const right = document.createElement('span');
    right.textContent = `${minutes} min`;
    right.style.cssText = 'color:var(--color-ink-2);font-weight:500';
    const stepLabel = document.createElement('span');
    stepLabel.style.cssText = 'margin-left:auto;color:var(--color-muted)';
    stepLabel.textContent = `${route.maneuvers.length} step${route.maneuvers.length === 1 ? '' : 's'}`;
    this.summaryLine.appendChild(left);
    this.summaryLine.appendChild(dot);
    this.summaryLine.appendChild(right);
    this.summaryLine.appendChild(stepLabel);
  }

  private renderList(): void {
    const route = this.currentRoute();
    this.listEl.innerHTML = '';
    route.maneuvers.forEach((m, idx) => {
      const isLast = idx === route.maneuvers.length - 1;
      this.listEl.appendChild(this.buildRow(m, isLast));
    });
  }

  private buildRow(m: RouteManeuver, isLast: boolean): HTMLLIElement {
    const row = document.createElement('li');
    row.dataset['maneuverRow'] = 'true';
    row.style.cssText =
      'display:grid;grid-template-columns:28px minmax(0, 1fr) auto;' +
      'align-items:start;gap:var(--space-3);' +
      'padding:var(--space-3) 0;' +
      'border-bottom:1px solid var(--color-hairline)';

    const icon = document.createElement('span');
    icon.dataset['maneuverIcon'] = 'true';
    icon.style.cssText =
      'display:inline-flex;align-items:center;justify-content:center;' +
      'width:24px;height:24px;color:var(--color-ink-2);' +
      'border-radius:var(--radius-sm);background:var(--color-bg-alt)';
    icon.innerHTML = maneuverKindToSvg(m.kind);

    const body = document.createElement('div');
    body.style.cssText = 'min-width:0;display:flex;flex-direction:column;gap:2px';
    const instr = document.createElement('div');
    instr.style.cssText =
      'font-size:var(--font-size-base);color:var(--color-ink);' +
      'line-height:1.4;font-weight:500';
    instr.textContent = m.instruction;
    body.appendChild(instr);
    if (m.streetNames.length > 0) {
      const street = document.createElement('div');
      street.style.cssText =
        'font-size:var(--font-size-xs);color:var(--color-muted);' +
        'font-family:var(--font-family-mono);letter-spacing:0';
      street.textContent = m.streetNames.join(' / ');
      body.appendChild(street);
    }

    row.appendChild(icon);
    row.appendChild(body);

    if (!isLast) {
      const dist = document.createElement('span');
      dist.dataset['maneuverDistance'] = 'true';
      dist.style.cssText =
        'font-size:var(--font-size-sm);color:var(--color-muted);' +
        'font-family:var(--font-family-mono);white-space:nowrap;' +
        'padding-top:2px';
      dist.textContent = formatDistanceImperial(m.distanceMeters);
      row.appendChild(dist);
    }

    return row;
  }

  private currentRoute(): RouteResult {
    return this.selected === 'private' ? this.opts.comparison.private : this.opts.comparison.shortest;
  }
}
