import {
  COMMUTER_PROFILE, ACTIVIST_PROFILE, VULNERABLE_PROFILE,
  type ThreatProfile,
} from '../domain/threatProfile';

interface Preset {
  profile: ThreatProfile;
  label: string;
  sub: string;
  swatchColor: string;
}

const PRESETS: Preset[] = [
  { profile: COMMUTER_PROFILE,   label: 'Commuter',   sub: 'Routes stay close to the shortest path.',         swatchColor: 'var(--color-state-success)' },
  { profile: ACTIVIST_PROFILE,   label: 'Activist',   sub: 'Detours around sensitive areas (~10–20% extra).', swatchColor: 'var(--color-state-warning)' },
  { profile: VULNERABLE_PROFILE, label: 'Vulnerable', sub: 'Max avoidance, accepts significant detours.',     swatchColor: 'var(--color-state-danger)' },
];

export interface ProfilePickerCallbacks {
  readonly onPresetPicked: (profile: ThreatProfile) => void;
  readonly onCustomPicked: () => void;
}

export function renderProfilePicker(
  container: HTMLElement,
  callbacks: ProfilePickerCallbacks,
): void {
  container.innerHTML = '';
  const heading = document.createElement('h3');
  heading.textContent = 'Pick a threat profile';
  heading.style.cssText =
    'margin:0 0 var(--space-3);font-family:var(--font-family-sans);' +
    'font-size:var(--font-size-lg);font-weight:600;color:var(--color-brand-ink)';
  container.appendChild(heading);

  for (const preset of PRESETS) {
    container.appendChild(presetCard(preset.label, preset.sub, preset.swatchColor, () => callbacks.onPresetPicked(preset.profile)));
  }
  container.appendChild(presetCard('Custom', 'Configure exactly how aggressively to avoid which cameras.', 'var(--color-brand-primary)', callbacks.onCustomPicked));
}

function presetCard(label: string, sub: string, swatchColor: string, onClick: () => void): HTMLElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.style.cssText =
    'display:flex;align-items:flex-start;gap:var(--space-3);width:100%;text-align:left;' +
    'padding:var(--space-3);margin-bottom:var(--space-2);' +
    'border:1px solid var(--color-brand-border);border-radius:var(--radius-md);' +
    'background:var(--color-brand-surface);cursor:pointer;font-family:var(--font-family-sans);' +
    'transition:border-color 0.15s, box-shadow 0.15s';
  card.addEventListener('mouseenter', () => {
    card.style.borderColor = 'var(--color-brand-primary)';
    card.style.boxShadow = 'var(--shadow-sm)';
  });
  card.addEventListener('mouseleave', () => {
    card.style.borderColor = 'var(--color-brand-border)';
    card.style.boxShadow = 'none';
  });
  card.innerHTML = `
    <div style="width:10px;height:10px;border-radius:50%;background:${swatchColor};margin-top:6px;flex-shrink:0"></div>
    <div style="flex:1">
      <div style="font-weight:600;color:var(--color-brand-ink);font-size:var(--font-size-base)">${label}</div>
      <div style="font-size:var(--font-size-xs);color:var(--color-brand-ink-muted);margin-top:var(--space-1)">${sub}</div>
    </div>
  `;
  card.addEventListener('click', onClick);
  return card;
}
