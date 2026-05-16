import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import type { Camera } from '../domain/camera';
import type { GeoPoint, RouteComparison } from '../domain/route';

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

export class MapView {
  private readonly map: MapLibreMap;
  private clickListener: ((p: GeoPoint) => void) | null = null;

  constructor(containerId: string, center: GeoPoint) {
    this.map = new maplibregl.Map({
      container: containerId,
      style: OSM_STYLE,
      center: [center.lon, center.lat],
      zoom: 13,
    });
    this.map.on('click', (e) => {
      if (this.clickListener) this.clickListener({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });
  }

  onClick(listener: (p: GeoPoint) => void): void {
    this.clickListener = listener;
  }

  renderCameras(cameras: readonly Camera[]): void {
    for (const c of cameras) {
      const el = document.createElement('div');
      el.style.cssText =
        'width:10px;height:10px;border-radius:50%;background:#d32f2f;border:2px solid #fff;box-shadow:0 0 2px rgba(0,0,0,.5)';
      el.title = `${c.type} (${c.id})`;
      new maplibregl.Marker({ element: el }).setLngLat([c.lon, c.lat]).addTo(this.map);
    }
  }

  renderComparison(cmp: RouteComparison): void {
    this.clearRoutes();
    this.addRouteLayer('shortest', cmp.shortest.polyline, '#d32f2f', true);
    this.addRouteLayer('private', cmp.private.polyline, '#2e7d32', false);

    new maplibregl.Marker({ color: '#1976d2' }).setLngLat([cmp.start.lon, cmp.start.lat]).addTo(this.map);
    new maplibregl.Marker({ color: '#1976d2' }).setLngLat([cmp.end.lon, cmp.end.lat]).addTo(this.map);
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
