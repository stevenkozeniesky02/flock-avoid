import maplibregl, { type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl';
import type { ResolvedCamera } from '../data/resolvedCamera';
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

  renderCameras(cameras: readonly ResolvedCamera[]): void {
    for (const c of cameras) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'position:relative;width:14px;height:14px';

      const dot = document.createElement('div');
      dot.style.cssText =
        'width:10px;height:10px;border-radius:50%;background:#d32f2f;border:2px solid #fff;' +
        'box-shadow:0 0 2px rgba(0,0,0,.5);position:absolute;left:2px;top:2px';
      wrap.appendChild(dot);

      if (c.directionConfidence === 'unknown') {
        const badge = document.createElement('div');
        badge.textContent = '?';
        badge.title = 'Direction unknown — contribute corrected data to DeFlock/OSM';
        badge.style.cssText =
          'position:absolute;top:-6px;right:-6px;width:12px;height:12px;border-radius:50%;' +
          'background:#f9a825;color:#fff;font-size:10px;font-weight:700;line-height:12px;' +
          'text-align:center;border:1px solid #fff';
        wrap.appendChild(badge);
      }

      wrap.title = `${c.type} (${c.id})${c.directionConfidence === 'unknown' ? ' — direction unknown' : ''}`;
      new maplibregl.Marker({ element: wrap }).setLngLat([c.lon, c.lat]).addTo(this.map);
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
