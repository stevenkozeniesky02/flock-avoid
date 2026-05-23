/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NavigationSession } from '../../../src/nav/navigationSession';
import type { RouteComparison, RouteResult, GeoPoint } from '../../../src/domain/route';
import type { RouteManeuver } from '../../../src/domain/maneuver';
import type { LocationStore, LocationState } from '../../../src/location/locationStore';
import type { Router } from '../../../src/routing/router';
import { COMMUTER_PROFILE } from '../../../src/domain/threatProfile';

function maneuver(over: Partial<RouteManeuver>): RouteManeuver {
  return {
    kind: 'continue',
    instruction: '',
    streetNames: [],
    distanceMeters: 0,
    durationSeconds: 0,
    beginShapeIndex: 0,
    endShapeIndex: 0,
    rawValhallaType: 8,
    ...over,
  };
}

const POLYLINE: readonly GeoPoint[] = [
  { lat: 33.75, lon: -84.40 },
  { lat: 33.75, lon: -84.39 },
  { lat: 33.75, lon: -84.38 },
  { lat: 33.75, lon: -84.37 },
];

const MANEUVERS: readonly RouteManeuver[] = [
  maneuver({ kind: 'depart', instruction: 'Depart', distanceMeters: 1000, durationSeconds: 60, beginShapeIndex: 0, endShapeIndex: 1, rawValhallaType: 1 }),
  maneuver({ kind: 'right', instruction: 'Turn right', distanceMeters: 1000, durationSeconds: 60, beginShapeIndex: 1, endShapeIndex: 2, rawValhallaType: 10 }),
  maneuver({ kind: 'left', instruction: 'Turn left', distanceMeters: 1000, durationSeconds: 60, beginShapeIndex: 2, endShapeIndex: 3, rawValhallaType: 15 }),
  maneuver({ kind: 'arrive', instruction: 'Arrive', distanceMeters: 0, durationSeconds: 0, beginShapeIndex: 3, endShapeIndex: 3, rawValhallaType: 4 }),
];

function makeRoute(over: Partial<RouteResult> = {}): RouteResult {
  return {
    polyline: POLYLINE,
    distanceMeters: 3000,
    durationSeconds: 180,
    camerasOnRoute: 0,
    surveillanceScore: 0,
    maneuvers: MANEUVERS,
    ...over,
  };
}

function makeComparison(over: Partial<RouteComparison> = {}): RouteComparison {
  const r = makeRoute();
  return {
    start: POLYLINE[0]!,
    end: POLYLINE[POLYLINE.length - 1]!,
    shortest: r,
    private: r,
    diff: { extraSeconds: 0, extraMeters: 0, camerasAvoided: 0 },
    ...over,
  };
}

class FakeLocationStore {
  private listener: ((s: LocationState) => void) | null = null;
  startCalls = 0;
  start(): void {
    this.startCalls += 1;
  }
  subscribe(cb: (s: LocationState) => void): () => void {
    this.listener = cb;
    return () => { this.listener = null; };
  }
  emit(p: GeoPoint, accuracy = 10, ts = 0): void {
    if (!this.listener) return;
    this.listener({
      status: 'tracking',
      position: { lat: p.lat, lon: p.lon, accuracyMeters: accuracy, timestamp: ts },
    });
  }
}

interface Harness {
  session: NavigationSession;
  store: FakeLocationStore;
  router: { compareRoutes: ReturnType<typeof vi.fn> };
  onUpdate: ReturnType<typeof vi.fn>;
  onRouteChanged: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
  setNow: (ms: number) => void;
}

function setup(comparison = makeComparison()): Harness {
  const store = new FakeLocationStore();
  const router = { compareRoutes: vi.fn() };
  const onUpdate = vi.fn();
  const onRouteChanged = vi.fn();
  const onError = vi.fn();
  let nowMs = 0;
  const setNow = (ms: number) => { nowMs = ms; };
  const session = new NavigationSession({
    initialComparison: comparison,
    initialRouteKind: 'private',
    threatProfile: COMMUTER_PROFILE,
    router: router as unknown as Router,
    locationStore: store as unknown as LocationStore,
    onUpdate,
    onRouteChanged,
    onError,
    now: () => nowMs,
  });
  return { session, store, router, onUpdate, onRouteChanged, onError, setNow };
}

describe('NavigationSession', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to the location store on start()', () => {
    const h = setup();
    const subscribeSpy = vi.spyOn(h.store, 'subscribe');
    h.session.start();
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('emits an initial view at the start position with active maneuver 0', () => {
    const h = setup();
    h.session.start();
    h.session.feedPosition(POLYLINE[0]!);
    expect(h.onUpdate).toHaveBeenCalled();
    const view = h.onUpdate.mock.calls.at(-1)![0];
    expect(view.activeRouteKind).toBe('private');
    expect(view.activeManeuverIdx).toBe(0);
    expect(view.nextManeuverInstruction).toBe('Turn right');
    expect(view.distanceOffRouteMeters).toBeLessThan(5);
    expect(view.isRerouting).toBe(false);
    expect(view.hasArrived).toBe(false);
  });

  it('advances the maneuver pointer when the user passes a shape index', () => {
    const h = setup();
    h.session.start();
    h.session.feedPosition(POLYLINE[1]!);
    const view = h.onUpdate.mock.calls.at(-1)![0];
    expect(view.activeManeuverIdx).toBe(1);
    expect(view.nextManeuverInstruction).toBe('Turn left');
  });

  it('does not move the maneuver index backwards on the same feed', () => {
    const h = setup();
    h.session.start();
    h.session.feedPosition(POLYLINE[2]!);
    expect(h.onUpdate.mock.calls.at(-1)![0].activeManeuverIdx).toBe(2);
    h.session.feedPosition(POLYLINE[1]!);
    expect(h.onUpdate.mock.calls.at(-1)![0].activeManeuverIdx).toBe(2);
  });

  it('reports off-route distance without triggering a reroute below the threshold', async () => {
    const h = setup();
    h.session.start();
    const offBy30: GeoPoint = { lat: 33.7503, lon: -84.39 }; // ~33 m north
    h.setNow(0);
    h.session.feedPosition(offBy30);
    h.setNow(10_000);
    h.session.feedPosition(offBy30);
    expect(h.router.compareRoutes).not.toHaveBeenCalled();
    expect(h.onUpdate.mock.calls.at(-1)![0].distanceOffRouteMeters).toBeGreaterThan(20);
  });

  it('does not reroute if off-route briefly then returns', () => {
    const h = setup();
    h.session.start();
    const farOff: GeoPoint = { lat: 33.752, lon: -84.39 }; // ~220 m north
    h.setNow(0);
    h.session.feedPosition(farOff);
    h.setNow(2000);
    h.session.feedPosition(POLYLINE[0]!); // back on
    h.setNow(10_000);
    h.session.feedPosition(POLYLINE[0]!);
    expect(h.router.compareRoutes).not.toHaveBeenCalled();
  });

  it('reroutes once after persistent off-route distance, then updates the active route', async () => {
    const h = setup();
    const newCmp = makeComparison({ shortest: makeRoute({ durationSeconds: 200 }), private: makeRoute({ durationSeconds: 200 }) });
    h.router.compareRoutes.mockResolvedValueOnce(newCmp);

    h.session.start();
    const farOff: GeoPoint = { lat: 33.752, lon: -84.39 }; // far north of the line
    h.setNow(0);
    h.session.feedPosition(farOff);
    h.setNow(6000);
    h.session.feedPosition(farOff);

    // Allow the reroute promise chain to settle.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(h.router.compareRoutes).toHaveBeenCalledTimes(1);
    const args = h.router.compareRoutes.mock.calls[0]!;
    expect(args[0]).toMatchObject({ lat: expect.any(Number), lon: expect.any(Number) });
    expect(args[1]).toEqual(POLYLINE[POLYLINE.length - 1]);
    expect(args[2]).toBe(COMMUTER_PROFILE);
    expect(h.onRouteChanged).toHaveBeenCalledWith(newCmp, 'private');
  });

  it('respects the reroute cooldown', async () => {
    const h = setup();
    const newCmp = makeComparison();
    h.router.compareRoutes.mockResolvedValue(newCmp);

    h.session.start();
    const farOff: GeoPoint = { lat: 33.752, lon: -84.39 };
    h.setNow(0);
    h.session.feedPosition(farOff);
    h.setNow(6000);
    h.session.feedPosition(farOff);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(h.router.compareRoutes).toHaveBeenCalledTimes(1);

    // Within cooldown window
    h.setNow(8000);
    h.session.feedPosition(farOff);
    h.setNow(14_000);
    h.session.feedPosition(farOff);
    expect(h.router.compareRoutes).toHaveBeenCalledTimes(1);

    // Past cooldown — feed enough off-route persistence again
    h.setNow(20_000);
    h.session.feedPosition(farOff);
    h.setNow(26_000);
    h.session.feedPosition(farOff);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(h.router.compareRoutes).toHaveBeenCalledTimes(2);
  });

  it('surfaces reroute failures via onError without replacing the active route', async () => {
    const h = setup();
    h.router.compareRoutes.mockRejectedValueOnce(new Error('valhalla blew up'));

    h.session.start();
    const farOff: GeoPoint = { lat: 33.752, lon: -84.39 };
    h.setNow(0);
    h.session.feedPosition(farOff);
    h.setNow(6000);
    h.session.feedPosition(farOff);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(h.onError).toHaveBeenCalled();
    expect(h.onRouteChanged).not.toHaveBeenCalled();
    const view = h.onUpdate.mock.calls.at(-1)![0];
    expect(view.isRerouting).toBe(false);
  });

  it('marks hasArrived when the user is within the arrival radius', () => {
    const h = setup();
    h.session.start();
    h.session.feedPosition(POLYLINE[POLYLINE.length - 1]!);
    const view = h.onUpdate.mock.calls.at(-1)![0];
    expect(view.hasArrived).toBe(true);
  });

  it('destroy() detaches from the location store', () => {
    const h = setup();
    h.session.start();
    h.session.destroy();
    h.store.emit(POLYLINE[1]!);
    const calls = h.onUpdate.mock.calls.length;
    h.store.emit(POLYLINE[2]!);
    expect(h.onUpdate.mock.calls.length).toBe(calls);
  });

  describe('hard product line — pursuit-evasion guardrail', () => {
    it('does not expose any method whose name resembles adversary tracking', () => {
      const methods = Object.getOwnPropertyNames(NavigationSession.prototype);
      const FORBIDDEN = ['adversary', 'pursuer', 'follower', 'tail', 'evade', 'evasion', 'suspect'];
      for (const m of methods) {
        for (const f of FORBIDDEN) {
          expect(m.toLowerCase()).not.toContain(f);
        }
      }
    });

    it('the only public mutation entry point accepts a single GeoPoint argument', () => {
      expect(NavigationSession.prototype.feedPosition.length).toBe(1);
    });

    it('the public constructor option for the position source is a LocationStore (no adversary input)', () => {
      // Construction succeeds with only a single LocationStore as the position source.
      // If a "pursuer" parameter ever gets added, this test will need to be amended,
      // forcing a re-read of the hard product line in the spec.
      const h = setup();
      h.session.start();
      h.session.feedPosition(POLYLINE[0]!);
      expect(h.onUpdate).toHaveBeenCalled();
    });
  });
});
