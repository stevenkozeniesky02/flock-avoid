export type CacheStrategy =
  | 'app-shell'
  | 'tiles'
  | 'dataset'
  | 'dataset-meta'
  | 'pass-through';

export interface CacheStrategyInput {
  readonly url: string;
  readonly accept: string | null;
  readonly sameOrigin: boolean;
}

const OSM_TILE_HOST_RE = /^[abc]\.tile\.openstreetmap\.org$/;

const PASS_THROUGH_PATH_PREFIXES: readonly string[] = ['/valhalla/', '/photon/'];
const PASS_THROUGH_PATH_EXACT: readonly string[] = ['/valhalla', '/photon'];

const DATASET_PATH_PREFIXES: readonly string[] = ['/data/', '/dataset/'];

export function pickStrategy(input: CacheStrategyInput): CacheStrategy {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return 'pass-through';
  }

  if (!input.sameOrigin) {
    return OSM_TILE_HOST_RE.test(parsed.hostname) ? 'tiles' : 'pass-through';
  }

  const path = parsed.pathname;

  if (
    PASS_THROUGH_PATH_EXACT.includes(path) ||
    PASS_THROUGH_PATH_PREFIXES.some((p) => path.startsWith(p))
  ) {
    return 'pass-through';
  }

  if (DATASET_PATH_PREFIXES.some((p) => path.startsWith(p))) {
    return path.endsWith('.meta.json') ? 'dataset-meta' : 'dataset';
  }

  return 'app-shell';
}
