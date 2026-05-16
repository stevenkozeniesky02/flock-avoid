import {
  CUSTOM_PROFILE_DEFAULT, type ThreatProfile,
} from '../domain/threatProfile';
import { ALL_CAMERA_TYPES, type CameraType } from '../domain/camera';

const STORAGE_KEY = 'flockavoid.customProfile.v1';

export interface CustomProfileEditorCallbacks {
  readonly onApply: (profile: ThreatProfile) => void;
}

interface MutableProfile {
  weights: Record<CameraType, number>;
  toleranceMultiplier: number;
  visibilityExpansionMultiplier: number;
}

function loadStored(): MutableProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as ThreatProfile;
      return {
        weights: { ...p.weights },
        toleranceMultiplier: p.toleranceMultiplier,
        visibilityExpansionMultiplier: p.visibilityExpansionMultiplier,
      };
    }
  } catch {
    // fall through to defaults
  }
  return {
    weights: { ...CUSTOM_PROFILE_DEFAULT.weights },
    toleranceMultiplier: CUSTOM_PROFILE_DEFAULT.toleranceMultiplier,
    visibilityExpansionMultiplier: CUSTOM_PROFILE_DEFAULT.visibilityExpansionMultiplier,
  };
}

export function renderCustomProfileEditor(
  container: HTMLElement,
  callbacks: CustomProfileEditorCallbacks,
): void {
  const state = loadStored();
  container.innerHTML = '';

  const h = document.createElement('h3');
  h.textContent = 'Custom profile';
  h.style.cssText =
    'margin:0 0 var(--space-3);font-family:var(--font-family-sans);' +
    'font-size:var(--font-size-lg);font-weight:600;color:var(--color-brand-ink)';
  container.appendChild(h);

  container.appendChild(
    sliderRow('Detour tolerance', 'tolerance', 0.3, 3.0, 0.05, state.toleranceMultiplier, (v) => {
      state.toleranceMultiplier = v;
    }),
  );
  container.appendChild(
    sliderRow(
      'Visibility expansion',
      'visibilityExpansion',
      0.8,
      2.0,
      0.05,
      state.visibilityExpansionMultiplier,
      (v) => {
        state.visibilityExpansionMultiplier = v;
      },
    ),
  );

  const disclosure = document.createElement('button');
  disclosure.type = 'button';
  disclosure.dataset['disclosure'] = 'advanced';
  disclosure.textContent = '▸ Per-camera-type weights';
  disclosure.style.cssText =
    'display:block;width:100%;text-align:left;padding:var(--space-2);margin:var(--space-3) 0 var(--space-2);' +
    'border:0;background:var(--color-brand-primary-soft);border-radius:var(--radius-md);' +
    'cursor:pointer;font-family:var(--font-family-sans);font-size:var(--font-size-sm);color:var(--color-brand-ink)';
  container.appendChild(disclosure);

  const advanced = document.createElement('div');
  advanced.dataset['advancedBody'] = '';
  advanced.style.display = 'none';
  container.appendChild(advanced);

  for (const type of ALL_CAMERA_TYPES) {
    advanced.appendChild(
      weightRow(type, state.weights[type], (v) => {
        state.weights[type] = v;
      }),
    );
  }

  disclosure.addEventListener('click', () => {
    const shown = advanced.style.display !== 'none';
    advanced.style.display = shown ? 'none' : 'block';
    disclosure.textContent = (shown ? '▸ ' : '▾ ') + 'Per-camera-type weights';
  });

  const saveLabel = document.createElement('label');
  saveLabel.style.cssText =
    'display:block;margin:var(--space-3) 0;font-size:var(--font-size-xs);' +
    'font-family:var(--font-family-sans);color:var(--color-brand-ink-muted)';
  const save = document.createElement('input');
  save.type = 'checkbox';
  save.name = 'saveDefault';
  saveLabel.appendChild(save);
  saveLabel.appendChild(document.createTextNode(' Save as my default'));
  container.appendChild(saveLabel);

  const apply = document.createElement('button');
  apply.type = 'button';
  apply.dataset['action'] = 'apply';
  apply.textContent = 'Apply';
  apply.style.cssText =
    'display:block;width:100%;padding:var(--space-3);background:var(--color-brand-primary);' +
    'color:#fff;border:0;border-radius:var(--radius-md);cursor:pointer;' +
    'font-family:var(--font-family-sans);font-size:var(--font-size-base);font-weight:600';
  apply.addEventListener('click', () => {
    const profile: ThreatProfile = Object.freeze({
      preset: 'custom',
      weights: Object.freeze({ ...state.weights }),
      toleranceMultiplier: state.toleranceMultiplier,
      visibilityExpansionMultiplier: state.visibilityExpansionMultiplier,
    });
    if (save.checked) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      } catch {
        // ignore quota errors
      }
    }
    callbacks.onApply(profile);
  });
  container.appendChild(apply);
}

function sliderRow(
  label: string,
  name: string,
  min: number,
  max: number,
  step: number,
  value: number,
  onChange: (v: number) => void,
): HTMLElement {
  const row = document.createElement('label');
  row.style.cssText =
    'display:block;margin-bottom:var(--space-2);font-size:var(--font-size-sm);' +
    'color:var(--color-brand-ink);font-family:var(--font-family-sans)';
  row.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.name = name;
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.style.cssText =
    'display:block;width:100%;margin-top:var(--space-1);accent-color:var(--color-brand-primary)';
  input.addEventListener('input', () => onChange(parseFloat(input.value)));
  row.appendChild(input);
  return row;
}

function weightRow(
  type: CameraType,
  value: number,
  onChange: (v: number) => void,
): HTMLElement {
  const row = document.createElement('label');
  row.style.cssText =
    'display:block;margin-bottom:var(--space-2);font-size:var(--font-size-xs);' +
    'color:var(--color-brand-ink);font-family:var(--font-family-sans)';
  row.textContent = type;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.step = '1';
  input.value = String(value);
  input.dataset['weightType'] = type;
  input.style.cssText =
    'display:block;width:100%;margin-top:var(--space-1);accent-color:var(--color-brand-primary)';
  input.addEventListener('input', () => onChange(parseInt(input.value, 10)));
  row.appendChild(input);
  return row;
}
