import type { GeocodeResult } from '../geocode/geocodeTypes';
import type { PhotonClient } from '../geocode/photonClient';

export interface SearchInputOptions {
  readonly photonClient: PhotonClient;
  readonly placeholder: string;
  readonly onSelect: (result: GeocodeResult) => void;
  readonly initialValue?: string;
  readonly debounceMs?: number;
}

const DEBOUNCE_DEFAULT_MS = 300;

export class SearchInput {
  private readonly input: HTMLInputElement;
  private readonly listbox: HTMLDivElement;
  private results: readonly GeocodeResult[] = [];
  private highlighted = -1;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private inflightAbort: AbortController | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly opts: SearchInputOptions,
  ) {
    const wrap = document.createElement('div');
    wrap.dataset['searchInputWrap'] = 'true';
    wrap.style.cssText = 'position:relative;width:100%';

    this.input = document.createElement('input');
    this.input.dataset['searchInput'] = 'true';
    this.input.type = 'text';
    this.input.placeholder = opts.placeholder;
    this.input.value = opts.initialValue ?? '';
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-autocomplete', 'list');
    this.input.setAttribute('aria-expanded', 'false');
    this.input.style.cssText =
      'width:100%;padding:10px 12px;background:var(--color-bg-alt);' +
      'border:0;border-radius:var(--radius-md);font:inherit;' +
      'font-size:var(--font-size-md);color:var(--color-ink);outline:none';
    this.input.addEventListener('input', () => this.onInput());
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.input.addEventListener('blur', () => {
      // Small delay so a mousedown on a listbox row registers before blur clears dropdown
      setTimeout(() => this.clearDropdown(), 150);
    });

    this.listbox = document.createElement('div');
    this.listbox.setAttribute('role', 'listbox');
    this.listbox.style.cssText =
      'position:absolute;top:calc(100% + 4px);left:0;right:0;' +
      'background:var(--color-surface);border:1px solid var(--color-border);' +
      'border-radius:var(--radius-md);box-shadow:var(--shadow-2);' +
      'overflow:hidden;z-index:10';

    wrap.appendChild(this.input);
    wrap.appendChild(this.listbox);
    container.appendChild(wrap);
  }

  value(): string {
    return this.input.value;
  }

  focus(): void {
    this.input.focus();
  }

  private onInput(): void {
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    const q = this.input.value;
    if (q.trim().length === 0) {
      this.clearDropdown();
      return;
    }
    this.debounceTimer = setTimeout(
      () => void this.runSearch(q),
      this.opts.debounceMs ?? DEBOUNCE_DEFAULT_MS,
    );
  }

  private async runSearch(q: string): Promise<void> {
    if (this.inflightAbort !== null) this.inflightAbort.abort();
    this.inflightAbort = new AbortController();
    const { signal } = this.inflightAbort;
    try {
      const results = await this.opts.photonClient.search(q, signal);
      // Discard stale results if input changed while request was in-flight
      if (this.input.value !== q) return;
      this.results = results;
      this.highlighted = -1;
      this.renderDropdown();
    } catch (err) {
      // GeocodeError with kind 'aborted' is expected when a newer query supersedes this one
      if (
        err instanceof Error &&
        err.name === 'GeocodeError' &&
        (err as { kind?: string }).kind === 'aborted'
      ) return;
      this.results = [];
      this.renderDropdown();
    }
  }

  private renderDropdown(): void {
    this.listbox.innerHTML = '';
    this.input.setAttribute('aria-expanded', this.results.length > 0 ? 'true' : 'false');
    this.results.forEach((r, i) => {
      const row = document.createElement('div');
      row.setAttribute('role', 'option');
      row.dataset['idx'] = String(i);
      row.style.cssText =
        'padding:10px 14px;cursor:pointer;display:flex;flex-direction:column;gap:2px;' +
        'border-top:1px solid var(--color-hairline)';
      if (i === 0) row.style.borderTop = '0';
      if (i === this.highlighted) row.style.background = 'var(--color-bg-alt)';
      row.innerHTML =
        `<div style="font-weight:500;font-size:var(--font-size-md);color:var(--color-ink)">${escapeHtml(r.name)}</div>` +
        `<div style="font-size:var(--font-size-xs);color:var(--color-muted)">${escapeHtml(r.secondary)}</div>`;
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.select(i);
      });
      this.listbox.appendChild(row);
    });
  }

  private onKey(e: KeyboardEvent): void {
    if (this.results.length === 0) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.highlighted = (this.highlighted + 1) % this.results.length;
        this.renderDropdown();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.highlighted =
          (this.highlighted - 1 + this.results.length) % this.results.length;
        this.renderDropdown();
        break;
      case 'Enter':
        e.preventDefault();
        if (this.highlighted >= 0) this.select(this.highlighted);
        break;
      case 'Escape':
        this.clearDropdown();
        break;
    }
  }

  private select(idx: number): void {
    const r = this.results[idx];
    if (r === undefined) return;
    this.input.value = r.name;
    this.clearDropdown();
    this.opts.onSelect(r);
    document.dispatchEvent(
      new CustomEvent('flockavoid:geocode-selected', {
        detail: { lat: r.lat, lon: r.lon, type: r.type },
      }),
    );
  }

  private clearDropdown(): void {
    this.results = [];
    this.highlighted = -1;
    this.listbox.innerHTML = '';
    this.input.setAttribute('aria-expanded', 'false');
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
