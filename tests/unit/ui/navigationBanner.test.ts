/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NavigationBanner } from '../../../src/ui/navigationBanner';
import type { NavigationView } from '../../../src/nav/navigationSession';

function view(over: Partial<NavigationView> = {}): NavigationView {
  return {
    activeRouteKind: 'private',
    activeManeuverIdx: 0,
    nextManeuverInstruction: 'Turn right onto Krog Street Northeast',
    nextManeuverKind: 'right',
    distanceToNextManeuverMeters: 400,
    distanceOffRouteMeters: 5,
    etaSeconds: 14 * 60,
    isRerouting: false,
    hasArrived: false,
    ...over,
  };
}

describe('NavigationBanner', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="map" style="position:relative"></div>';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mounts one [data-navigation-banner] with role=region and aria-label about navigation', () => {
    const map = document.getElementById('map')!;
    new NavigationBanner(map, { onEnd: vi.fn() });
    const banners = map.querySelectorAll('[data-navigation-banner]');
    expect(banners).toHaveLength(1);
    expect(banners[0]!.getAttribute('role')).toBe('region');
    expect(banners[0]!.getAttribute('aria-label')).toMatch(/navigation/i);
  });

  it('exposes an [aria-live="polite"] region for maneuver text', () => {
    const map = document.getElementById('map')!;
    const b = new NavigationBanner(map, { onEnd: vi.fn() });
    b.update(view());
    const live = map.querySelector('[aria-live="polite"]');
    expect(live).toBeTruthy();
    expect(live!.textContent).toMatch(/Turn right/);
  });

  it('renders the distance and instruction together', () => {
    const map = document.getElementById('map')!;
    const b = new NavigationBanner(map, { onEnd: vi.fn() });
    b.update(view({ distanceToNextManeuverMeters: 400, nextManeuverInstruction: 'Turn left' }));
    const text = map.querySelector('[data-navigation-banner]')!.textContent ?? '';
    expect(text).toMatch(/(ft|mi)/);
    expect(text).toMatch(/Turn left/);
  });

  it('renders an ETA pill with minutes', () => {
    const map = document.getElementById('map')!;
    const b = new NavigationBanner(map, { onEnd: vi.fn() });
    b.update(view({ etaSeconds: 14 * 60 }));
    const eta = map.querySelector('[data-nav-eta]');
    expect(eta).toBeTruthy();
    expect(eta!.textContent).toMatch(/14/);
    expect(eta!.textContent).toMatch(/min/);
  });

  it('shows a re-routing indicator when isRerouting=true and removes it when cleared', () => {
    const map = document.getElementById('map')!;
    const b = new NavigationBanner(map, { onEnd: vi.fn() });
    b.update(view({ isRerouting: true }));
    expect(map.querySelector('[data-rerouting]')).toBeTruthy();
    b.update(view({ isRerouting: false }));
    expect(map.querySelector('[data-rerouting]')).toBeNull();
  });

  it('switches to arrived state', () => {
    const map = document.getElementById('map')!;
    const b = new NavigationBanner(map, { onEnd: vi.fn() });
    b.update(view({ hasArrived: true }));
    const live = map.querySelector('[aria-live="polite"]')!;
    expect(live.textContent).toMatch(/arrived/i);
    const endBtn = map.querySelector('button[data-action="end-navigation"]')!;
    expect(endBtn.textContent).toMatch(/done/i);
  });

  it('the End button calls onEnd once', () => {
    const map = document.getElementById('map')!;
    const onEnd = vi.fn();
    new NavigationBanner(map, { onEnd });
    (map.querySelector('button[data-action="end-navigation"]') as HTMLButtonElement).click();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('Esc keydown calls onEnd', () => {
    const map = document.getElementById('map')!;
    const onEnd = vi.fn();
    new NavigationBanner(map, { onEnd });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('showError mounts the error strip and auto-dismisses after 6 seconds', () => {
    vi.useFakeTimers();
    const map = document.getElementById('map')!;
    const b = new NavigationBanner(map, { onEnd: vi.fn() });
    b.showError('Re-route failed');
    const strip = map.querySelector('[data-banner-error]');
    expect(strip).toBeTruthy();
    expect(strip!.textContent).toMatch(/Re-route failed/);
    vi.advanceTimersByTime(6500);
    expect(map.querySelector('[data-banner-error]')).toBeNull();
  });

  it('destroy removes the DOM node and unbinds Esc', () => {
    const map = document.getElementById('map')!;
    const onEnd = vi.fn();
    const b = new NavigationBanner(map, { onEnd });
    b.destroy();
    expect(map.querySelector('[data-navigation-banner]')).toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onEnd).not.toHaveBeenCalled();
  });
});
