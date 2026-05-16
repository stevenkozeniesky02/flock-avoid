import type { GeoPoint, RouteComparison, RouteDegradation } from '../domain/route';
import type { ThreatProfile } from '../domain/threatProfile';

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
    heading.textContent = `Plan route — profile: ${this.profile.preset}`;
    heading.style.cssText = 'margin:0 0 12px';
    this.container.appendChild(heading);

    this.container.appendChild(this.pointRow('Start', this.state.start, 'start'));
    this.container.appendChild(this.pointRow('End', this.state.end, 'end'));

    const plan = document.createElement('button');
    plan.type = 'button';
    plan.textContent = 'Plan route';
    plan.disabled = !(this.state.start && this.state.end);
    plan.style.cssText =
      'display:block;width:100%;padding:10px;margin-top:12px;background:#1976d2;color:#fff;' +
      'border:0;border-radius:6px;cursor:pointer;font:inherit';
    plan.addEventListener('click', () => void this.runPlan());
    this.container.appendChild(plan);
  }

  private pointRow(label: string, value: GeoPoint | null, kind: 'start' | 'end'): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:8px';
    const text = value
      ? `${label}: ${value.lat.toFixed(4)}, ${value.lon.toFixed(4)}`
      : `${label}: not set`;
    row.innerHTML = `<div style="font-size:13px">${text}</div>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent =
      this.state.awaiting === kind ? `Click map for ${label}…` : `Set ${label} on map`;
    btn.style.cssText =
      'margin-top:6px;padding:4px 10px;background:#fff;border:1px solid #aaa;' +
      'border-radius:4px;cursor:pointer;font:inherit;font-size:12px';
    btn.addEventListener('click', () => {
      this.state.awaiting = kind;
      this.render();
    });
    row.appendChild(btn);
    return row;
  }

  private async runPlan(): Promise<void> {
    if (!this.state.start || !this.state.end) return;
    this.clearError();
    try {
      const cmp = await this.callbacks.onPlanRequested(this.state.start, this.state.end);
      if (cmp.degradation) {
        this.renderDegradation(cmp.degradation);
      } else {
        this.renderComparison(cmp);
      }
    } catch (err) {
      this.renderError(err instanceof Error ? err.message : String(err));
    }
  }

  private renderError(message: string): void {
    this.clearError();
    const err = document.createElement('div');
    err.dataset['errorBanner'] = 'true';
    err.style.cssText =
      'margin-top:12px;padding:10px;background:#fdecea;color:#611a15;border:1px solid #f5c6cb;' +
      'border-radius:6px;font-size:13px';
    err.textContent = `Routing failed: ${message}`;
    this.container.appendChild(err);
  }

  private clearError(): void {
    this.container.querySelectorAll('[data-error-banner]').forEach((el) => el.remove());
  }

  private renderDegradation(degradation: RouteDegradation): void {
    const panel = document.createElement('div');
    panel.dataset['degradationPanel'] = 'true';
    panel.style.cssText =
      'margin-top:16px;padding:12px;border:1px solid #f5a623;border-radius:6px;background:#fff7e6';
    const heading = document.createElement('strong');
    heading.textContent = 'No private route possible with this profile';
    heading.style.color = '#7a5a00';
    panel.appendChild(heading);
    const body = document.createElement('p');
    body.style.cssText = 'margin:8px 0;font-size:13px';
    body.textContent = 'Try a different profile:';
    panel.appendChild(body);
    for (const preview of degradation.alternativePreviews) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset['profileSwap'] = preview.profile.preset;
      btn.style.cssText =
        'display:block;width:100%;padding:8px;margin-bottom:6px;background:#fff;' +
        'border:1px solid #f5a623;border-radius:4px;cursor:pointer;font:inherit;text-align:left;font-size:13px';
      btn.textContent =
        `Use ${cap(preview.profile.preset)} ` +
        `(would avoid ~${preview.camerasAvoidedEstimate} cameras)`;
      btn.addEventListener('click', () => this.callbacks.onProfileSwap?.(preview.profile));
      panel.appendChild(btn);
    }
    this.container.appendChild(panel);
  }

  private renderComparison(cmp: RouteComparison): void {
    const panel = document.createElement('div');
    panel.style.cssText = 'margin-top:16px;padding-top:16px;border-top:1px solid #ddd';
    panel.innerHTML = `
      <div style="padding:10px;border:2px solid #d32f2f;border-radius:6px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between">
          <strong style="color:#d32f2f">Shortest</strong>
          <span>${formatDuration(cmp.shortest.durationSeconds)}</span>
        </div>
        <div style="font-size:12px;color:#666;margin-top:4px">
          ${cmp.shortest.camerasOnRoute} cameras · score ${cmp.shortest.surveillanceScore.toFixed(0)}
        </div>
      </div>
      <div style="padding:10px;border:2px solid #2e7d32;border-radius:6px;background:#f1f8e9;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between">
          <strong style="color:#2e7d32">Private</strong>
          <span>${formatDuration(cmp.private.durationSeconds)}</span>
        </div>
        <div style="font-size:12px;color:#666;margin-top:4px">
          ${cmp.private.camerasOnRoute} cameras · score ${cmp.private.surveillanceScore.toFixed(0)}
        </div>
      </div>
      <div style="padding:10px;background:#e8f5e9;border-radius:6px;text-align:center;font-size:13px">
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
