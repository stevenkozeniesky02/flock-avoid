/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocationMarker, type MapProjector } from '../../../src/ui/locationMarker';
import { LocationStore } from '../../../src/location/locationStore';

function fakeMap(): MapProjector & { fire: (ev: string) => void } {
  const listeners = new Map<string, () => void>();
  return {
    project(lngLat) {
      return { x: lngLat[0] * 10, y: lngLat[1] * 10 };
    },
    on(ev, cb) { listeners.set(ev, cb); },
    off(ev) { listeners.delete(ev); },
    fire(ev) { listeners.get(ev)?.(); },
  };
}

describe('LocationMarker', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="map" style="position:relative"></div>'; });

  it('renders nothing when LocationStore is idle', () => {
    const map = document.getElementById('map')!;
    const store = new LocationStore();
    new LocationMarker(map, fakeMap(), store);
    expect(map.querySelector('[data-location-marker]')).toBeNull();
  });

  it('renders the dot when LocationStore enters tracking', () => {
    const map = document.getElementById('map')!;
    const store = new LocationStore();
    const proj = fakeMap();
    new LocationMarker(map, proj, store);
    // Simulate the store transitioning to tracking without invoking real geolocation
    (store as unknown as { current: unknown }).current = {
      status: 'tracking',
      position: { lat: 33.7501, lon: -84.389, accuracyMeters: 12, timestamp: 1 },
    };
    (store as unknown as { listeners: Set<(s: unknown) => void> }).listeners.forEach((l) => l((store as unknown as { current: unknown }).current));
    const marker = map.querySelector('[data-location-marker]') as HTMLElement;
    expect(marker).toBeTruthy();
    // x = lon * 10 = -843.89, y = lat * 10 = 337.501
    expect(marker.style.left).toBe('-843.89px');
    expect(marker.style.top).toBe('337.501px');
  });

  it('repositions on map move', () => {
    const map = document.getElementById('map')!;
    const store = new LocationStore();
    const proj = fakeMap();
    const spyProject = vi.spyOn(proj, 'project');
    new LocationMarker(map, proj, store);
    (store as unknown as { current: unknown }).current = {
      status: 'tracking',
      position: { lat: 1, lon: 2, accuracyMeters: 5, timestamp: 0 },
    };
    (store as unknown as { listeners: Set<(s: unknown) => void> }).listeners.forEach((l) => l((store as unknown as { current: unknown }).current));
    spyProject.mockClear();
    proj.fire('move');
    expect(spyProject).toHaveBeenCalled();
  });
});
