import 'maplibre-gl/dist/maplibre-gl.css';
import { MapView } from './ui/mapView';
import { renderProfilePicker } from './ui/profilePicker';
import { renderCustomProfileEditor } from './ui/customProfileEditor';
import { RoutePlanner } from './ui/routePlanner';
import { renderDatasetFreshness } from './ui/datasetFreshness';
import { renderCameraDetailPopup } from './ui/cameraDetailPopup';
import { mountWelcomeModal, shouldShowWelcomeModal } from './ui/welcomeModal';
import { mountLoadingSkeleton, clearLoadingSkeleton } from './ui/loadingSkeleton';
import { mountShowAllConesToggle } from './ui/showAllConesToggle';
import { BottomSheet } from './ui/bottomSheet';
import { CameraStore } from './data/cameraStore';
import { ValhallaClient } from './routing/valhallaClient';
import { Router } from './routing/router';
import { parseDatasetManifest } from './data/datasetManifest';
import { isAllowedUrl } from './privacy/networkAllowlist';
import type { GeoPoint } from './domain/route';
import type { ThreatProfile } from './domain/threatProfile';
import type { ResolvedCamera } from './data/resolvedCamera';

const ATLANTA_CENTER: GeoPoint = { lat: 33.7500, lon: -84.3890 };
const VALHALLA_URL = '/valhalla';
const LOCAL_SEED_URL = '/data/cameras-atlanta-seed.json';
const RELEASE_DATASET_URL =
  'https://github.com/stevenkozeniesky02/flock-avoid/releases/latest/download/cameras-us.json';
const MANIFEST_URL_LIVE =
  'https://github.com/stevenkozeniesky02/flock-avoid/releases/latest/download/cameras-us.json.meta.json';
const CAMERA_DATASET_URL = import.meta.env['VITE_USE_LOCAL_SEED'] === 'true'
  ? LOCAL_SEED_URL
  : RELEASE_DATASET_URL;
const MANIFEST_URL = import.meta.env['VITE_USE_LOCAL_SEED'] === 'true' ? null : MANIFEST_URL_LIVE;
const ROUTE_CONE_RADIUS_M = 200;

export async function startApp(): Promise<void> {
  const sidebarMount = document.getElementById('sidebar');
  if (!sidebarMount) throw new Error('#sidebar missing');

  // Welcome modal first — blocks further interaction until dismissed
  if (shouldShowWelcomeModal()) {
    await new Promise<void>((resolve) => {
      mountWelcomeModal(document.body, { onDismiss: resolve });
    });
  }

  // Responsive container — everything else mounts inside its contentRoot
  const bottomSheet = new BottomSheet(sidebarMount);
  const sidebar = bottomSheet.contentRoot();

  // Loading skeleton while the dataset loads
  mountLoadingSkeleton(sidebar);

  const cameraStore = await CameraStore.loadFromUrl(CAMERA_DATASET_URL);
  const mapView = new MapView('map', ATLANTA_CENTER);
  mapView.renderCameras(cameraStore.all());

  const router = new Router(new ValhallaClient(VALHALLA_URL), cameraStore, VALHALLA_URL);

  // Camera pin tap → cone + popup
  let popupEl: HTMLElement | null = null;
  let currentProfile: ThreatProfile | null = null;
  let showAllPressed = false;
  mapView.onCameraPinClick((cam) => {
    if (!currentProfile) return;
    mapView.setSelectedCameraCone(cam, currentProfile);
    if (popupEl) popupEl.remove();
    popupEl = document.createElement('div');
    popupEl.style.cssText = 'position:absolute;top:var(--space-3);left:var(--space-3);z-index:5';
    document.getElementById('map')?.appendChild(popupEl);
    renderCameraDetailPopup(popupEl, cam, () => {
      mapView.setSelectedCameraCone(null, currentProfile!);
      if (popupEl) {
        popupEl.remove();
        popupEl = null;
      }
    });
  });

  // Manifest fetch (best-effort) for the freshness banner
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
      // best-effort — don't block app startup
    }
  }

  clearLoadingSkeleton(sidebar);

  // Freshness banner at the top of the sidebar
  if (manifestGeneratedAt) {
    const freshnessSlot = document.createElement('div');
    sidebar.insertBefore(freshnessSlot, sidebar.firstChild);
    renderDatasetFreshness(freshnessSlot, {
      generatedAt: manifestGeneratedAt,
      onRefresh: () => {
        window.location.reload();
      },
    });
  }

  // Top-right map controls — "Show all cones" toggle
  const mapEl = document.getElementById('map');
  if (mapEl) {
    const controls = document.createElement('div');
    controls.style.cssText =
      'position:absolute;top:var(--space-3);right:var(--space-3);z-index:5;' +
      'display:flex;flex-direction:column;gap:var(--space-2)';
    mapEl.appendChild(controls);
    mountShowAllConesToggle(controls, {
      onChange: (pressed) => {
        showAllPressed = pressed;
        if (!currentProfile) return;
        mapView.setConesAll(pressed ? cameraStore.all() : [], currentProfile);
      },
    });
  }

  const onProfileSelected = (profile: ThreatProfile): void => {
    currentProfile = profile;
    // If "show all" is currently on, refresh cone sizing for the new profile
    if (showAllPressed) {
      mapView.setConesAll(cameraStore.all(), profile);
    }
  };

  showPicker(sidebar, mapView, router, cameraStore, onProfileSelected);
}

function showPicker(
  sidebar: HTMLElement,
  mapView: MapView,
  router: Router,
  cameraStore: CameraStore,
  onProfileSelected: (p: ThreatProfile) => void,
): void {
  removeChildrenAfterFirst(sidebar);
  renderProfilePicker(sidebar, {
    onPresetPicked: (profile) => {
      onProfileSelected(profile);
      mountPlanner(sidebar, mapView, router, cameraStore, profile, onProfileSelected);
    },
    onCustomPicked: () => {
      removeChildrenAfterFirst(sidebar);
      renderCustomProfileEditor(sidebar, {
        onApply: (profile) => {
          onProfileSelected(profile);
          mountPlanner(sidebar, mapView, router, cameraStore, profile, onProfileSelected);
        },
      });
    },
  });
}

function mountPlanner(
  sidebar: HTMLElement,
  mapView: MapView,
  router: Router,
  cameraStore: CameraStore,
  profile: ThreatProfile,
  onProfileSelected: (p: ThreatProfile) => void,
  initial?: { start: GeoPoint; end: GeoPoint },
): void {
  removeChildrenAfterFirst(sidebar);
  let lastStart: GeoPoint | null = initial?.start ?? null;
  let lastEnd: GeoPoint | null = initial?.end ?? null;
  const planner = new RoutePlanner(
    sidebar,
    {
      onPlanRequested: async (start, end) => {
        lastStart = start;
        lastEnd = end;
        const cmp = await router.compareRoutes(start, end, profile);
        if (!cmp.degradation) {
          mapView.renderComparison(cmp);
          const combinedPolyline = [...cmp.shortest.polyline, ...cmp.private.polyline];
          const nearby = camerasNearPolyline(cameraStore.all(), combinedPolyline);
          mapView.setConesAlongRoute(nearby, profile);
        } else {
          mapView.setConesAlongRoute([], profile);
        }
        return cmp;
      },
      onProfileSwap: (newProfile) => {
        onProfileSelected(newProfile);
        if (lastStart && lastEnd) {
          mountPlanner(sidebar, mapView, router, cameraStore, newProfile, onProfileSelected, {
            start: lastStart,
            end: lastEnd,
          });
        } else {
          mountPlanner(sidebar, mapView, router, cameraStore, newProfile, onProfileSelected);
        }
      },
    },
    profile,
    initial,
  );
  mapView.onClick((p) => planner.handleMapClick(p));
}

function camerasNearPolyline(
  cameras: readonly ResolvedCamera[],
  polyline: readonly GeoPoint[],
): ResolvedCamera[] {
  const hits = new Set<string>();
  for (const point of polyline) {
    for (const cam of cameras) {
      if (hits.has(cam.id)) continue;
      const d = CameraStore.distanceMeters(point, { lat: cam.lat, lon: cam.lon });
      if (d <= ROUTE_CONE_RADIUS_M) hits.add(cam.id);
    }
  }
  return cameras.filter((c) => hits.has(c.id));
}

function removeChildrenAfterFirst(el: HTMLElement): void {
  while (el.childNodes.length > 1) el.removeChild(el.lastChild!);
}
