import type { ResolvedCamera } from '../data/resolvedCamera';

export function renderCameraDetailPopup(
  container: HTMLElement,
  camera: ResolvedCamera,
  onClose: () => void,
): void {
  container.innerHTML = '';
  const card = document.createElement('div');
  card.dataset['cameraPopup'] = 'true';
  card.style.cssText =
    'background:var(--color-brand-surface);border-radius:var(--radius-lg);' +
    'padding:var(--space-3);box-shadow:var(--shadow-md);' +
    'font-family:var(--font-family-sans);font-size:var(--font-size-sm);' +
    'color:var(--color-brand-ink);min-width:220px';

  const directionLabel =
    camera.directionConfidence === 'unknown'
      ? '(direction unknown)'
      : `${camera.effectiveDirection}° (${bearingToCompass(camera.effectiveDirection)})`;

  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:var(--space-2)">
      <strong style="color:var(--color-brand-primary);font-size:var(--font-size-base)">${camera.type}</strong>
      <button type="button" data-action="close-popup" style="background:none;border:0;font-size:18px;color:var(--color-brand-ink-muted);cursor:pointer;line-height:1;padding:0">×</button>
    </div>
    <div style="color:var(--color-brand-ink-muted);font-size:var(--font-size-xs);margin-bottom:var(--space-1)">Direction: ${directionLabel}</div>
    <div style="color:var(--color-brand-ink-muted);font-size:var(--font-size-xs);margin-bottom:var(--space-2)">Range: ${camera.effectiveRangeMeters}m · FOV: ${camera.effectiveFovDegrees}°</div>
    <hr style="border:0;border-top:1px solid var(--color-brand-border);margin:var(--space-2) 0"/>
    <div style="font-size:var(--font-size-xs);color:var(--color-brand-ink-muted)">Confirmed by: ${(camera.sources ?? [camera.source]).join(' + ')}</div>
    <div style="font-size:var(--font-size-xs);color:var(--color-brand-ink-muted);opacity:0.6;margin-top:var(--space-1)">ID: ${camera.id}</div>
  `;
  const closeBtn = card.querySelector('button[data-action="close-popup"]') as HTMLButtonElement;
  closeBtn.addEventListener('click', onClose);
  container.appendChild(card);
}

function bearingToCompass(bearing: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(((bearing % 360) / 45)) % 8;
  return dirs[idx]!.toLowerCase();
}
