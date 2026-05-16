import type { GeoPoint, RouteComparison, RouteDegradation } from '../domain/route';
import type { ThreatProfile } from '../domain/threatProfile';
import { mountErrorBanner, clearErrorBanners } from './errorBanner';

export interface RoutePlannerCallbacks {
  readonly onPlanRequested: (start: GeoPoint, end: GeoPoint) => Promise<RouteComparison>;
  readonly onProfileSwap?: (newProfile: ThreatProfile) => void;
}

interface State {
  start: GeoPoint | null;
  end: GeoPoint | null;
  awaiting: 'start' | 'end' | null;
}

export class RoutePlanner {
  private readonly state: State = { start: null, end: null, awaiting: null };

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: RoutePlannerCallbacks,
    private readonly profile: ThreatProfile,
    initial?: { readonly start: GeoPoint; readonly end: GeoPoint },
  ) {
    if (initial) {
      this.state.start = initial.start;
      this.state.end = initial.end;
    }
    this.render();
  }

  handleMapClick(point: GeoPoint): void {
    if (this.state.awaiting === 'start') {
      this.state.start = point;
      this.state.awaiting = null;
    } else if (this.state.awaiting === 'end') {
      this.state.end = point;
      this.state.awaiting = null;
    }
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';
    const heading = document.createElement('h3');
    heading.textContent = `Plan route — ${this.profile.preset}`;
    heading.style.cssText =
      'margin:0 0 var(--space-3);font-family:var(--font-family-sans);' +
      'font-size:var(--font-size-lg);font-weight:600;color:var(--color-brand-ink)';
    this.container.appendChild(heading);

    this.container.appendChild(this.pointRow('Start', this.state.start, 'start'));
    this.container.appendChild(this.pointRow('End', this.state.end, 'end'));

    const plan = document.createElement('button');
    plan.type = 'button';
    plan.textContent = 'Plan route';
    plan.disabled = !(this.state.start && this.state.end);
    plan.style.cssText =
      'display:block;width:100%;padding:var(--space-3);margin-top:var(--space-3);' +
      'background:var(--color-brand-primary);color:#fff;border:0;' +
      'border-radius:var(--radius-md);cursor:pointer;font-family:var(--font-family-sans);' +
      'font-size:var(--font-size-base);font-weight:600;opacity:1';
    if (plan.disabled) plan.style.opacity = '0.4';
    plan.addEventListener('click', () => void this.runPlan());
    this.container.appendChild(plan);
  }

  private pointRow(label: string, value: GeoPoint | null, kind: 'start' | 'end'): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText =
      'padding:var(--space-3);border:1px solid var(--color-brand-border);' +
      'border-radius:var(--radius-md);margin-bottom:var(--space-2);' +
      'font-family:var(--font-family-sans)';
    const text = value
      ? `${label}: ${value.lat.toFixed(4)}, ${value.lon.toFixed(4)}`
      : `${label}: not set`;
    row.innerHTML = `<div style="font-size:var(--font-size-sm);color:var(--color-brand-ink)">${text}</div>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent =
      this.state.awaiting === kind ? `Click map for ${label}…` : `Set ${label} on map`;
    btn.style.cssText =
      'margin-top:var(--space-2);padding:var(--space-1) var(--space-3);' +
      'background:var(--color-brand-surface);border:1px solid var(--color-brand-border);' +
      'border-radius:var(--radius-sm);cursor:pointer;font-family:var(--font-family-sans);' +
      'font-size:var(--font-size-xs);color:var(--color-brand-ink)';
    btn.addEventListener('click', () => {
      this.state.awaiting = kind;
      this.render();
    });
    row.appendChild(btn);
    return row;
  }

  private async runPlan(): Promise<void> {
    if (!this.state.start || !this.state.end) return;
    clearErrorBanners(this.container);
    try {
      const cmp = await this.callbacks.onPlanRequested(this.state.start, this.state.end);
      if (cmp.degradation) {
        this.renderDegradation(cmp.degradation);
      } else {
        this.renderComparison(cmp);
      }
    } catch (err) {
      mountErrorBanner(this.container, err instanceof Error ? err.message : String(err));
    }
  }

  private renderDegradation(degradation: RouteDegradation): void {
    const panel = document.createElement('div');
    panel.dataset['degradationPanel'] = 'true';
    panel.style.cssText =
      'margin-top:var(--space-4);padding:var(--space-3);' +
      'border:1px solid var(--color-state-warning);border-radius:var(--radius-md);' +
      'background:var(--color-state-warning-soft);font-family:var(--font-family-sans)';
    const heading = document.createElement('strong');
    heading.textContent = 'No private route possible with this profile';
    heading.style.cssText = 'color:var(--color-state-warning);font-size:var(--font-size-base)';
    panel.appendChild(heading);
    const body = document.createElement('p');
    body.style.cssText = 'margin:var(--space-2) 0;font-size:var(--font-size-sm);color:var(--color-brand-ink)';
    body.textContent = 'Try a different profile:';
    panel.appendChild(body);
    for (const preview of degradation.alternativePreviews) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset['profileSwap'] = preview.profile.preset;
      btn.style.cssText =
        'display:block;width:100%;padding:var(--space-2);margin-bottom:var(--space-1);' +
        'background:var(--color-brand-surface);border:1px solid var(--color-state-warning);' +
        'border-radius:var(--radius-sm);cursor:pointer;font-family:var(--font-family-sans);' +
        'text-align:left;font-size:var(--font-size-sm);color:var(--color-brand-ink)';
      btn.textContent = `Use ${cap(preview.profile.preset)} (would avoid ~${preview.camerasAvoidedEstimate} cameras)`;
      btn.addEventListener('click', () => this.callbacks.onProfileSwap?.(preview.profile));
      panel.appendChild(btn);
    }
    this.container.appendChild(panel);
  }

  private renderComparison(cmp: RouteComparison): void {
    const panel = document.createElement('div');
    panel.style.cssText =
      'margin-top:var(--space-4);padding-top:var(--space-4);' +
      'border-top:1px solid var(--color-brand-border);font-family:var(--font-family-sans)';
    panel.innerHTML = `
      <div style="padding:var(--space-3);border:2px solid var(--color-state-danger);border-radius:var(--radius-md);margin-bottom:var(--space-2);background:var(--color-state-danger-soft)">
        <div style="display:flex;justify-content:space-between">
          <strong style="color:var(--color-state-danger);font-size:var(--font-size-base)">Shortest</strong>
          <span style="color:var(--color-brand-ink);font-size:var(--font-size-base)">${formatDuration(cmp.shortest.durationSeconds)}</span>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--color-brand-ink-muted);margin-top:var(--space-1)">
          ${cmp.shortest.camerasOnRoute} cameras · score ${cmp.shortest.surveillanceScore.toFixed(0)}
        </div>
      </div>
      <div style="padding:var(--space-3);border:2px solid var(--color-state-success);border-radius:var(--radius-md);background:var(--color-state-success-soft);margin-bottom:var(--space-2)">
        <div style="display:flex;justify-content:space-between">
          <strong style="color:var(--color-state-success);font-size:var(--font-size-base)">Private</strong>
          <span style="color:var(--color-brand-ink);font-size:var(--font-size-base)">${formatDuration(cmp.private.durationSeconds)}</span>
        </div>
        <div style="font-size:var(--font-size-xs);color:var(--color-brand-ink-muted);margin-top:var(--space-1)">
          ${cmp.private.camerasOnRoute} cameras · score ${cmp.private.surveillanceScore.toFixed(0)}
        </div>
      </div>
      <div style="padding:var(--space-3);background:var(--color-state-success-soft);border-radius:var(--radius-md);text-align:center;font-size:var(--font-size-sm);color:var(--color-brand-ink)">
        <strong>+${formatDuration(cmp.diff.extraSeconds)}</strong> ·
        <strong>${cmp.diff.camerasAvoided} cameras avoided</strong>
      </div>
    `;
    this.container.appendChild(panel);
  }
}

function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
