export interface RouteSummary {
  readonly distanceMeters: number;
  readonly exposure: number;
  readonly sensorsAlong: number;
}

export interface RouteComparisonSummary {
  readonly shortest: RouteSummary;
  readonly private: RouteSummary;
}

export interface RouteSummaryCardOptions {
  readonly comparison: RouteComparisonSummary;
  readonly originLabel: string;
  readonly destinationLabel: string;
  readonly profileName: string;
  readonly onSelect: (which: 'shortest' | 'private') => void;
  readonly onStart: () => void;
  readonly onDetails: () => void;
}

const METERS_PER_MILE = 1609.344;

export function mountRouteSummaryCard(container: HTMLElement, opts: RouteSummaryCardOptions): HTMLElement {
  const existing = container.querySelector('[data-route-summary-card]');
  if (existing) existing.remove();

  const card = document.createElement('div');
  card.dataset['routeSummaryCard'] = 'true';
  card.style.cssText =
    'position:absolute;left:50%;bottom:var(--space-4);transform:translateX(-50%);' +
    'width:min(560px, calc(100% - 32px));background:var(--color-surface);' +
    'border-radius:var(--radius-lg);box-shadow:var(--shadow-3);' +
    'border:1px solid var(--color-border);padding:var(--space-4);z-index:5';

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3)';
  const title = document.createElement('span');
  title.style.cssText = 'font-size:var(--font-size-md);font-weight:600;color:var(--color-ink)';
  title.textContent = `${opts.originLabel} → ${opts.destinationLabel}`;
  const profile = document.createElement('span');
  profile.style.cssText =
    'padding:4px 10px;border-radius:var(--radius-pill);background:var(--color-bg-alt);' +
    'font-size:var(--font-size-xs);color:var(--color-ink-2)';
  profile.textContent = opts.profileName;
  head.appendChild(title);
  head.appendChild(profile);
  card.appendChild(head);

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);margin-bottom:var(--space-3)';

  const shortestTile = makeTile('shortest', opts.comparison.shortest, false);
  const privateTile = makeTile('private', opts.comparison.private, true);
  shortestTile.addEventListener('click', () => {
    shortestTile.dataset['selected'] = 'true';
    privateTile.dataset['selected'] = 'false';
    opts.onSelect('shortest');
  });
  privateTile.addEventListener('click', () => {
    privateTile.dataset['selected'] = 'true';
    shortestTile.dataset['selected'] = 'false';
    opts.onSelect('private');
  });

  grid.appendChild(shortestTile);
  grid.appendChild(privateTile);
  card.appendChild(grid);

  const exposureDelta = opts.comparison.shortest.exposure - opts.comparison.private.exposure;
  const pct = opts.comparison.shortest.exposure > 0
    ? Math.round((exposureDelta / opts.comparison.shortest.exposure) * 100)
    : 0;

  const footer = document.createElement('div');
  footer.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;' +
    'padding-top:var(--space-3);border-top:1px solid var(--color-hairline);';
  const savings = document.createElement('span');
  savings.style.cssText = 'color:var(--color-safe);font-weight:500;font-size:var(--font-size-sm)';
  savings.textContent = `${pct}% less visible`;
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:var(--space-2)';
  const details = makeBtn('Details', false, opts.onDetails); details.dataset['action'] = 'details';
  const start = makeBtn('Start →', true, opts.onStart); start.dataset['action'] = 'start';
  actions.appendChild(details);
  actions.appendChild(start);
  footer.appendChild(savings);
  footer.appendChild(actions);
  card.appendChild(footer);

  container.appendChild(card);
  return card;
}

function makeTile(kind: 'shortest' | 'private', s: RouteSummary, selected: boolean): HTMLButtonElement {
  const tile = document.createElement('button');
  tile.type = 'button';
  tile.dataset['routeTile'] = kind;
  tile.dataset['selected'] = String(selected);
  tile.style.cssText =
    'padding:var(--space-3) var(--space-4);border-radius:var(--radius-md);' +
    'border:1px solid var(--color-border);background:var(--color-surface);' +
    'cursor:pointer;text-align:left;font:inherit';
  const miles = (s.distanceMeters / METERS_PER_MILE).toFixed(1);
  const accentColor = kind === 'private' ? 'var(--color-safe)' : 'var(--color-threat)';
  tile.innerHTML = `
    <div style="display:inline-flex;align-items:center;gap:6px;font-size:var(--font-size-xs);font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--color-muted);margin-bottom:6px">
      <span style="width:12px;height:2px;background:${accentColor};border-radius:2px"></span>
      ${kind === 'private' ? 'Private' : 'Shortest'}
    </div>
    <div style="font-size:var(--font-size-xl);font-weight:600;letter-spacing:-0.02em">${miles} mi</div>
    <div style="font-size:var(--font-size-sm);color:var(--color-muted);margin-top:2px">
      <strong style="color:var(--color-ink-2);font-weight:600">${s.sensorsAlong} sensors</strong> · exposure ${s.exposure}
    </div>`;
  if (selected) {
    tile.style.borderColor = 'var(--color-accent)';
    tile.style.background = 'var(--color-accent-soft)';
  }
  return tile;
}

function makeBtn(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.style.cssText =
    'padding:8px 14px;border-radius:var(--radius-pill);border:0;cursor:pointer;font:inherit;' +
    `font-size:var(--font-size-sm);font-weight:500;` +
    (primary
      ? 'background:var(--color-ink);color:var(--color-surface)'
      : 'background:transparent;color:var(--color-ink)');
  b.addEventListener('click', onClick);
  return b;
}
