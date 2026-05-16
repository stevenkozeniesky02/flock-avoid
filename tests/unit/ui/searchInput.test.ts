/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchInput } from '../../../src/ui/searchInput';
import type { GeocodeResult } from '../../../src/geocode/geocodeTypes';

const sample: GeocodeResult[] = [
  { id: 'W/1', name: 'Krog Street Market', secondary: '99 Krog St NE', type: 'poi', lat: 33.7553, lon: -84.3617 },
  { id: 'N/2', name: 'Krog Tunnel', secondary: 'Krog St', type: 'street', lat: 33.7517, lon: -84.3614 },
];

class StubClient {
  calls: string[] = [];
  delay = 0;
  async search(q: string): Promise<readonly GeocodeResult[]> {
    this.calls.push(q);
    if (this.delay > 0) await new Promise((r) => setTimeout(r, this.delay));
    return sample;
  }
}

describe('SearchInput', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('renders an input with the right aria roles', () => {
    const c = document.getElementById('c')!;
    new SearchInput(c, { photonClient: new StubClient() as never, placeholder: 'Where?', onSelect: () => {} });
    const input = c.querySelector('input[data-search-input]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.placeholder).toBe('Where?');
  });

  it('debounces input — 300 ms between keystroke and fetch', async () => {
    const c = document.getElementById('c')!;
    const client = new StubClient();
    new SearchInput(c, { photonClient: client as never, placeholder: '', onSelect: () => {} });
    const input = c.querySelector('input[data-search-input]') as HTMLInputElement;
    input.value = 'k';   input.dispatchEvent(new Event('input'));
    input.value = 'kr';  input.dispatchEvent(new Event('input'));
    input.value = 'kro'; input.dispatchEvent(new Event('input'));
    expect(client.calls.length).toBe(0);
    await vi.advanceTimersByTimeAsync(299);
    expect(client.calls.length).toBe(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(client.calls).toEqual(['kro']);
  });

  it('renders results in a listbox below the input', async () => {
    const c = document.getElementById('c')!;
    new SearchInput(c, { photonClient: new StubClient() as never, placeholder: '', onSelect: () => {} });
    const input = c.querySelector('input[data-search-input]') as HTMLInputElement;
    input.value = 'krog'; input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(305);
    await Promise.resolve();
    const rows = c.querySelectorAll('[role="option"]');
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toContain('Krog Street Market');
  });

  it('clicking a result calls onSelect with that result and clears the dropdown', async () => {
    const c = document.getElementById('c')!;
    const seen: GeocodeResult[] = [];
    new SearchInput(c, {
      photonClient: new StubClient() as never,
      placeholder: '',
      onSelect: (r) => seen.push(r),
    });
    const input = c.querySelector('input[data-search-input]') as HTMLInputElement;
    input.value = 'krog'; input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(305);
    await Promise.resolve();
    (c.querySelectorAll('[role="option"]')[0] as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(seen).toEqual([sample[0]]);
    expect(c.querySelectorAll('[role="option"]').length).toBe(0);
    expect(input.value).toBe('Krog Street Market');
  });

  it('ArrowDown/ArrowUp/Enter navigate and select', async () => {
    const c = document.getElementById('c')!;
    const seen: GeocodeResult[] = [];
    new SearchInput(c, {
      photonClient: new StubClient() as never,
      placeholder: '',
      onSelect: (r) => seen.push(r),
    });
    const input = c.querySelector('input[data-search-input]') as HTMLInputElement;
    input.value = 'krog'; input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(305);
    await Promise.resolve();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(seen).toEqual([sample[1]]);
  });

  it('Escape closes the dropdown without selecting', async () => {
    const c = document.getElementById('c')!;
    new SearchInput(c, { photonClient: new StubClient() as never, placeholder: '', onSelect: () => {} });
    const input = c.querySelector('input[data-search-input]') as HTMLInputElement;
    input.value = 'krog'; input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(305);
    await Promise.resolve();
    expect(c.querySelectorAll('[role="option"]').length).toBe(2);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(c.querySelectorAll('[role="option"]').length).toBe(0);
  });

  it('clearing the input cancels in-flight queries', async () => {
    const c = document.getElementById('c')!;
    const client = new StubClient();
    client.delay = 50;
    new SearchInput(c, { photonClient: client as never, placeholder: '', onSelect: () => {} });
    const input = c.querySelector('input[data-search-input]') as HTMLInputElement;
    input.value = 'kr'; input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(305);
    input.value = ''; input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);
    await Promise.resolve();
    expect(c.querySelectorAll('[role="option"]').length).toBe(0);
  });
});
