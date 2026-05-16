/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderCameraDetailPopup } from '../../../src/ui/cameraDetailPopup';
import type { ResolvedCamera } from '../../../src/data/resolvedCamera';
import { resolveCamera } from '../../../src/data/resolvedCamera';

describe('cameraDetailPopup', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    container = document.getElementById('c')!;
  });

  it('renders camera type, direction, range, fov', () => {
    const cam: ResolvedCamera = resolveCamera({
      id: 'atl-001',
      type: 'alpr_government',
      lat: 33.75,
      lon: -84.39,
      confidence: 0.9,
      source: 'deflock',
      direction: 90,
      rangeMeters: 35,
      fovDegrees: 30,
      directionConfidence: 'known',
      sources: ['deflock', 'osm'],
    });
    renderCameraDetailPopup(container, cam, () => {});
    const text = container.textContent ?? '';
    expect(text).toContain('alpr_government');
    expect(text).toContain('90');
    expect(text).toContain('35');
    expect(text).toContain('30');
  });

  it('surfaces the sources array as "Confirmed by"', () => {
    const cam: ResolvedCamera = resolveCamera({
      id: 'x',
      type: 'alpr_government',
      lat: 33.75,
      lon: -84.39,
      confidence: 0.9,
      source: 'deflock',
      sources: ['deflock', 'osm'],
    });
    renderCameraDetailPopup(container, cam, () => {});
    expect(container.textContent).toMatch(/Confirmed by/i);
    expect(container.textContent).toContain('deflock');
    expect(container.textContent).toContain('osm');
  });

  it('renders close button that fires the callback', () => {
    const cam: ResolvedCamera = resolveCamera({
      id: 'x',
      type: 'alpr_government',
      lat: 33.75,
      lon: -84.39,
      confidence: 0.9,
      source: 'deflock',
      sources: ['deflock'],
    });
    let closed = false;
    renderCameraDetailPopup(container, cam, () => { closed = true; });
    const btn = container.querySelector('button[data-action="close-popup"]') as HTMLButtonElement;
    btn.click();
    expect(closed).toBe(true);
  });

  it('shows "(direction unknown)" when directionConfidence is unknown', () => {
    const cam: ResolvedCamera = resolveCamera({
      id: 'x',
      type: 'cctv_municipal',
      lat: 33.75,
      lon: -84.39,
      confidence: 0.8,
      source: 'osm',
      sources: ['osm'],
    });
    renderCameraDetailPopup(container, cam, () => {});
    expect(container.textContent).toMatch(/direction unknown/i);
  });
});
