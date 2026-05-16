import { createHash } from 'node:crypto';
import type { Camera, CameraType } from '../../src/domain/camera';
import type { RawDeflockRecord } from './fetch-deflock';
import type { RawOsmElement } from './fetch-osm';

export function normalizeDeflock(records: readonly RawDeflockRecord[]): Camera[] {
  const out: Camera[] = [];
  for (const rec of records) {
    const type = deflockTypeFromManufacturer(rec.tags['manufacturer']);
    const direction = parseDirection(rec.tags['direction'] ?? rec.tags['camera:direction']);
    const cam: Camera = {
      id: stableId(rec.lat, rec.lon, type),
      type,
      lat: rec.lat,
      lon: rec.lon,
      confidence: 0.85,
      source: 'deflock',
      ...(direction != null
        ? { direction, directionConfidence: 'known' as const }
        : { directionConfidence: 'unknown' as const }),
      sources: ['deflock'],
    };
    out.push(cam);
  }
  return out;
}

export function normalizeOsm(elements: readonly RawOsmElement[]): Camera[] {
  const out: Camera[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const tags = el.tags ?? {};
    const type = osmTypeFromTags(tags);
    const direction = parseDirection(tags['direction']);
    const cam: Camera = {
      id: stableId(lat, lon, type),
      type,
      lat,
      lon,
      confidence: 0.75,
      source: 'osm',
      ...(direction != null
        ? { direction, directionConfidence: 'known' as const }
        : { directionConfidence: 'unknown' as const }),
      sources: ['osm'],
    };
    out.push(cam);
  }
  return out;
}

/**
 * Map DeFlock's free-text `manufacturer` tag to a CameraType.
 * Known ALPR vendors: Flock, Motorola Vigilant, Rekor, Genetec.
 * Falls back to alpr_government (DeFlock IS the ALPR database, so even
 * unknown vendors there are presumed ALPRs).
 */
function deflockTypeFromManufacturer(manufacturer: string | undefined): CameraType {
  if (!manufacturer) return 'alpr_government';
  const m = manufacturer.toLowerCase().trim();
  if (m.includes('flock')) return 'alpr_government';
  if (m.includes('motorola') || m.includes('vigilant')) return 'alpr_government';
  if (m.includes('rekor')) return 'alpr_government';
  if (m.includes('genetec')) return 'alpr_government';
  return 'alpr_government';
}

function osmTypeFromTags(tags: Readonly<Record<string, string>>): CameraType {
  const t = tags['surveillance:type'] ?? tags['surveillance'];
  if (t === 'ALPR' || t === 'alpr') return 'alpr_government';
  if (t === 'red_light' || t === 'red-light' || t === 'redlight') return 'red_light_camera';
  if (t === 'speed') return 'speed_camera';
  if (t === 'traffic_enforcement' || t === 'traffic') return 'cctv_dot_traffic';
  return 'cctv_municipal';
}

function parseDirection(raw: string | undefined): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return ((n % 360) + 360) % 360;
}

function stableId(lat: number, lon: number, type: CameraType): string {
  const h = createHash('sha1');
  h.update(`${lat.toFixed(5)}|${lon.toFixed(5)}|${type}`);
  return `auto-${h.digest('hex').slice(0, 12)}`;
}
