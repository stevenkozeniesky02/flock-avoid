export interface DatasetFreshnessOptions {
  readonly generatedAt: string;        // ISO-8601
  readonly onRefresh: () => void;
}

export function renderDatasetFreshness(container: HTMLElement, opts: DatasetFreshnessOptions): void {
  const existing = container.querySelector('[data-dataset-freshness]');
  if (existing) existing.remove();

  const chip = document.createElement('div');
  chip.dataset['datasetFreshness'] = 'true';
  chip.style.cssText =
    'position:absolute;bottom:var(--space-4);left:var(--space-4);z-index:5;' +
    'display:inline-flex;align-items:center;gap:var(--space-2);' +
    'padding:6px 12px;background:rgba(255, 255, 255, 0.88);backdrop-filter:blur(8px);' +
    'border:1px solid var(--color-border);border-radius:var(--radius-pill);' +
    'font-family:var(--font-family-sans);font-size:var(--font-size-xs);' +
    'color:var(--color-muted);box-shadow:var(--shadow-1);cursor:pointer';
  chip.title = `Dataset generated ${new Date(opts.generatedAt).toLocaleString()} — click to refresh`;
  chip.innerHTML = `
    <span data-freshness-dot style="width:6px;height:6px;border-radius:50%;background:var(--color-safe)"></span>
    <span>Dataset · ${relative(opts.generatedAt)}</span>
  `;
  chip.addEventListener('click', () => opts.onRefresh());
  container.appendChild(chip);
}

function relative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.max(0, Math.round((now - then) / 60000));
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const hrs = Math.round(diffMin / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
