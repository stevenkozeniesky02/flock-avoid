/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { mountSearchBar } from '../../../src/ui/searchBar';

describe('searchBar', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="map" style="position:relative"></div>'; });

  it('renders a pill anchored top-center of the map container', () => {
    const map = document.getElementById('map')!;
    mountSearchBar(map, { onActivate: () => {}, onUseLocation: () => {} });
    const bar = map.querySelector('[data-search-bar]') as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.style.position).toBe('absolute');
    expect(bar.style.top).toBeTruthy();
  });

  it('tapping the bar or its input fires onActivate', () => {
    const map = document.getElementById('map')!;
    let activated = 0;
    mountSearchBar(map, { onActivate: () => { activated++; }, onUseLocation: () => {} });
    (map.querySelector('[data-search-bar-activate]') as HTMLElement).click();
    expect(activated).toBe(1);
  });

  it('tapping the location button fires onUseLocation, not onActivate', () => {
    const map = document.getElementById('map')!;
    let activated = 0; let usedLocation = 0;
    mountSearchBar(map, {
      onActivate: () => { activated++; },
      onUseLocation: () => { usedLocation++; },
    });
    (map.querySelector('button[data-action="use-location"]') as HTMLButtonElement).click();
    expect(usedLocation).toBe(1);
    expect(activated).toBe(0);
  });
});
