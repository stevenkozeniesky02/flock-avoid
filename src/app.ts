import { MapView } from './ui/mapView';
import { renderProfilePicker } from './ui/profilePicker';
import { RoutePlanner } from './ui/routePlanner';
import { CameraStore } from './data/cameraStore';
import { ValhallaClient } from './routing/valhallaClient';
import { Router } from './routing/router';
import type { GeoPoint } from './domain/route';
import type { ThreatProfile } from './domain/threatProfile';

const ATLANTA_CENTER: GeoPoint = { lat: 33.7500, lon: -84.3890 };
const VALHALLA_URL = 'http://localhost:8002';
const CAMERA_DATASET_URL = '/data/cameras-atlanta-seed.json';

export async function startApp(): Promise<void> {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) throw new Error('#sidebar missing');

  const cameraStore = await CameraStore.loadFromUrl(CAMERA_DATASET_URL);
  const mapView = new MapView('map', ATLANTA_CENTER);
  mapView.renderCameras(cameraStore.all());
  const router = new Router(new ValhallaClient(VALHALLA_URL), cameraStore);

  renderProfilePicker(sidebar, (profile) => mountPlanner(sidebar, mapView, router, profile));
}

function mountPlanner(
  sidebar: HTMLElement,
  mapView: MapView,
  router: Router,
  profile: ThreatProfile,
): void {
  sidebar.innerHTML = '';
  const planner = new RoutePlanner(sidebar, {
    onPlanRequested: async (start, end) => {
      const cmp = await router.compareRoutes(start, end, profile);
      mapView.renderComparison(cmp);
      return cmp;
    },
  }, profile);
  mapView.onClick((p) => planner.handleMapClick(p));
}
