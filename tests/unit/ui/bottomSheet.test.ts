/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BottomSheet, BREAKPOINT_PX } from '../../../src/ui/bottomSheet';

function mockMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('BottomSheet', () => {
  let mount: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<div id="m"></div>';
    mount = document.getElementById('m')!;
  });

  it('exposes BREAKPOINT_PX = 720', () => {
    expect(BREAKPOINT_PX).toBe(720);
  });

  it('renders as desktop sidebar above the breakpoint', () => {
    mockMatchMedia(false);
    const sheet = new BottomSheet(mount);
    expect(sheet.getMode()).toBe('desktop');
    expect(mount.querySelector('[data-sheet-mode="desktop"]')).toBeTruthy();
  });

  it('renders as bottom sheet below the breakpoint', () => {
    mockMatchMedia(true);
    const sheet = new BottomSheet(mount);
    expect(sheet.getMode()).toBe('mobile');
    expect(mount.querySelector('[data-sheet-mode="mobile"]')).toBeTruthy();
  });

  it('contentRoot() returns the element that callers mount their UI into', () => {
    mockMatchMedia(false);
    const sheet = new BottomSheet(mount);
    const root = sheet.contentRoot();
    expect(root).toBeInstanceOf(HTMLElement);
    expect(mount.contains(root)).toBe(true);
  });

  it('mobile mode renders a drag handle at the top of the sheet', () => {
    mockMatchMedia(true);
    new BottomSheet(mount);
    expect(mount.querySelector('[data-sheet-handle]')).toBeTruthy();
  });

  it('mobile mode starts in "half" snap position', () => {
    mockMatchMedia(true);
    const sheet = new BottomSheet(mount);
    expect(sheet.getSnapPosition()).toBe('half');
  });

  it('cycleSnap advances collapsed → half → full → collapsed', () => {
    mockMatchMedia(true);
    const sheet = new BottomSheet(mount);
    sheet.setSnapPosition('collapsed');
    sheet.cycleSnap();
    expect(sheet.getSnapPosition()).toBe('half');
    sheet.cycleSnap();
    expect(sheet.getSnapPosition()).toBe('full');
    sheet.cycleSnap();
    expect(sheet.getSnapPosition()).toBe('collapsed');
  });
});
