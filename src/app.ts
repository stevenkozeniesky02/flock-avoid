import 'maplibre-gl/dist/maplibre-gl.css';
import { MapView } from './ui/mapView';
import { renderProfilePicker } from './ui/profilePicker';
import { renderCustomProfileEditor } from './ui/customProfileEditor';
import { RoutePlanner } from './ui/routePlanner';
import { CameraStore } from './data/cameraStore';
import { ValhallaClient } from './routing/valhallaClient';
import { Router } from './routing/router';
import { renderDatasetFreshness } from './ui/datasetFreshness';
import { parseDatasetManifest } from './data/datasetManifest';
import { isAllowedUrl } from './privacy/networkAllowlist';
import type { GeoPoint } from './domain/route';
import type { ThreatProfile } from './domain/threatProfile';

const ATLANTA_CENTER: GeoPoint = { lat: 33.7500, lon: -84.3890 };
const VALHALLA_URL = '/valhalla';

const LOCAL_SEED_URL = '/data/cameras-atlanta-seed.json';
const RELEASE_DATASET_URL = 'https://github.com/stevenkozeniesky02/flock-avoid/releases/latest/download/cameras-us.json';

const CAMERA_DATASET_URL = import.meta.env['VITE_USE_LOCAL_SEED'] === 'true'
  ? LOCAL_SEED_URL
  : RELEASE_DATASET_URL;

const MANIFEST_URL = import.meta.env['VITE_USE_LOCAL_SEED'] === 'true'
  ? null
  : 'https://github.com/stevenkozeniesky02/flock-avoid/releases/latest/download/cameras-us.json.meta.json';

export async function startApp(): Promise<void> {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) throw new Error('#sidebar missing');

  const cameraStore = await CameraStore.loadFromUrl(CAMERA_DATASET_URL);
  const mapView = new MapView('map', ATLANTA_CENTER);

  let manifestGeneratedAt: string | null = null;
  if (MANIFEST_URL) {
    if (!isAllowedUrl(MANIFEST_URL)) {
      throw new Error(`Manifest URL not in allowlist: ${MANIFEST_URL}`);
    }
    try {
      const resp = await fetch(MANIFEST_URL);
      if (resp.ok) {
        const manifest = parseDatasetManifest(await resp.text());
        manifestGeneratedAt = manifest.generatedAt;
      }
    } catch {
      // best-effort; don't block app startup
    }
  }

  if (manifestGeneratedAt) {
    const sidebarHeader = document.createElement('div');
    sidebar.insertBefore(sidebarHeader, sidebar.firstChild);
    renderDatasetFreshness(sidebarHeader, {
      generatedAt: manifestGeneratedAt,
      onRefresh: () => { window.location.reload(); },
    });
  }

  mapView.renderCameras(cameraStore.all());
  const router = new Router(new ValhallaClient(VALHALLA_URL), cameraStore, VALHALLA_URL);

  showPicker(sidebar, mapView, router);
}

function showPicker(sidebar: HTMLElement, mapView: MapView, router: Router): void {
  renderProfilePicker(sidebar, {
    onPresetPicked: (profile) => mountPlanner(sidebar, mapView, router, profile),
    onCustomPicked: () => {
      renderCustomProfileEditor(sidebar, {
        onApply: (profile) => mountPlanner(sidebar, mapView, router, profile),
      });
    },
  });
}

function mountPlanner(
  sidebar: HTMLElement,
  mapView: MapView,
  router: Router,
  profile: ThreatProfile,
  initial?: { readonly start: GeoPoint; readonly end: GeoPoint },
): void {
  sidebar.innerHTML = '';
  let lastStart: GeoPoint | null = initial?.start ?? null;
  let lastEnd: GeoPoint | null = initial?.end ?? null;
  const planner = new RoutePlanner(
    sidebar,
    {
      onPlanRequested: async (start, end) => {
        lastStart = start;
        lastEnd = end;
        const cmp = await router.compareRoutes(start, end, profile);
        if (!cmp.degradation) mapView.renderComparison(cmp);
        return cmp;
      },
      onProfileSwap: (newProfile) => {
        if (lastStart && lastEnd) {
          mountPlanner(sidebar, mapView, router, newProfile, { start: lastStart, end: lastEnd });
        } else {
          mountPlanner(sidebar, mapView, router, newProfile);
        }
      },
    },
    profile,
    initial,
  );
  mapView.onClick((p) => planner.handleMapClick(p));
}
