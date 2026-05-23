import type { GeoPoint } from '../domain/route';
import type { GeocodeResult } from '../geocode/geocodeTypes';
import type { PhotonClient } from '../geocode/photonClient';
import type { LocationStore } from '../location/locationStore';
import { SearchInput } from './searchInput';

export interface PlannerCardCallbacks {
  readonly photonClient: PhotonClient;
  readonly locationStore: LocationStore;
  readonly onCompare: (start: GeoPoint, end: GeoPoint) => Promise<unknown>;
  readonly onClose: () => void;
}

interface Waypoint {
  lat: number;
  lon: number;
  label: string;
}

export class PlannerCard {
  private origin: Waypoint | null = null;
  private destination: Waypoint | null = null;
  private planBtn!: HTMLButtonElement;
  private useLocBtn!: HTMLButtonElement;
  private originHost!: HTMLElement;
  private destHost!: HTMLElement;
  private originInput!: SearchInput;
  private destInput!: SearchInput;
  private locUnsub: () => void;

  constructor(
    private readonly container: HTMLElement,
    private readonly cb: PlannerCardCallbacks,
  ) {
    this.render();
    this.locUnsub = cb.locationStore.subscribe(() => this.refreshUseLocBtn());
  }

  destroy(): void {
    this.locUnsub();
    this.container.innerHTML = '';
  }

  setOrigin(wp: Waypoint): void {
    this.origin = wp;
    this.syncFieldValues();
    this.refreshPlanBtn();
  }

  setDestination(wp: Waypoint): void {
    this.destination = wp;
    this.syncFieldValues();
    this.refreshPlanBtn();
  }

  private render(): void {
    this.container.innerHTML = '';
    const card = document.createElement('div');
    card.dataset['plannerCard'] = 'true';
    card.style.cssText =
      'position:absolute;top:var(--space-4);left:50%;transform:translateX(-50%);' +
      'width:min(520px, calc(100% - 32px));background:var(--color-surface);' +
      'border-radius:var(--radius-lg);box-shadow:var(--shadow-3);' +
      'border:1px solid var(--color-border);padding:var(--space-4);' +
      'display:flex;flex-direction:column;gap:var(--space-3);z-index:6';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:var(--space-3)';
    const back = document.createElement('button');
    back.type = 'button';
    back.dataset['action'] = 'close';
    back.setAttribute('aria-label', 'Close planner');
    back.textContent = '←';
    back.style.cssText =
      'width:32px;height:32px;border-radius:var(--radius-pill);border:0;' +
      'background:transparent;cursor:pointer;font-size:18px;color:var(--color-ink-2)';
    back.addEventListener('click', () => this.cb.onClose());
    const title = document.createElement('span');
    title.textContent = 'Plan a route';
    title.style.cssText = 'font-weight:600;font-size:var(--font-size-md);color:var(--color-ink)';
    head.appendChild(back);
    head.appendChild(title);
    card.appendChild(head);

    // Origin row
    const oRow = document.createElement('div');
    oRow.dataset['waypoint'] = 'origin';
    oRow.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:var(--space-2);align-items:center';
    const oLabel = document.createElement('label');
    oLabel.textContent = 'Origin';
    oLabel.style.cssText = 'position:absolute;clip:rect(0,0,0,0);pointer-events:none';
    oRow.appendChild(oLabel);
    const oHost = document.createElement('div');
    this.originHost = oHost;
    this.originInput = new SearchInput(oHost, {
      photonClient: this.cb.photonClient,
      placeholder: 'Origin',
      onSelect: (r) => this.setOrigin(geocodeToWaypoint(r)),
    });
    this.useLocBtn = document.createElement('button');
    this.useLocBtn.type = 'button';
    this.useLocBtn.dataset['action'] = 'origin-use-location';
    this.useLocBtn.setAttribute('aria-label', 'Use my location');
    this.useLocBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M22 12h-3M5 12H2"/></svg>';
    this.useLocBtn.style.cssText =
      'width:32px;height:32px;border-radius:var(--radius-pill);border:0;cursor:pointer;' +
      'background:transparent;color:var(--color-ink-2);display:inline-flex;align-items:center;justify-content:center';
    this.useLocBtn.addEventListener('click', () => this.fillOriginFromLocation());
    oRow.appendChild(oHost);
    oRow.appendChild(this.useLocBtn);
    card.appendChild(oRow);

    // Swap row
    const swapRow = document.createElement('div');
    swapRow.style.cssText = 'display:flex;justify-content:flex-end';
    const swap = document.createElement('button');
    swap.type = 'button';
    swap.dataset['action'] = 'swap';
    swap.textContent = '↕ Swap';
    swap.style.cssText =
      'padding:4px 10px;border-radius:var(--radius-pill);border:0;cursor:pointer;' +
      'font-size:var(--font-size-xs);color:var(--color-muted);background:transparent';
    swap.addEventListener('click', () => this.swap());
    swapRow.appendChild(swap);
    card.appendChild(swapRow);

    // Destination row
    const dRow = document.createElement('div');
    dRow.dataset['waypoint'] = 'destination';
    const dLabel = document.createElement('label');
    dLabel.textContent = 'Destination';
    dLabel.style.cssText = 'position:absolute;clip:rect(0,0,0,0);pointer-events:none';
    dRow.appendChild(dLabel);
    const dHost = document.createElement('div');
    this.destHost = dHost;
    this.destInput = new SearchInput(dHost, {
      photonClient: this.cb.photonClient,
      placeholder: 'Where to?',
      onSelect: (r) => this.setDestination(geocodeToWaypoint(r)),
    });
    dRow.appendChild(dHost);
    card.appendChild(dRow);

    // Plan button
    this.planBtn = document.createElement('button');
    this.planBtn.type = 'button';
    this.planBtn.dataset['action'] = 'plan';
    this.planBtn.textContent = 'Plan route →';
    this.planBtn.disabled = true;
    this.planBtn.style.cssText =
      'padding:12px 20px;border-radius:var(--radius-pill);border:0;cursor:pointer;' +
      'background:var(--color-ink);color:var(--color-surface);font:inherit;' +
      'font-size:var(--font-size-md);font-weight:500';
    this.planBtn.addEventListener('click', () => void this.runPlan());
    card.appendChild(this.planBtn);

    this.container.appendChild(card);
    this.refreshPlanBtn();
    this.refreshUseLocBtn();
  }

  private syncFieldValues(): void {
    const fields = this.container.querySelectorAll('[data-waypoint] input') as NodeListOf<HTMLInputElement>;
    if (fields[0] !== undefined) fields[0].value = this.origin?.label ?? '';
    if (fields[1] !== undefined) fields[1].value = this.destination?.label ?? '';
  }

  private refreshPlanBtn(): void {
    this.planBtn.disabled = !(this.origin && this.destination);
    this.planBtn.style.opacity = this.planBtn.disabled ? '0.5' : '1';
  }

  private refreshUseLocBtn(): void {
    const has = this.cb.locationStore.lastPosition() !== null;
    this.useLocBtn.disabled = !has;
    this.useLocBtn.style.opacity = has ? '1' : '0.4';
  }

  private swap(): void {
    const o = this.origin;
    this.origin = this.destination;
    this.destination = o;
    this.syncFieldValues();
    this.refreshPlanBtn();
  }

  private fillOriginFromLocation(): void {
    const pos = this.cb.locationStore.lastPosition();
    if (!pos) return;
    this.setOrigin({ lat: pos.lat, lon: pos.lon, label: `${pos.lat.toFixed(4)}, ${pos.lon.toFixed(4)}` });
  }

  private async runPlan(): Promise<void> {
    if (!this.origin || !this.destination) return;
    await this.cb.onCompare(
      { lat: this.origin.lat, lon: this.origin.lon },
      { lat: this.destination.lat, lon: this.destination.lon },
    );
  }
}

function geocodeToWaypoint(r: GeocodeResult): Waypoint {
  return { lat: r.lat, lon: r.lon, label: r.name };
}
