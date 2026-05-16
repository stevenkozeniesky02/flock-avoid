/**
 * The exhaustive list of hosts this app is allowed to contact.
 * Adding to this list is a deliberate change reviewed in PR.
 */
export const ALLOWED_HOSTS: readonly string[] = Object.freeze([
  'localhost:8002', // local Valhalla routing server
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org',
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
