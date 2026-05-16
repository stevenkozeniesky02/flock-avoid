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
    'display:flex;justify-content:space-between;align-items:center;padding:6px 8px;' +
    'font-size:11px;color:#666;border-bottom:1px solid #eee;margin-bottom:8px';

  const label = document.createElement('span');
  label.textContent = `Data: ${describeAge(props.generatedAt)}`;
  wrapper.appendChild(label);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset['action'] = 'refresh-dataset';
  btn.textContent = 'refresh';
  btn.style.cssText =
    'padding:2px 6px;font:inherit;font-size:11px;background:none;border:0;' +
    'color:#1976d2;cursor:pointer;text-decoration:underline';
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
