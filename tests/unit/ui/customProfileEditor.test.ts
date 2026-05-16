/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderCustomProfileEditor } from '../../../src/ui/customProfileEditor';

describe('CustomProfileEditor', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    container = document.getElementById('c')!;
    localStorage.clear();
  });

  it('renders two top-level sliders and the advanced toggle', () => {
    renderCustomProfileEditor(container, { onApply: () => {} });
    expect(container.querySelector('input[name="tolerance"]')).toBeTruthy();
    expect(container.querySelector('input[name="visibilityExpansion"]')).toBeTruthy();
    expect(container.querySelector('[data-disclosure="advanced"]')).toBeTruthy();
  });

  it('per-camera-type weight sliders are present (collapsed by default)', () => {
    renderCustomProfileEditor(container, { onApply: () => {} });
    expect(container.querySelectorAll('input[data-weight-type]')).toHaveLength(6);
    const advanced = container.querySelector('[data-advanced-body]') as HTMLElement;
    expect(advanced.style.display).toBe('none');
  });

  it('clicking "Apply" invokes onApply with a complete ThreatProfile', () => {
    let received: { preset: string; toleranceMultiplier: number } | null = null;
    renderCustomProfileEditor(container, {
      onApply: (p) => {
        received = { preset: p.preset, toleranceMultiplier: p.toleranceMultiplier };
      },
    });
    const apply = container.querySelector('button[data-action="apply"]') as HTMLButtonElement;
    apply.click();
    expect(received).not.toBeNull();
    expect(received!.preset).toBe('custom');
  });

  it('"Save as my default" persists profile to localStorage', () => {
    renderCustomProfileEditor(container, { onApply: () => {} });
    const save = container.querySelector('input[name="saveDefault"]') as HTMLInputElement;
    save.checked = true;
    const apply = container.querySelector('button[data-action="apply"]') as HTMLButtonElement;
    apply.click();
    expect(localStorage.getItem('flockavoid.customProfile.v1')).toBeTruthy();
  });

  it('does NOT persist when checkbox unchecked', () => {
    renderCustomProfileEditor(container, { onApply: () => {} });
    const apply = container.querySelector('button[data-action="apply"]') as HTMLButtonElement;
    apply.click();
    expect(localStorage.getItem('flockavoid.customProfile.v1')).toBeNull();
  });

  it('loads from localStorage when present and pre-fills sliders', () => {
    localStorage.setItem(
      'flockavoid.customProfile.v1',
      JSON.stringify({
        preset: 'custom',
        weights: {
          alpr_government: 33,
          alpr_private: 50,
          cctv_municipal: 30,
          cctv_dot_traffic: 15,
          speed_camera: 25,
          red_light_camera: 25,
        },
        toleranceMultiplier: 1.7,
        visibilityExpansionMultiplier: 1.0,
      }),
    );
    renderCustomProfileEditor(container, { onApply: () => {} });
    const tol = container.querySelector('input[name="tolerance"]') as HTMLInputElement;
    expect(parseFloat(tol.value)).toBeCloseTo(1.7, 5);
    const alprWeight = container.querySelector(
      'input[data-weight-type="alpr_government"]',
    ) as HTMLInputElement;
    expect(parseInt(alprWeight.value, 10)).toBe(33);
  });
});
