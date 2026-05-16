/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderCameraDetailPopup } from '../../../src/ui/cameraDetailPopup';
import { resolveCamera } from '../../../src/data/resolvedCamera';

// ── Shared mock cameras ────────────────────────────────────────────────────────

const knownDirectionCam = resolveCamera({
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

const unknownDirectionCam = resolveCamera({
  id: 'atl-002',
  type: 'cctv_municipal',
  lat: 33.75,
  lon: -84.39,
  confidence: 0.8,
  source: 'osm',
  sources: ['osm'],
  // no direction → directionConfidence resolves to 'unknown'
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('cameraDetailPopup v0.2', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    container = document.getElementById('c')!;
  });

  it('renders a card element with data-camera-popup attribute', () => {
    renderCameraDetailPopup(container, knownDirectionCam, () => {});
    const card = container.querySelector('[data-camera-popup]') as HTMLElement | null;
    expect(card).not.toBeNull();
  });

  it('card has white-surface background token in cssText', () => {
    renderCameraDetailPopup(container, knownDirectionCam, () => {});
    const card = container.querySelector('[data-camera-popup]') as HTMLElement;
    expect(card.style.background).toContain('--color-surface');
  });

  it('renders the camera id in the header', () => {
    renderCameraDetailPopup(container, knownDirectionCam, () => {});
    expect(container.textContent).toContain(knownDirectionCam.id);
  });

  it('renders a pretty-printed type label', () => {
    renderCameraDetailPopup(container, knownDirectionCam, () => {});
    // alpr_government → "Government ALPR"
    expect(container.textContent).toMatch(/Government ALPR/i);
  });

  it('renders a <dl> field grid', () => {
    renderCameraDetailPopup(container, knownDirectionCam, () => {});
    const dl = container.querySelector('dl');
    expect(dl).not.toBeNull();
    const dts = dl!.querySelectorAll('dt');
    expect(dts.length).toBeGreaterThan(0);
  });

  it('surfaces direction when directionConfidence is known', () => {
    renderCameraDetailPopup(container, knownDirectionCam, () => {});
    // effectiveDirection = 90 → "90°"
    expect(container.textContent).toMatch(/90°/);
  });

  it('shows "(direction unknown)" when directionConfidence is unknown', () => {
    renderCameraDetailPopup(container, unknownDirectionCam, () => {});
    expect(container.textContent).toMatch(/direction unknown/i);
  });

  it('surfaces effectiveRangeMeters and effectiveFovDegrees', () => {
    renderCameraDetailPopup(container, knownDirectionCam, () => {});
    // range = 35 m, fov = 30°
    expect(container.textContent).toContain('35');
    expect(container.textContent).toContain('30');
  });

  it('surfaces the sources array in the Confirmed-by row', () => {
    renderCameraDetailPopup(container, knownDirectionCam, () => {});
    expect(container.textContent).toMatch(/Confirmed by/i);
    expect(container.textContent).toContain('deflock');
    expect(container.textContent).toContain('osm');
  });

  it('falls back to source when sources array is absent', () => {
    const singleSourceCam = resolveCamera({
      id: 'x',
      type: 'speed_camera',
      lat: 33.75,
      lon: -84.39,
      confidence: 0.7,
      source: 'seed',
      // no sources array
    });
    renderCameraDetailPopup(container, singleSourceCam, () => {});
    expect(container.textContent).toContain('seed');
  });

  it('has a close button with data-action="popup-close"', () => {
    renderCameraDetailPopup(container, knownDirectionCam, () => {});
    const btn = container.querySelector('button[data-action="popup-close"]');
    expect(btn).not.toBeNull();
  });

  it('close button fires the onClose callback', () => {
    let closed = false;
    renderCameraDetailPopup(container, knownDirectionCam, () => { closed = true; });
    const btn = container.querySelector('button[data-action="popup-close"]') as HTMLButtonElement;
    btn.click();
    expect(closed).toBe(true);
  });

  it('replaces prior popup when called twice on the same container', () => {
    renderCameraDetailPopup(container, knownDirectionCam, () => {});
    renderCameraDetailPopup(container, unknownDirectionCam, () => {});
    const cards = container.querySelectorAll('[data-camera-popup]');
    expect(cards.length).toBe(1);
  });
});
