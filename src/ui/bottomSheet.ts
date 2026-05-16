export const BREAKPOINT_PX = 720;

export type SheetMode = 'desktop' | 'mobile';
export type SnapPosition = 'collapsed' | 'half' | 'full';

const SNAP_HEIGHTS: Record<SnapPosition, string> = {
  collapsed: '88px',
  half: '45vh',
  full: '92vh',
};

const SNAP_CYCLE: readonly SnapPosition[] = ['collapsed', 'half', 'full'];

export class BottomSheet {
  private mode: SheetMode;
  private snap: SnapPosition = 'half';
  private wrapper: HTMLElement;
  private content: HTMLElement;

  constructor(private readonly mount: HTMLElement) {
    this.mode = this.detectMode();
    this.wrapper = document.createElement('div');
    this.wrapper.dataset['sheetMode'] = this.mode;
    this.content = document.createElement('div');
    this.content.dataset['sheetContent'] = 'true';
    this.render();
    this.installResizeListener();
  }

  contentRoot(): HTMLElement {
    return this.content;
  }

  getMode(): SheetMode {
    return this.mode;
  }

  getSnapPosition(): SnapPosition {
    return this.snap;
  }

  setSnapPosition(snap: SnapPosition): void {
    this.snap = snap;
    if (this.mode === 'mobile') {
      this.wrapper.style.height = SNAP_HEIGHTS[snap];
    }
  }

  cycleSnap(): void {
    const idx = SNAP_CYCLE.indexOf(this.snap);
    const next = SNAP_CYCLE[(idx + 1) % SNAP_CYCLE.length]!;
    this.setSnapPosition(next);
  }

  private detectMode(): SheetMode {
    if (typeof window === 'undefined' || !window.matchMedia) return 'desktop';
    return window.matchMedia(`(max-width:${BREAKPOINT_PX - 1}px)`).matches ? 'mobile' : 'desktop';
  }

  private render(): void {
    this.mount.innerHTML = '';
    this.wrapper.innerHTML = '';
    this.wrapper.dataset['sheetMode'] = this.mode;

    if (this.mode === 'desktop') {
      this.wrapper.style.cssText =
        'width:340px;height:100vh;border-right:1px solid var(--color-brand-border);' +
        'background:var(--color-brand-surface);overflow:auto;flex-shrink:0';
      this.wrapper.appendChild(this.content);
    } else {
      this.wrapper.style.cssText =
        `position:fixed;left:0;right:0;bottom:0;height:${SNAP_HEIGHTS[this.snap]};` +
        'background:var(--color-brand-surface);border-radius:var(--radius-xl) var(--radius-xl) 0 0;' +
        'box-shadow:var(--shadow-lg);overflow:hidden;display:flex;flex-direction:column;' +
        'transition:height 0.2s ease-out;z-index:5';
      const handleWrap = document.createElement('div');
      handleWrap.dataset['sheetHandle'] = 'true';
      handleWrap.style.cssText =
        'padding:var(--space-2) 0;display:flex;justify-content:center;cursor:pointer;flex-shrink:0';
      handleWrap.addEventListener('click', () => this.cycleSnap());
      const bar = document.createElement('div');
      bar.style.cssText =
        'width:36px;height:4px;border-radius:var(--radius-sm);background:var(--color-brand-border)';
      handleWrap.appendChild(bar);
      this.wrapper.appendChild(handleWrap);
      const scroll = document.createElement('div');
      scroll.style.cssText = 'overflow:auto;flex:1;padding:0 var(--space-4) var(--space-4)';
      scroll.appendChild(this.content);
      this.wrapper.appendChild(scroll);
    }
    this.mount.appendChild(this.wrapper);
  }

  private installResizeListener(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width:${BREAKPOINT_PX - 1}px)`);
    const onChange = (): void => {
      const next = this.detectMode();
      if (next !== this.mode) {
        this.mode = next;
        this.render();
      }
    };
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
    } else if ((mq as MediaQueryList).addListener) {
      (mq as MediaQueryList).addListener(onChange);
    }
  }
}
