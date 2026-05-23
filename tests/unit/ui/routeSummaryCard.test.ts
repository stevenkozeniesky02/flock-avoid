/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mountRouteSummaryCard } from '../../../src/ui/routeSummaryCard';

const cmp = {
  shortest: { distanceMeters: 5150, exposure: 47, sensorsAlong: 11 },
  private:  { distanceMeters: 6116, exposure: 8,  sensorsAlong: 2 },
};

describe('routeSummaryCard', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="map" style="position:relative"></div>'; });

  it('renders both tiles when no degradation', () => {
    const map = document.getElementById('map')!;
    mountRouteSummaryCard(map, { comparison: cmp as never, originLabel: 'A', destinationLabel: 'B', profileName: 'Vulnerable', onSelect: () => {}, onStart: () => {}, onDetails: () => {} });
    expect(map.querySelector('[data-route-tile="shortest"]')).toBeTruthy();
    expect(map.querySelector('[data-route-tile="private"]')).toBeTruthy();
  });

  it('renders distance in miles, rounded to 1 decimal', () => {
    const map = document.getElementById('map')!;
    mountRouteSummaryCard(map, { comparison: cmp as never, originLabel: 'A', destinationLabel: 'B', profileName: 'Vulnerable', onSelect: () => {}, onStart: () => {}, onDetails: () => {} });
    const shortest = map.querySelector('[data-route-tile="shortest"]')!;
    expect(shortest.textContent).toMatch(/3\.2\s*mi/i);
    const priv = map.querySelector('[data-route-tile="private"]')!;
    expect(priv.textContent).toMatch(/3\.8\s*mi/i);
  });

  it('private is selected by default; clicking shortest swaps the selection', () => {
    const map = document.getElementById('map')!;
    const picks: string[] = [];
    mountRouteSummaryCard(map, { comparison: cmp as never, originLabel: 'A', destinationLabel: 'B', profileName: 'Vulnerable', onSelect: (k) => picks.push(k), onStart: () => {}, onDetails: () => {} });
    expect(map.querySelector('[data-route-tile="private"]')!.getAttribute('data-selected')).toBe('true');
    (map.querySelector('[data-route-tile="shortest"]') as HTMLButtonElement).click();
    expect(picks).toEqual(['shortest']);
  });

  it('Start button fires onStart', () => {
    const map = document.getElementById('map')!;
    const onStart = vi.fn();
    mountRouteSummaryCard(map, { comparison: cmp as never, originLabel: 'A', destinationLabel: 'B', profileName: 'Vulnerable', onSelect: () => {}, onStart, onDetails: () => {} });
    (map.querySelector('button[data-action="start"]') as HTMLButtonElement).click();
    expect(onStart).toHaveBeenCalled();
  });

  it('reports % less visible computed from exposure', () => {
    const map = document.getElementById('map')!;
    mountRouteSummaryCard(map, { comparison: cmp as never, originLabel: 'A', destinationLabel: 'B', profileName: 'Vulnerable', onSelect: () => {}, onStart: () => {}, onDetails: () => {} });
    // (47 - 8) / 47 = 0.8297 → 83%
    expect(map.textContent).toMatch(/83%/);
  });
});
