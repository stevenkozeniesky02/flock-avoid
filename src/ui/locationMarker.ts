import type { LocationStore } from '../location/locationStore';

export interface MapProjector {
  project(lngLat: [number, number]): { x: number; y: number };
  on(event: 'move' | 'zoom', cb: () => void): void;
  off(event: 'move' | 'zoom', cb: () => void): void;
}

export class LocationMarker {
  private el: HTMLElement | null = null;
  private unsub: () => void;
  private currentPos: { lat: number; lon: number } | null = null;
  private readonly onMapMove: () => void;

  constructor(
    private readonly container: HTMLElement,
    private readonly projector: MapProjector,
    store: LocationStore,
  ) {
    this.onMapMove = () => this.reposition();
    projector.on('move', this.onMapMove);
    projector.on('zoom', this.onMapMove);
    this.unsub = store.subscribe((state) => {
      if (state.status === 'tracking') {
        this.currentPos = { lat: state.position.lat, lon: state.position.lon };
        this.ensureEl();
        this.reposition();
      } else {
        this.removeEl();
        this.currentPos = null;
      }
    });
  }

  destroy(): void {
    this.unsub();
    this.projector.off('move', this.onMapMove);
    this.projector.off('zoom', this.onMapMove);
    this.removeEl();
  }

  private ensureEl(): void {
    if (this.el) return;
    const el = document.createElement('div');
    el.dataset['locationMarker'] = 'true';
    el.style.cssText =
      'position:absolute;width:18px;height:18px;transform:translate(-50%, -50%);' +
      'pointer-events:none;z-index:4';
    el.innerHTML = `
      <div style="position:absolute;inset:-42px;border-radius:50%;
        background:radial-gradient(circle, rgba(47, 84, 255, 0.18) 0%, rgba(47, 84, 255, 0) 70%);
        animation:flockavoid-you-pulse 2.4s ease-out infinite"></div>
      <div style="position:absolute;inset:4px;background:var(--color-accent);
        border-radius:50%;box-shadow:0 0 0 3px var(--color-surface), 0 2px 6px rgba(47, 84, 255, 0.4)"></div>`;
    // Inject keyframes once
    if (!document.getElementById('flockavoid-loc-marker-kf')) {
      const style = document.createElement('style');
      style.id = 'flockavoid-loc-marker-kf';
      style.textContent =
        '@keyframes flockavoid-you-pulse {' +
        '  0% { transform: scale(0.5); opacity: 0.9; }' +
        '  100% { transform: scale(1.4); opacity: 0; }' +
        '}';
      document.head.appendChild(style);
    }
    this.container.appendChild(el);
    this.el = el;
  }

  private removeEl(): void {
    if (this.el) { this.el.remove(); this.el = null; }
  }

  private reposition(): void {
    if (!this.el || !this.currentPos) return;
    const { x, y } = this.projector.project([this.currentPos.lon, this.currentPos.lat]);
    this.el.style.left = `${parseFloat(x.toFixed(3))}px`;
    this.el.style.top = `${parseFloat(y.toFixed(3))}px`;
  }
}
