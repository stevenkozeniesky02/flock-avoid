/**
 * The exhaustive list of hosts this app is allowed to contact.
 * Adding to this list is a deliberate change reviewed in PR.
 */
export const ALLOWED_HOSTS: readonly string[] = Object.freeze([
  'localhost:8002', // local Valhalla routing server
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
  'github.com',
  'objects.githubusercontent.com',     // legacy GH release-asset CDN
  'release-assets.githubusercontent.com', // current GH release-asset CDN (verified 2026-05-16)
  'photon.komoot.io',                  // Photon geocoder (Phase 0b-3b)
]);

export function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const hostPort = u.port ? `${u.hostname}:${u.port}` : u.hostname;
    return ALLOWED_HOSTS.includes(hostPort) || ALLOWED_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}
