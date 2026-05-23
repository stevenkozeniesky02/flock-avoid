/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlannerCard } from '../../../src/ui/plannerCard';
import { LocationStore } from '../../../src/location/locationStore';
import type { GeocodeResult } from '../../../src/geocode/geocodeTypes';

class StubClient {
  async search(): Promise<readonly GeocodeResult[]> { return []; }
}

describe('PlannerCard', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="c"></div>'; });

  it('renders Origin and Destination labels', () => {
    const c = document.getElementById('c')!;
    new PlannerCard(c, {
      photonClient: new StubClient() as never,
      locationStore: new LocationStore(),
      onCompare: vi.fn(),
      onClose: vi.fn(),
    });
    expect(c.textContent).toMatch(/Origin/i);
    expect(c.textContent).toMatch(/Destination/i);
  });

  it('exposes setOrigin/setDestination programmatically (map-tap fallback)', () => {
    const c = document.getElementById('c')!;
    const planner = new PlannerCard(c, {
      photonClient: new StubClient() as never,
      locationStore: new LocationStore(),
      onCompare: vi.fn(),
      onClose: vi.fn(),
    });
    planner.setOrigin({ lat: 1, lon: 2, label: '1.0000, 2.0000' });
    planner.setDestination({ lat: 3, lon: 4, label: '3.0000, 4.0000' });
    const fields = c.querySelectorAll('[data-waypoint] input');
    expect((fields[0] as HTMLInputElement).value).toBe('1.0000, 2.0000');
    expect((fields[1] as HTMLInputElement).value).toBe('3.0000, 4.0000');
  });

  it('plan button is disabled until both waypoints are set', () => {
    const c = document.getElementById('c')!;
    const planner = new PlannerCard(c, {
      photonClient: new StubClient() as never,
      locationStore: new LocationStore(),
      onCompare: vi.fn(),
      onClose: vi.fn(),
    });
    const btn = c.querySelector('button[data-action="plan"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    planner.setOrigin({ lat: 1, lon: 2, label: 'A' });
    expect((c.querySelector('button[data-action="plan"]') as HTMLButtonElement).disabled).toBe(true);
    planner.setDestination({ lat: 3, lon: 4, label: 'B' });
    expect((c.querySelector('button[data-action="plan"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('swap button exchanges origin and destination', () => {
    const c = document.getElementById('c')!;
    const planner = new PlannerCard(c, {
      photonClient: new StubClient() as never,
      locationStore: new LocationStore(),
      onCompare: vi.fn(),
      onClose: vi.fn(),
    });
    planner.setOrigin({ lat: 1, lon: 2, label: 'A' });
    planner.setDestination({ lat: 3, lon: 4, label: 'B' });
    (c.querySelector('button[data-action="swap"]') as HTMLButtonElement).click();
    const fields = c.querySelectorAll('[data-waypoint] input');
    expect((fields[0] as HTMLInputElement).value).toBe('B');
    expect((fields[1] as HTMLInputElement).value).toBe('A');
  });

  it('clicking plan with both waypoints calls onCompare with coords and labels', async () => {
    const c = document.getElementById('c')!;
    const onCompare = vi.fn().mockResolvedValue({ shortest: { polyline: [] }, private: { polyline: [] } });
    const planner = new PlannerCard(c, {
      photonClient: new StubClient() as never,
      locationStore: new LocationStore(),
      onCompare,
      onClose: vi.fn(),
    });
    planner.setOrigin({ lat: 1, lon: 2, label: 'Krog Street Market' });
    planner.setDestination({ lat: 3, lon: 4, label: 'Georgia Aquarium' });
    (c.querySelector('button[data-action="plan"]') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(onCompare).toHaveBeenCalledWith(
      { lat: 1, lon: 2 },
      { lat: 3, lon: 4 },
      { origin: 'Krog Street Market', destination: 'Georgia Aquarium' },
    );
  });

  // Regression for the v0.2 bug where the route summary card title and
  // directions panel header showed raw "lat, lon" instead of the place
  // names the user selected from Photon. The labels must travel with the
  // GeoPoints all the way from the planner's waypoint state.
  it('passes through Photon-selected place names verbatim (no coord fallback)', async () => {
    const c = document.getElementById('c')!;
    const onCompare = vi.fn().mockResolvedValue(undefined);
    const planner = new PlannerCard(c, {
      photonClient: new StubClient() as never,
      locationStore: new LocationStore(),
      onCompare,
      onClose: vi.fn(),
    });
    planner.setOrigin({ lat: 33.7548, lon: -84.3669, label: 'Krog Street Market, Atlanta' });
    planner.setDestination({ lat: 33.7634, lon: -84.3949, label: 'Georgia Aquarium, Atlanta' });
    (c.querySelector('button[data-action="plan"]') as HTMLButtonElement).click();
    await Promise.resolve();
    const labels = onCompare.mock.calls[0]?.[2] as { origin: string; destination: string };
    expect(labels.origin).toBe('Krog Street Market, Atlanta');
    expect(labels.destination).toBe('Georgia Aquarium, Atlanta');
    expect(labels.origin).not.toMatch(/^\d+\.\d+, -?\d+\.\d+$/);
    expect(labels.destination).not.toMatch(/^\d+\.\d+, -?\d+\.\d+$/);
  });

  it('use-location button on origin is disabled until LocationStore has a fix', () => {
    const c = document.getElementById('c')!;
    const store = new LocationStore();
    new PlannerCard(c, {
      photonClient: new StubClient() as never,
      locationStore: store,
      onCompare: vi.fn(),
      onClose: vi.fn(),
    });
    const btn = c.querySelector('button[data-action="origin-use-location"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
