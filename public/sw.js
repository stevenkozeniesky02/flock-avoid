// public/sw.js — Flock-Avoid hand-rolled service worker.
//
// Strategies:
//   navigations + same-origin assets  → app-shell-v{N}      (network-first; cache fallback)
//   tile.openstreetmap.org/**         → osm-tiles-v{N}      (SWR, FIFO-bounded 250)
//   /data /dataset (non-meta)         → dataset-v{N}        (SWR, FIFO-bounded 4)
//   /data /dataset *.meta.json        → dataset-meta-v{N}   (SWR, FIFO-bounded 4)
//   /valhalla, /photon, unknown hosts → pass-through
//
// Privacy posture: the SW never initiates a fetch the page didn't initiate first.
// Routing (/valhalla) and geocoding (/photon) responses are never persisted; their
// URLs and bodies describe where the user is going and what they typed, and a
// cached copy of that history would be the same as a feature we explicitly do not
// ship.
//
// To invalidate every cache from prior versions of the SW: bump CACHE_VERSION below.

/* eslint-env serviceworker */

const CACHE_VERSION = 1;
const APP_SHELL_CACHE = `app-shell-v${CACHE_VERSION}`;
const OSM_TILES_CACHE = `osm-tiles-v${CACHE_VERSION}`;
const DATASET_CACHE = `dataset-v${CACHE_VERSION}`;
const DATASET_META_CACHE = `dataset-meta-v${CACHE_VERSION}`;
const KNOWN_CACHES = new Set([
  APP_SHELL_CACHE,
  OSM_TILES_CACHE,
  DATASET_CACHE,
  DATASET_META_CACHE,
]);

const MAX_TILES = 250;
const MAX_DATASET = 4;

const OSM_TILE_HOST_RE = /^[abc]\.tile\.openstreetmap\.org$/;
const PASS_THROUGH_PATH_EXACT = ['/valhalla', '/photon'];
const PASS_THROUGH_PATH_PREFIXES = ['/valhalla/', '/photon/'];
const DATASET_PATH_PREFIXES = ['/data/', '/dataset/'];

// Mirror of src/pwa/cacheStrategy.ts. Parity is asserted in tests/unit/pwa/serviceWorker.test.ts.
function pickStrategy(url, _accept, sameOrigin) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_e) {
    return 'pass-through';
  }
  if (!sameOrigin) {
    return OSM_TILE_HOST_RE.test(parsed.hostname) ? 'tiles' : 'pass-through';
  }
  const path = parsed.pathname;
  if (
    PASS_THROUGH_PATH_EXACT.indexOf(path) !== -1 ||
    PASS_THROUGH_PATH_PREFIXES.some(function (p) {
      return path.indexOf(p) === 0;
    })
  ) {
    return 'pass-through';
  }
  if (
    DATASET_PATH_PREFIXES.some(function (p) {
      return path.indexOf(p) === 0;
    })
  ) {
    return path.indexOf('.meta.json', path.length - '.meta.json'.length) !== -1
      ? 'dataset-meta'
      : 'dataset';
  }
  return 'app-shell';
}

// Mirror of src/pwa/cacheEviction.ts.
function pickEvictionTargets(keys, max) {
  const overflow = keys.length - max;
  if (overflow <= 0) return [];
  return keys.slice(0, overflow);
}

self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(activate());
});

self.addEventListener('fetch', function (event) {
  handleFetch(event);
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

async function activate() {
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter(function (k) {
        return !KNOWN_CACHES.has(k);
      })
      .map(function (k) {
        return caches.delete(k);
      }),
  );
  if (self.clients && typeof self.clients.claim === 'function') {
    await self.clients.claim();
  }
}

function handleFetch(event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const accept = req.headers && req.headers.get ? req.headers.get('accept') : null;
  const strategy = pickStrategy(req.url, accept, sameOrigin);

  switch (strategy) {
    case 'app-shell':
      event.respondWith(networkFirst(req, APP_SHELL_CACHE));
      return;
    case 'tiles':
      event.respondWith(staleWhileRevalidate(req, OSM_TILES_CACHE, MAX_TILES));
      return;
    case 'dataset':
      event.respondWith(staleWhileRevalidate(req, DATASET_CACHE, MAX_DATASET));
      return;
    case 'dataset-meta':
      event.respondWith(staleWhileRevalidate(req, DATASET_META_CACHE, MAX_DATASET));
      return;
    case 'pass-through':
    default:
      // Do not call respondWith — the browser handles the fetch normally.
      return;
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(req);
    if (response && response.ok) {
      cache.put(req, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then(function (response) {
      // Cache 2xx and opaque (cross-origin no-cors) responses. Opaque has status 0
      // and ok=false, but it's what we get for tile.openstreetmap.org and it's safe
      // to cache; failure modes are visible at fetch time (it never resolves).
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(req, response.clone()).then(function () {
          return trimCache(cache, max);
        });
      }
      return response;
    })
    .catch(function (err) {
      if (cached) return cached;
      throw err;
    });
  return cached || networkPromise;
}

async function trimCache(cache, max) {
  const keys = await cache.keys();
  const targets = pickEvictionTargets(
    keys.map(function (req) {
      return req.url;
    }),
    max,
  );
  const targetSet = new Set(targets);
  await Promise.all(
    keys
      .filter(function (k) {
        return targetSet.has(k.url);
      })
      .map(function (k) {
        return cache.delete(k);
      }),
  );
}
