import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import type { ResolvedCamera } from '../data/resolvedCamera';
import type { GeoPoint, RouteComparison } from '../domain/route';
import type { ThreatProfile } from '../domain/threatProfile';
import { coneForCamera } from '../routing/coneFromProfile';
import { buildConePolygon } from '../routing/conePolygon';

const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

const CAMERA_SOURCE = 'cameras';
const CLUSTER_LAYER = 'cameras-clusters';
const CLUSTER_COUNT_LAYER = 'cameras-cluster-counts';
const POINT_LAYER = 'cameras-points';
const UNKNOWN_BADGE_LAYER = 'cameras-unknown-badge';
const CONES_SELECTED_SOURCE = 'cones-selected';
const CONES_SELECTED_LAYER = 'cones-selected-fill';
const CONES_ROUTE_SOURCE = 'cones-along-route';
const CONES_ROUTE_LAYER = 'cones-along-route-fill';
const CONES_ALL_SOURCE = 'cones-all';
const CONES_ALL_LAYER = 'cones-all-fill';

export class MapView {
  private readonly map: MapLibreMap;
  private clickListener: ((p: GeoPoint) => void) | null = null;
  private cameraPinClickListener: ((cam: ResolvedCamera) => void) | null = null;
  private cameraIndex = new Map<string, ResolvedCamera>();

  constructor(containerId: string, center: GeoPoint) {
    this.map = new maplibregl.Map({
      container: containerId,
      style: OSM_STYLE,
      center: [center.lon, center.lat],
      zoom: 13,
    });
    this.map.on('click', (e) => {
      // If the click landed on a cluster or pin, the layer-specific handlers below run.
      // Otherwise, clear the selected cone and forward the click to the planner.
      const layerIds = [CLUSTER_LAYER, POINT_LAYER].filter((id) => this.map.getLayer(id));
      const features = layerIds.length > 0
        ? this.map.queryRenderedFeatures(e.point, { layers: layerIds })
        : [];
      if (features.length === 0) {
        const src = this.map.getSource(CONES_SELECTED_SOURCE) as maplibregl.GeoJSONSource | undefined;
        if (src) src.setData({ type: 'FeatureCollection', features: [] });
      }
      if (this.clickListener) this.clickListener({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });
  }

  onClick(listener: (p: GeoPoint) => void): void {
    this.clickListener = listener;
  }

  onCameraPinClick(listener: (camera: ResolvedCamera) => void): void {
    this.cameraPinClickListener = listener;
  }

  getCameraById(id: string): ResolvedCamera | undefined {
    return this.cameraIndex.get(id);
  }

  renderCameras(cameras: readonly ResolvedCamera[]): void {
    this.cameraIndex.clear();
    for (const c of cameras) this.cameraIndex.set(c.id, c);

    const features = cameras.map((c) => ({
      type: 'Feature' as const,
      properties: {
        id: c.id,
        type: c.type,
        unknown_direction: c.directionConfidence === 'unknown' ? 1 : 0,
      },
      geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
    }));
    const featureCollection = { type: 'FeatureCollection' as const, features };

    const onStyleLoad = (): void => {
      if (this.map.getSource(CAMERA_SOURCE)) {
        (this.map.getSource(CAMERA_SOURCE) as maplibregl.GeoJSONSource).setData(featureCollection);
        return;
      }
      this.map.addSource(CAMERA_SOURCE, {
        type: 'geojson',
        data: featureCollection,
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 50,
      });
      this.map.addLayer({
        id: CLUSTER_LAYER,
        type: 'circle',
        source: CAMERA_SOURCE,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#3a5fff',
          'circle-radius': ['step', ['get', 'point_count'], 14, 50, 18, 200, 22, 1000, 28],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2.5,
        },
      });
      this.map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: 'symbol',
        source: CAMERA_SOURCE,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 12,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#ffffff' },
      });
      this.map.addLayer({
        id: POINT_LAYER,
        type: 'circle',
        source: CAMERA_SOURCE,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#b91c1c',
          'circle-radius': 5,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      });
      this.map.addLayer({
        id: UNKNOWN_BADGE_LAYER,
        type: 'circle',
        source: CAMERA_SOURCE,
        filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'unknown_direction'], 1]],
        paint: {
          'circle-color': '#f9a825',
          'circle-radius': 3,
          'circle-translate': [6, -6],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        },
      });

      // Empty cone overlay layers, inserted BELOW the point layer so pins remain visible on top.
      const emptyFC = { type: 'FeatureCollection' as const, features: [] };
      for (const [sourceId, layerId] of [
        [CONES_SELECTED_SOURCE, CONES_SELECTED_LAYER],
        [CONES_ROUTE_SOURCE, CONES_ROUTE_LAYER],
        [CONES_ALL_SOURCE, CONES_ALL_LAYER],
      ] as const) {
        if (!this.map.getSource(sourceId)) {
          this.map.addSource(sourceId, { type: 'geojson', data: emptyFC });
          this.map.addLayer(
            {
              id: layerId,
              type: 'fill',
              source: sourceId,
              paint: {
                'fill-color': 'rgba(185, 28, 28, 0.18)',
                'fill-outline-color': 'rgba(185, 28, 28, 0.5)',
              },
            },
            POINT_LAYER,
          );
        }
      }

      // Cluster click → zoom in
      this.map.on('click', CLUSTER_LAYER, (e) => {
        const features = this.map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER] });
        const clusterId = features[0]?.properties?.['cluster_id'];
        if (clusterId == null) return;
        const src = this.map.getSource(CAMERA_SOURCE) as maplibregl.GeoJSONSource;
        src.getClusterExpansionZoom(clusterId).then((zoom) => {
          const coords = (features[0]!.geometry as GeoJSON.Point).coordinates as [number, number];
          this.map.easeTo({ center: coords, zoom });
        }).catch(() => { /* ignore */ });
      });
      // Single pin click
      this.map.on('click', POINT_LAYER, (e) => {
        const f = e.features?.[0];
        const id = f?.properties?.['id'] as string | undefined;
        if (id == null) return;
        const cam = this.cameraIndex.get(id);
        if (cam && this.cameraPinClickListener) this.cameraPinClickListener(cam);
      });
      // Cursor hints
      this.map.on('mouseenter', CLUSTER_LAYER, () => { this.map.getCanvas().style.cursor = 'pointer'; });
      this.map.on('mouseleave', CLUSTER_LAYER, () => { this.map.getCanvas().style.cursor = ''; });
      this.map.on('mouseenter', POINT_LAYER, () => { this.map.getCanvas().style.cursor = 'pointer'; });
      this.map.on('mouseleave', POINT_LAYER, () => { this.map.getCanvas().style.cursor = ''; });
    };

    if (this.map.isStyleLoaded()) {
      onStyleLoad();
    } else {
      this.map.once('load', onStyleLoad);
    }
  }

  renderComparison(cmp: RouteComparison): void {
    this.clearRoutes();
    this.addRouteLayer('shortest', cmp.shortest.polyline, '#b91c1c', true);
    if (!cmp.degradation) {
      this.addRouteLayer('private', cmp.private.polyline, '#15803d', false);
    }
    new maplibregl.Marker({ color: '#3a5fff' }).setLngLat([cmp.start.lon, cmp.start.lat]).addTo(this.map);
    new maplibregl.Marker({ color: '#3a5fff' }).setLngLat([cmp.end.lon, cmp.end.lat]).addTo(this.map);
  }

  /** Render a single camera's cone overlay (used when a pin is tapped). Clears when called with null. */
  setSelectedCameraCone(camera: ResolvedCamera | null, profile: ThreatProfile): void {
    this.setConeLayerData(CONES_SELECTED_SOURCE, camera ? [camera] : [], profile);
  }

  /** Render cones for cameras within range of the planned route. */
  setConesAlongRoute(cameras: readonly ResolvedCamera[], profile: ThreatProfile): void {
    this.setConeLayerData(CONES_ROUTE_SOURCE, cameras, profile);
  }

  /** Render cones for every camera passed in (the "show all" power-user toggle). */
  setConesAll(cameras: readonly ResolvedCamera[], profile: ThreatProfile): void {
    this.setConeLayerData(CONES_ALL_SOURCE, cameras, profile);
  }

  private setConeLayerData(
    sourceId: string,
    cameras: readonly ResolvedCamera[],
    profile: ThreatProfile,
  ): void {
    const src = this.map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const features: GeoJSON.Feature[] = [];
    for (const cam of cameras) {
      const params = coneForCamera(cam, profile, () => Infinity);
      if (params === null) continue;
      const ring = buildConePolygon(params);
      features.push({
        type: 'Feature',
        properties: { id: cam.id },
        geometry: {
          type: 'Polygon',
          coordinates: [ring.map(([lon, lat]) => [lon, lat] as [number, number])],
        },
      });
    }
    src.setData({ type: 'FeatureCollection', features });
  }

  private addRouteLayer(id: string, polyline: readonly GeoPoint[], color: string, dashed: boolean): void {
    const sourceId = `route-${id}`;
    const layerId = `route-${id}-line`;
    this.map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: polyline.map((p) => [p.lon, p.lat]) },
      },
    });
    this.map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': color,
        'line-width': 5,
        ...(dashed ? { 'line-dasharray': [2, 2] } : {}),
      },
    });
  }

  private clearRoutes(): void {
    for (const id of ['shortest', 'private']) {
      const layerId = `route-${id}-line`;
      const sourceId = `route-${id}`;
      if (this.map.getLayer(layerId)) this.map.removeLayer(layerId);
      if (this.map.getSource(sourceId)) this.map.removeSource(sourceId);
    }
  }
}
