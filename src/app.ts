import 'maplibre-gl/dist/maplibre-gl.css';
import './brand/tokens.css';
import { MapView } from './ui/mapView';
import { mountSearchBar } from './ui/searchBar';
import { PlannerCard } from './ui/plannerCard';
import { mountFab, mountFabStack } from './ui/fab';
import { mountShowAllConesToggle } from './ui/showAllConesToggle';
import { mountRouteSummaryCard } from './ui/routeSummaryCard';
import { DirectionsPanel } from './ui/directionsPanel';
import { NavigationBanner } from './ui/navigationBanner';
import { NavigationSession } from './nav/navigationSession';
import { renderDatasetFreshness } from './ui/datasetFreshness';
import { renderCameraDetailPopup } from './ui/cameraDetailPopup';
import { mountWelcomeModal, shouldShowWelcomeModal } from './ui/welcomeModal';
import { mountLoadingSkeleton, clearLoadingSkeleton } from './ui/loadingSkeleton';
import { mountErrorBanner } from './ui/errorBanner';
import { LocationMarker } from './ui/locationMarker';
import { CameraStore } from './data/cameraStore';
import { ValhallaClient } from './routing/valhallaClient';
import { Router } from './routing/router';
import { parseDatasetManifest } from './data/datasetManifest';
import { isAllowedUrl } from './privacy/networkAllowlist';
import { PhotonClient } from './geocode/photonClient';
import { zoomForType } from './geocode/zoomForType';
import { LocationStore } from './location/locationStore';
import { COMMUTER_PROFILE } from './domain/threatProfile';
import type { GeoPoint } from './domain/route';
import type { ThreatProfile } from './domain/threatProfile';
import type { ResolvedCamera } from './data/resolvedCamera';
import type { GeocodeResultType } from './geocode/geocodeTypes';

const ATLANTA_CENTER: GeoPoint = { lat: 33.7500, lon: -84.3890 };
const VALHALLA_URL = '/valhalla';
const LOCAL_SEED_URL = '/data/cameras-atlanta-seed.json';
// /dataset is a Vite dev proxy that forwards to the GitHub Release latest URL,
// avoiding the CORS-failing direct browser fetch. In production this URL is
// replaced by a same-origin reverse proxy (Phase 0b-3b deployment).
const RELEASE_DATASET_URL = '/dataset/cameras-us.json';
const MANIFEST_URL_LIVE = '/dataset/cameras-us.json.meta.json';
const CAMERA_DATASET_URL = import.meta.env['VITE_USE_LOCAL_SEED'] === 'true'
  ? LOCAL_SEED_URL
  : RELEASE_DATASET_URL;
const MANIFEST_URL = import.meta.env['VITE_USE_LOCAL_SEED'] === 'true' ? null : MANIFEST_URL_LIVE;
const ROUTE_CONE_RADIUS_M = 200;
const DEFAULT_PROFILE: ThreatProfile = COMMUTER_PROFILE;

export async function startApp(): Promise<void> {
  if (shouldShowWelcomeModal()) {
    await new Promise<void>((resolve) => mountWelcomeModal(document.body, { onDismiss: resolve }));
  }

  const mapEl = document.getElementById('map');
  if (!mapEl) throw new Error('#map missing');
  mapEl.style.position = mapEl.style.position || 'relative';

  mountLoadingSkeleton(mapEl);

  let cameraStore: CameraStore;
  try {
    cameraStore = await CameraStore.loadFromUrl(CAMERA_DATASET_URL);
  } catch (err) {
    clearLoadingSkeleton(mapEl);
    mountErrorBanner(mapEl, err instanceof Error ? err.message : String(err));
    throw err;
  }

  const mapView = new MapView('map', ATLANTA_CENTER);
  mapView.renderCameras(cameraStore.all());

  const photon = new PhotonClient('/photon');
  const locationStore = new LocationStore();
  new LocationMarker(mapEl, mapView.getProjector(), locationStore);
  const router = new Router(new ValhallaClient(VALHALLA_URL), cameraStore, VALHALLA_URL);

  // Camera pin tap → cone + popup
  let popupEl: HTMLElement | null = null;
  const currentProfile: ThreatProfile = DEFAULT_PROFILE;
  let showAllPressed = false;

  mapView.onCameraPinClick((cam) => {
    mapView.setSelectedCameraCone(cam, currentProfile);
    if (popupEl) popupEl.remove();
    popupEl = document.createElement('div');
    popupEl.style.cssText = 'position:absolute;top:var(--space-3);left:var(--space-3);z-index:5';
    mapEl.appendChild(popupEl);
    renderCameraDetailPopup(popupEl, cam, () => {
      mapView.setSelectedCameraCone(null, currentProfile);
      if (popupEl) { popupEl.remove(); popupEl = null; }
    });
  });

  mapView.onMapBackgroundClick(() => {
    if (popupEl) { popupEl.remove(); popupEl = null; }
  });

  // Dataset freshness chip — best-effort manifest fetch
  let manifestGeneratedAt: string | null = null;
  if (MANIFEST_URL) {
    const isRelative = MANIFEST_URL.startsWith('/') || MANIFEST_URL.startsWith('./');
    if (!isRelative && !isAllowedUrl(MANIFEST_URL)) {
      throw new Error(`Manifest URL not in allowlist: ${MANIFEST_URL}`);
    }
    try {
      const resp = await fetch(MANIFEST_URL);
      if (resp.ok) manifestGeneratedAt = parseDatasetManifest(await resp.text()).generatedAt;
    } catch { /* best-effort */ }
  }

  clearLoadingSkeleton(mapEl);

  if (manifestGeneratedAt) {
    renderDatasetFreshness(mapEl, {
      generatedAt: manifestGeneratedAt,
      onRefresh: () => window.location.reload(),
    });
  }

  // FAB stack — cones toggle + recenter
  const fabStack = mountFabStack(mapEl);

  const conesHost = document.createElement('div');
  fabStack.appendChild(conesHost);
  mountShowAllConesToggle(conesHost, {
    onChange: (pressed) => {
      showAllPressed = pressed;
      mapView.setConesAll(pressed ? cameraStore.all() : [], currentProfile);
    },
  });

  const recenterHost = document.createElement('div');
  fabStack.appendChild(recenterHost);
  mountFab(recenterHost, {
    ariaLabel: 'Recenter on my location',
    icon:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
    onClick: () => {
      const pos = locationStore.lastPosition();
      if (pos) mapView.flyTo({ lat: pos.lat, lon: pos.lon }, 15);
      else locationStore.start();
    },
  });

  // Wayfinding chrome: search bar ↔ planner card swap
  let plannerCard: PlannerCard | null = null;
  const plannerHost = document.createElement('div');
  mapEl.appendChild(plannerHost);

  const mountIdleSearchBar = (): void => {
    plannerHost.innerHTML = '';
    mountSearchBar(plannerHost, {
      onActivate: () => mountPlanner(),
      onUseLocation: () => {
        locationStore.start();
        mountPlanner();
      },
    });
  };

  const mountPlanner = (): void => {
    plannerHost.innerHTML = '';
    plannerCard = new PlannerCard(plannerHost, {
      photonClient: photon,
      locationStore,
      onClose: () => {
        if (plannerCard) { plannerCard.destroy(); plannerCard = null; }
        mountIdleSearchBar();
      },
      onCompare: async (start, end) => {
        const cmp = await router.compareRoutes(start, end, currentProfile);
        if (!cmp.degradation) {
          mapView.renderComparison(cmp);
          const combined = [...cmp.shortest.polyline, ...cmp.private.polyline];
          const nearby = camerasNearPolyline(cameraStore.all(), combined);
          mapView.setConesAlongRoute(nearby, currentProfile);

          // surveillanceScore is the per-route exposure value from RouteResult
          const shortestSensors = camerasNearPolyline(cameraStore.all(), cmp.shortest.polyline).length;
          const privateSensors = camerasNearPolyline(cameraStore.all(), cmp.private.polyline).length;
          const originLabel = `${start.lat.toFixed(3)}, ${start.lon.toFixed(3)}`;
          const destinationLabel = `${end.lat.toFixed(3)}, ${end.lon.toFixed(3)}`;
          const summaryComparison = {
            shortest: {
              distanceMeters: cmp.shortest.distanceMeters,
              exposure: cmp.shortest.surveillanceScore,
              sensorsAlong: shortestSensors,
            },
            private: {
              distanceMeters: cmp.private.distanceMeters,
              exposure: cmp.private.surveillanceScore,
              sensorsAlong: privateSensors,
            },
          };

          let selectedRoute: 'shortest' | 'private' = 'private';
          let directionsPanel: DirectionsPanel | null = null;
          let navSession: NavigationSession | null = null;
          let navBanner: NavigationBanner | null = null;
          let activeComparison = cmp;

          const endLiveNavigation = (): void => {
            if (navSession) { navSession.destroy(); navSession = null; }
            if (navBanner) { navBanner.destroy(); navBanner = null; }
            mountSummary();
          };

          // Live navigation is plain follow-the-route + reroute-on-user-drift.
          // The only signal driving reroute decisions is the user's own GeoPosition,
          // surfaced via LocationStore — there is no pursuer/adversary input pathway.
          // See docs/superpowers/specs/2026-05-22-flock-avoid-phase-0b-3b-live-nav.md §1.1.
          const beginLiveNavigation = (kind: 'shortest' | 'private'): void => {
            const summary = mapEl.querySelector('[data-route-summary-card]');
            if (summary) summary.remove();
            if (directionsPanel) { directionsPanel.destroy(); directionsPanel = null; }
            locationStore.start();
            navBanner = new NavigationBanner(mapEl, { onEnd: endLiveNavigation });
            navSession = new NavigationSession({
              initialComparison: activeComparison,
              initialRouteKind: kind,
              threatProfile: currentProfile,
              router,
              locationStore,
              onUpdate: (view) => { if (navBanner) navBanner.update(view); },
              onRouteChanged: (newCmp) => {
                activeComparison = newCmp;
                if (!newCmp.degradation) mapView.renderComparison(newCmp);
              },
              onError: (msg) => { if (navBanner) navBanner.showError(msg); },
            });
            navSession.start();
          };

          const mountSummary = (): void => {
            mountRouteSummaryCard(mapEl, {
              comparison: summaryComparison,
              originLabel,
              destinationLabel,
              profileName: String(currentProfile.preset),
              onSelect: (kind) => {
                selectedRoute = kind;
                if (directionsPanel) directionsPanel.setRoute(kind);
              },
              onStart: () => beginLiveNavigation(selectedRoute),
              onDetails: () => {
                const existingSummary = mapEl.querySelector('[data-route-summary-card]');
                if (existingSummary) existingSummary.remove();
                directionsPanel = new DirectionsPanel(mapEl, {
                  comparison: activeComparison,
                  initialSelectedRoute: selectedRoute,
                  originLabel,
                  destinationLabel,
                  onClose: () => {
                    if (directionsPanel) directionsPanel.destroy();
                    directionsPanel = null;
                    mountSummary();
                  },
                });
              },
            });
          };

          mountSummary();

          // Update show-all cones with new profile if toggled on
          if (showAllPressed) {
            mapView.setConesAll(cameraStore.all(), currentProfile);
          }
        } else {
          mapView.setConesAlongRoute([], currentProfile);
        }
        return cmp;
      },
    });
  };

  // Map-tap when planner is open → fill next empty waypoint
  mapView.onClick((p) => {
    if (!plannerCard) return;
    plannerCard.setOrigin({ lat: p.lat, lon: p.lon, label: `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` });
  });

  mountIdleSearchBar();

  // Geocode result selection → mapView.flyTo
  document.addEventListener('flockavoid:geocode-selected', (e) => {
    const detail = (e as CustomEvent<{ lat: number; lon: number; type: GeocodeResultType }>).detail;
    mapView.flyTo({ lat: detail.lat, lon: detail.lon }, zoomForType(detail.type));
  });
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
