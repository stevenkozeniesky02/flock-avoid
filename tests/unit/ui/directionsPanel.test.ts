/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DirectionsPanel } from '../../../src/ui/directionsPanel';
import type { RouteComparison } from '../../../src/domain/route';
import type { RouteManeuver } from '../../../src/domain/maneuver';

function maneuver(over: Partial<RouteManeuver>): RouteManeuver {
  return {
    kind: 'continue',
    instruction: '',
    streetNames: [],
    distanceMeters: 100,
    durationSeconds: 30,
    beginShapeIndex: 0,
    endShapeIndex: 1,
    rawValhallaType: 8,
    ...over,
  };
}

const fixture: RouteComparison = {
  start: { lat: 0, lon: 0 },
  end: { lat: 1, lon: 1 },
  shortest: {
    polyline: [],
    distanceMeters: 5000,
    durationSeconds: 600,
    camerasOnRoute: 0,
    surveillanceScore: 0,
    maneuvers: [
      maneuver({ kind: 'depart', instruction: 'SHORTEST-A', distanceMeters: 50 }),
      maneuver({ kind: 'right', instruction: 'SHORTEST-B', distanceMeters: 2000 }),
      maneuver({ kind: 'arrive', instruction: 'SHORTEST-ARRIVE', distanceMeters: 0 }),
    ],
  },
  private: {
    polyline: [],
    distanceMeters: 6000,
    durationSeconds: 700,
    camerasOnRoute: 0,
    surveillanceScore: 0,
    maneuvers: [
      maneuver({ kind: 'depart', instruction: 'PRIVATE-A', streetNames: ['Krog St NE'], distanceMeters: 120 }),
      maneuver({ kind: 'left', instruction: 'PRIVATE-B', distanceMeters: 1800 }),
      maneuver({ kind: 'right', instruction: 'PRIVATE-C', distanceMeters: 500 }),
      maneuver({ kind: 'arrive', instruction: 'PRIVATE-ARRIVE', distanceMeters: 0 }),
    ],
  },
  diff: { extraSeconds: 100, extraMeters: 1000, camerasAvoided: 5 },
};

describe('DirectionsPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="map" style="position:relative"></div>';
  });

  it('mounts a single [data-directions-panel] node with region role', () => {
    const map = document.getElementById('map')!;
    new DirectionsPanel(map, {
      comparison: fixture,
      initialSelectedRoute: 'private',
      originLabel: 'Origin',
      destinationLabel: 'Destination',
      onClose: vi.fn(),
    });
    const panels = map.querySelectorAll('[data-directions-panel]');
    expect(panels).toHaveLength(1);
    expect(panels[0]!.getAttribute('role')).toBe('region');
    expect(panels[0]!.getAttribute('aria-label')).toMatch(/direction/i);
  });

  it('initially renders the maneuvers for initialSelectedRoute=private', () => {
    const map = document.getElementById('map')!;
    new DirectionsPanel(map, {
      comparison: fixture,
      initialSelectedRoute: 'private',
      originLabel: 'O', destinationLabel: 'D',
      onClose: vi.fn(),
    });
    const rows = map.querySelectorAll('[data-maneuver-row]');
    expect(rows).toHaveLength(4);
    expect(rows[0]!.textContent).toContain('PRIVATE-A');
    expect(rows[1]!.textContent).toContain('PRIVATE-B');
    expect(rows[3]!.textContent).toContain('PRIVATE-ARRIVE');
  });

  it('header chip shows Private when private is selected', () => {
    const map = document.getElementById('map')!;
    new DirectionsPanel(map, {
      comparison: fixture,
      initialSelectedRoute: 'private',
      originLabel: 'O', destinationLabel: 'D',
      onClose: vi.fn(),
    });
    const chip = map.querySelector('[data-route-kind-chip]');
    expect(chip).toBeTruthy();
    expect(chip!.textContent).toMatch(/private/i);
  });

  it('setRoute("shortest") re-renders the list and updates the chip', () => {
    const map = document.getElementById('map')!;
    const panel = new DirectionsPanel(map, {
      comparison: fixture,
      initialSelectedRoute: 'private',
      originLabel: 'O', destinationLabel: 'D',
      onClose: vi.fn(),
    });

    panel.setRoute('shortest');

    const rows = map.querySelectorAll('[data-maneuver-row]');
    expect(rows).toHaveLength(3);
    expect(rows[0]!.textContent).toContain('SHORTEST-A');
    expect(rows[2]!.textContent).toContain('SHORTEST-ARRIVE');
    expect(map.querySelector('[data-route-kind-chip]')!.textContent).toMatch(/shortest/i);
  });

  it('setRoute with the same kind is idempotent (no row count drift)', () => {
    const map = document.getElementById('map')!;
    const panel = new DirectionsPanel(map, {
      comparison: fixture,
      initialSelectedRoute: 'private',
      originLabel: 'O', destinationLabel: 'D',
      onClose: vi.fn(),
    });
    panel.setRoute('private');
    panel.setRoute('private');
    expect(map.querySelectorAll('[data-maneuver-row]')).toHaveLength(4);
  });

  it('close button fires onClose exactly once', () => {
    const map = document.getElementById('map')!;
    const onClose = vi.fn();
    new DirectionsPanel(map, {
      comparison: fixture,
      initialSelectedRoute: 'private',
      originLabel: 'O', destinationLabel: 'D',
      onClose,
    });
    (map.querySelector('button[data-action="close"]') as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc key fires onClose', () => {
    const map = document.getElementById('map')!;
    const onClose = vi.fn();
    new DirectionsPanel(map, {
      comparison: fixture,
      initialSelectedRoute: 'private',
      originLabel: 'O', destinationLabel: 'D',
      onClose,
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('destroy removes the DOM node and unbinds the Esc handler', () => {
    const map = document.getElementById('map')!;
    const onClose = vi.fn();
    const panel = new DirectionsPanel(map, {
      comparison: fixture,
      initialSelectedRoute: 'private',
      originLabel: 'O', destinationLabel: 'D',
      onClose,
    });

    panel.destroy();
    expect(map.querySelector('[data-directions-panel]')).toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders feet for short maneuvers and miles for long ones', () => {
    const map = document.getElementById('map')!;
    new DirectionsPanel(map, {
      comparison: fixture,
      initialSelectedRoute: 'private',
      originLabel: 'O', destinationLabel: 'D',
      onClose: vi.fn(),
    });
    const rows = map.querySelectorAll('[data-maneuver-row]');
    // PRIVATE-A is 120 m → feet
    expect(rows[0]!.textContent).toMatch(/ft/);
    // PRIVATE-B is 1800 m → miles
    expect(rows[1]!.textContent).toMatch(/mi/);
  });

  it('the arrive row hides the distance-to-next column', () => {
    const map = document.getElementById('map')!;
    new DirectionsPanel(map, {
      comparison: fixture,
      initialSelectedRoute: 'private',
      originLabel: 'O', destinationLabel: 'D',
      onClose: vi.fn(),
    });
    const rows = map.querySelectorAll('[data-maneuver-row]');
    const arriveRow = rows[rows.length - 1]!;
    expect(arriveRow.querySelector('[data-maneuver-distance]')).toBeNull();
  });

  it('maneuver list is an <ol> for ordered semantics', () => {
    const map = document.getElementById('map')!;
    new DirectionsPanel(map, {
      comparison: fixture,
      initialSelectedRoute: 'private',
      originLabel: 'O', destinationLabel: 'D',
      onClose: vi.fn(),
    });
    expect(map.querySelector('ol[data-maneuver-list]')).toBeTruthy();
  });
});
