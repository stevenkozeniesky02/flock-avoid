export interface DatasetFreshnessProps {
  readonly generatedAt: string;
  readonly onRefresh: () => void;
}

export function renderDatasetFreshness(
  container: HTMLElement,
  props: DatasetFreshnessProps,
): void {
  container.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'display:flex;justify-content:space-between;align-items:center;' +
    'padding:var(--space-2) var(--space-3);font-size:var(--font-size-xs);' +
    'color:var(--color-brand-ink-muted);border-bottom:1px solid var(--color-brand-border);' +
    'margin-bottom:var(--space-2);font-family:var(--font-family-sans)';

  const label = document.createElement('span');
  label.textContent = `Data: ${describeAge(props.generatedAt)}`;
  wrapper.appendChild(label);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset['action'] = 'refresh-dataset';
  btn.textContent = 'refresh';
  btn.style.cssText =
    'padding:0 var(--space-1);font:inherit;font-size:var(--font-size-xs);' +
    'background:none;border:0;color:var(--color-brand-primary);' +
    'cursor:pointer;text-decoration:underline';
  btn.addEventListener('click', props.onRefresh);
  wrapper.appendChild(btn);

  container.appendChild(wrapper);
}

function describeAge(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'unknown age';
  const ms = Date.now() - then;
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'less than 1 hour ago';
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}
