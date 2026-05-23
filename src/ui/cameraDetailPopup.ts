import type { ResolvedCamera } from '../data/resolvedCamera';

export function renderCameraDetailPopup(
  container: HTMLElement,
  cam: ResolvedCamera,
  onClose: () => void,
): void {
  container.innerHTML = '';

  const card = document.createElement('div');
  card.dataset['cameraPopup'] = 'true';
  card.style.cssText =
    'width:300px;background:var(--color-surface);border-radius:var(--radius-lg);' +
    'box-shadow:var(--shadow-3);border:1px solid var(--color-border);' +
    'padding:var(--space-4);font-family:var(--font-family-sans);color:var(--color-ink)';

  // ── Header row ──────────────────────────────────────────────────────────────
  const top = document.createElement('div');
  top.style.cssText =
    'display:flex;align-items:start;justify-content:space-between;' +
    'margin-bottom:var(--space-3);padding-bottom:var(--space-3);' +
    'border-bottom:1px solid var(--color-hairline)';

  const title = document.createElement('div');
  title.innerHTML =
    `<div style="font-size:var(--font-size-md);font-weight:600">${escape(prettyType(cam.type))}</div>` +
    `<div style="font-size:var(--font-size-xs);color:var(--color-muted);margin-top:2px">Sensor #${escape(cam.id)}</div>`;

  const close = document.createElement('button');
  close.type = 'button';
  close.dataset['action'] = 'popup-close';
  close.setAttribute('aria-label', 'Close');
  close.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M18 6L6 18M6 6l12 12"/></svg>';
  close.style.cssText =
    'width:28px;height:28px;border-radius:var(--radius-pill);border:0;' +
    'background:transparent;color:var(--color-muted);cursor:pointer;' +
    'display:inline-flex;align-items:center;justify-content:center';
  close.addEventListener('click', onClose);

  top.appendChild(title);
  top.appendChild(close);
  card.appendChild(top);

  // ── Field grid (<dl>) ────────────────────────────────────────────────────────
  const dl = document.createElement('dl');
  dl.style.cssText =
    'display:grid;grid-template-columns:auto 1fr;gap:6px var(--space-4);' +
    'font-size:var(--font-size-sm);margin:0';

  // Direction
  const directionValue =
    cam.directionConfidence === 'unknown'
      ? '(direction unknown)'
      : `${Math.round(cam.effectiveDirection)}° ${bearingToCompass(cam.effectiveDirection).toUpperCase()}`;
  appendKv(dl, 'Direction', directionValue);

  // Range & FOV
  appendKv(dl, 'Range', `${cam.effectiveRangeMeters} m`);
  appendKv(dl, 'FOV', `${cam.effectiveFovDegrees}°`);

  // Sources
  const sourcesValue = (cam.sources ?? [cam.source]).join(' + ');
  appendKv(dl, 'Confirmed by', sourcesValue);

  // Confidence
  appendKv(dl, 'Confidence', `${Math.round(cam.confidence * 100)}%`);

  card.appendChild(dl);
  container.appendChild(card);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function appendKv(dl: HTMLElement, label: string, value: string): void {
  const dt = document.createElement('dt');
  dt.style.cssText = 'color:var(--color-muted)';
  dt.textContent = label;

  const dd = document.createElement('dd');
  dd.style.cssText =
    'color:var(--color-ink);text-align:right;font-feature-settings:"tnum";margin:0';
  dd.textContent = value;

  dl.appendChild(dt);
  dl.appendChild(dd);
}

function prettyType(t: string): string {
  const u = t.toUpperCase();
  if (u.includes('ALPR') && u.includes('GOV')) return 'Government ALPR';
  if (u.includes('ALPR') && u.includes('PRIV')) return 'Private ALPR';
  if (u.includes('CCTV') && u.includes('DOT')) return 'DOT Camera';
  if (u.includes('CCTV')) return 'CCTV';
  if (u.includes('SPEED')) return 'Speed Camera';
  if (u.includes('RED') || u.includes('LIGHT')) return 'Red-light Camera';
  return t;
}

function bearingToCompass(bearing: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const normalized = ((bearing % 360) + 360) % 360;
  const idx = Math.round(normalized / 45) % 8;
  return dirs[idx]!;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
