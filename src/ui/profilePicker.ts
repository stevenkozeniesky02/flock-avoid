import {
  COMMUTER_PROFILE, ACTIVIST_PROFILE, VULNERABLE_PROFILE,
  type ThreatProfile,
} from '../domain/threatProfile';

const PRESETS: { profile: ThreatProfile; emoji: string; label: string; sub: string }[] = [
  {
    profile: COMMUTER_PROFILE,
    emoji: '🚗',
    label: 'Commuter',
    sub: 'Routes stay close to the shortest path.',
  },
  {
    profile: ACTIVIST_PROFILE,
    emoji: '📣',
    label: 'Activist',
    sub: 'Detours around sensitive areas (~10–20% extra).',
  },
  {
    profile: VULNERABLE_PROFILE,
    emoji: '🛡️',
    label: 'Vulnerable',
    sub: 'Max avoidance, accepts significant detours.',
  },
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
  heading.style.cssText = 'margin:0 0 12px';
  container.appendChild(heading);

  for (const { profile, emoji, label, sub } of PRESETS) {
    container.appendChild(presetCard(emoji, label, sub, () => callbacks.onPresetPicked(profile)));
  }
  container.appendChild(presetCard('⚙️', 'Custom', 'Configure exactly how aggressively to avoid which cameras.', callbacks.onCustomPicked));
}

function presetCard(emoji: string, label: string, sub: string, onClick: () => void): HTMLElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.style.cssText =
    'display:block;width:100%;text-align:left;padding:12px;margin-bottom:8px;' +
    'border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;font:inherit';
  card.innerHTML =
    `<div style="font-size:24px">${emoji}</div>` +
    `<div style="font-weight:600;margin-top:4px">${label}</div>` +
    `<div style="font-size:12px;color:#666;margin-top:2px">${sub}</div>`;
  card.addEventListener('click', onClick);
  return card;
}
