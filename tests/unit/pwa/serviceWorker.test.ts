import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { pickStrategy } from '../../../src/pwa/cacheStrategy';

const HERE = dirname(fileURLToPath(import.meta.url));
const SW_PATH = resolve(HERE, '..', '..', '..', 'public', 'sw.js');

const SW_ORIGIN = 'https://app.local';

interface CapturedEvent {
  readonly type: string;
  readonly handler: (event: unknown) => void;
}

interface FetchEventStub {
  readonly request: Request;
  respondWith: (p: Promise<Response> | Response) => void;
  waitUntil: (p: Promise<unknown> | unknown) => void;
  _respondedWith: Promise<Response> | Response | null;
  _waited: Array<Promise<unknown> | unknown>;
}

interface Sandbox {
  readonly events: CapturedEvent[];
  readonly stubCaches: StubCaches;
  fetchImpl: (req: Request) => Promise<Response>;
  skipWaitingCalled: number;
  claimCalled: number;
  invokeInstall(): Promise<void>;
  invokeActivate(): Promise<void>;
  invokeFetch(req: Request): FetchEventStub;
  invokeMessage(data: unknown): void;
}

class StubCache {
  readonly entries = new Map<string, Response>();
  readonly insertionOrder: string[] = [];

  async match(req: Request): Promise<Response | undefined> {
    return this.entries.get(req.url);
  }
  async put(req: Request, res: Response): Promise<void> {
    if (!this.entries.has(req.url)) this.insertionOrder.push(req.url);
    this.entries.set(req.url, res);
  }
  async keys(): Promise<Array<{ url: string }>> {
    return this.insertionOrder.map((url) => ({ url }));
  }
  async delete(req: { url: string }): Promise<boolean> {
    const had = this.entries.delete(req.url);
    const i = this.insertionOrder.indexOf(req.url);
    if (i !== -1) this.insertionOrder.splice(i, 1);
    return had;
  }
}

class StubCaches {
  readonly stores = new Map<string, StubCache>();
  async open(name: string): Promise<StubCache> {
    let store = this.stores.get(name);
    if (!store) {
      store = new StubCache();
      this.stores.set(name, store);
    }
    return store;
  }
  async keys(): Promise<string[]> {
    return Array.from(this.stores.keys());
  }
  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name);
  }
  async match(req: Request): Promise<Response | undefined> {
    for (const store of this.stores.values()) {
      const hit = await store.match(req);
      if (hit) return hit;
    }
    return undefined;
  }
}

function loadServiceWorker(): Sandbox {
  const code = readFileSync(SW_PATH, 'utf8');
  const events: CapturedEvent[] = [];
  const stubCaches = new StubCaches();

  const sandbox: {
    self: Record<string, unknown>;
    caches: StubCaches;
    fetch: (req: Request) => Promise<Response>;
    URL: typeof URL;
    Set: typeof Set;
    Promise: typeof Promise;
    console: Console;
  } = {
    self: {
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        events.push({ type, handler });
      },
      skipWaiting: async () => {
        s.skipWaitingCalled++;
      },
      clients: {
        claim: async () => {
          s.claimCalled++;
        },
      },
      location: { origin: SW_ORIGIN } as Location,
    },
    caches: stubCaches,
    fetch: (req) => s.fetchImpl(req),
    URL,
    Set,
    Promise,
    console,
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'public/sw.js' });

  const s: Sandbox = {
    events,
    stubCaches,
    fetchImpl: async () => new Response('default'),
    skipWaitingCalled: 0,
    claimCalled: 0,
    async invokeInstall() {
      const ev = events.find((e) => e.type === 'install');
      if (!ev) throw new Error('install handler not registered');
      const promises: unknown[] = [];
      ev.handler({ waitUntil: (p: unknown) => promises.push(p) });
      await Promise.all(promises);
    },
    async invokeActivate() {
      const ev = events.find((e) => e.type === 'activate');
      if (!ev) throw new Error('activate handler not registered');
      const promises: unknown[] = [];
      ev.handler({ waitUntil: (p: unknown) => promises.push(p) });
      await Promise.all(promises);
    },
    invokeFetch(req: Request) {
      const ev = events.find((e) => e.type === 'fetch');
      if (!ev) throw new Error('fetch handler not registered');
      const stub: FetchEventStub = {
        request: req,
        _respondedWith: null,
        _waited: [],
        respondWith(p) {
          this._respondedWith = p;
        },
        waitUntil(p) {
          this._waited.push(p);
        },
      };
      ev.handler(stub);
      return stub;
    },
    invokeMessage(data) {
      const ev = events.find((e) => e.type === 'message');
      if (!ev) throw new Error('message handler not registered');
      ev.handler({ data });
    },
  };
  return s;
}

function makeRequest(
  url: string,
  init: { method?: string; accept?: string } = {},
): Request {
  return new Request(url, {
    method: init.method ?? 'GET',
    headers: init.accept ? { accept: init.accept } : {},
  });
}

describe('public/sw.js — hand-rolled service worker', () => {
  let s: Sandbox;
  beforeEach(() => {
    s = loadServiceWorker();
  });

  describe('install handler', () => {
    it('calls skipWaiting and does not precache anything', async () => {
      await s.invokeInstall();
      expect(s.skipWaitingCalled).toBe(1);
      expect(s.stubCaches.stores.size).toBe(0);
    });
  });

  describe('activate handler', () => {
    it('deletes caches whose names are not in the current-version set; keeps known ones', async () => {
      await s.stubCaches.open('app-shell-v0');
      await s.stubCaches.open('osm-tiles-v0');
      await s.stubCaches.open('app-shell-v1');
      await s.stubCaches.open('osm-tiles-v1');
      await s.stubCaches.open('dataset-v1');
      await s.stubCaches.open('dataset-meta-v1');
      await s.stubCaches.open('random-other-cache');

      await s.invokeActivate();

      const remaining = Array.from(s.stubCaches.stores.keys()).sort();
      expect(remaining).toEqual([
        'app-shell-v1',
        'dataset-meta-v1',
        'dataset-v1',
        'osm-tiles-v1',
      ]);
      expect(s.claimCalled).toBe(1);
    });
  });

  describe('fetch handler — app-shell network-first', () => {
    it('serves the network response and writes it to cache on success', async () => {
      const req = makeRequest(`${SW_ORIGIN}/`, { accept: 'text/html' });
      s.fetchImpl = async () => new Response('<!doctype html>', { status: 200 });
      const ev = s.invokeFetch(req);
      const res = await (ev._respondedWith as Promise<Response>);
      expect(await res.text()).toBe('<!doctype html>');
      const cache = await s.stubCaches.open('app-shell-v1');
      expect(cache.entries.has(req.url)).toBe(true);
    });

    it('falls back to the cached response when the network throws', async () => {
      const req = makeRequest(`${SW_ORIGIN}/`, { accept: 'text/html' });
      const cache = await s.stubCaches.open('app-shell-v1');
      await cache.put(req, new Response('<!doctype html>cached', { status: 200 }));
      s.fetchImpl = async () => {
        throw new Error('offline');
      };
      const ev = s.invokeFetch(req);
      const res = await (ev._respondedWith as Promise<Response>);
      expect(await res.text()).toBe('<!doctype html>cached');
    });
  });

  describe('fetch handler — tile cache stale-while-revalidate + bounded eviction', () => {
    it('caches a tile response on first miss', async () => {
      const req = makeRequest('https://a.tile.openstreetmap.org/14/8763/5350.png');
      s.fetchImpl = async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      const ev = s.invokeFetch(req);
      await (ev._respondedWith as Promise<Response>);
      const cache = await s.stubCaches.open('osm-tiles-v1');
      // Allow the background put/trim to settle.
      await new Promise((r) => setTimeout(r, 5));
      expect(cache.entries.has(req.url)).toBe(true);
    });

    it('trims to MAX_TILES (250) when one over bound after a new fill', async () => {
      const cache = await s.stubCaches.open('osm-tiles-v1');
      for (let i = 0; i < 250; i++) {
        const u = `https://a.tile.openstreetmap.org/14/${i}/0.png`;
        await cache.put(makeRequest(u), new Response('seed'));
      }
      const oldest = cache.insertionOrder[0];

      const newReq = makeRequest('https://a.tile.openstreetmap.org/14/9999/0.png');
      s.fetchImpl = async () => new Response('new', { status: 200 });
      const ev = s.invokeFetch(newReq);
      await (ev._respondedWith as Promise<Response>);
      await new Promise((r) => setTimeout(r, 10));

      expect(cache.entries.has(newReq.url)).toBe(true);
      expect(cache.entries.size).toBe(250);
      expect(oldest).toBeDefined();
      expect(cache.entries.has(oldest as string)).toBe(false);
    });
  });

  describe('fetch handler — pass-through', () => {
    it('does NOT respondWith for /valhalla', () => {
      const req = makeRequest(`${SW_ORIGIN}/valhalla/route`);
      const ev = s.invokeFetch(req);
      expect(ev._respondedWith).toBeNull();
    });

    it('does NOT respondWith for /photon', () => {
      const req = makeRequest(`${SW_ORIGIN}/photon/api?q=krog`);
      const ev = s.invokeFetch(req);
      expect(ev._respondedWith).toBeNull();
    });

    it('does NOT respondWith for an unknown cross-origin host', () => {
      const req = makeRequest('https://example.com/foo');
      const ev = s.invokeFetch(req);
      expect(ev._respondedWith).toBeNull();
    });

    it('does NOT respondWith for a non-GET method (browser handles unmodified)', () => {
      const req = makeRequest(`${SW_ORIGIN}/`, { method: 'POST' });
      const ev = s.invokeFetch(req);
      expect(ev._respondedWith).toBeNull();
    });
  });

  describe('message handler', () => {
    it('responds to { type: "SKIP_WAITING" } by calling skipWaiting', () => {
      s.invokeMessage({ type: 'SKIP_WAITING' });
      expect(s.skipWaitingCalled).toBe(1);
    });

    it('ignores unknown message types', () => {
      s.invokeMessage({ type: 'NOT_REAL' });
      s.invokeMessage(null);
      expect(s.skipWaitingCalled).toBe(0);
    });
  });

  describe('parity with src/pwa/cacheStrategy.ts', () => {
    // Re-load the SW so its internal pickStrategy is accessible via behavior.
    // We can't easily expose the SW's local function, so we assert agreement
    // by feeding URLs through the fetch handler and inspecting whether they
    // result in respondWith (which the TS helper would predict from strategy).
    it.each([
      [`${SW_ORIGIN}/`, 'text/html', true, 'app-shell'],
      [`${SW_ORIGIN}/assets/index-abc.js`, '*/*', true, 'app-shell'],
      [`${SW_ORIGIN}/data/cameras-atlanta-seed.json`, '*/*', true, 'dataset'],
      [`${SW_ORIGIN}/dataset/cameras-us.json.meta.json`, '*/*', true, 'dataset-meta'],
      ['https://a.tile.openstreetmap.org/1/2/3.png', 'image/png', false, 'tiles'],
      [`${SW_ORIGIN}/valhalla/route`, 'application/json', true, 'pass-through'],
      [`${SW_ORIGIN}/photon/api`, 'application/json', true, 'pass-through'],
      ['https://example.com/foo', '*/*', false, 'pass-through'],
    ])('TS and SW agree on %s → %s', (url, accept, sameOrigin, strategy) => {
      const tsResult = pickStrategy({
        url: url as string,
        accept: accept as string,
        sameOrigin: sameOrigin as boolean,
      });
      expect(tsResult).toBe(strategy);

      // SW behavioral mirror: pass-through means respondWith not called.
      s.fetchImpl = async () => new Response('ok', { status: 200 });
      const ev = s.invokeFetch(makeRequest(url as string, { accept: accept as string }));
      const shouldRespond = (strategy as string) !== 'pass-through';
      if (shouldRespond) {
        expect(ev._respondedWith).not.toBeNull();
      } else {
        expect(ev._respondedWith).toBeNull();
      }
    });
  });
});
