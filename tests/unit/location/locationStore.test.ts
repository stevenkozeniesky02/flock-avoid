/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocationStore } from '../../../src/location/locationStore';

function fakeGeolocation(): {
  watchPosition: ReturnType<typeof vi.fn>;
  clearWatch: ReturnType<typeof vi.fn>;
  fire(pos: { lat: number; lon: number; acc: number }): void;
  fail(code: number): void;
} {
  let success: PositionCallback | null = null;
  let error: PositionErrorCallback | null = null;
  const watchPosition = vi.fn((s: PositionCallback, e: PositionErrorCallback) => {
    success = s; error = e; return 42;
  });
  const clearWatch = vi.fn();
  return {
    watchPosition, clearWatch,
    fire(pos) {
      success?.({
        coords: { latitude: pos.lat, longitude: pos.lon, accuracy: pos.acc,
          altitude: null, altitudeAccuracy: null, heading: null, speed: null,
          toJSON: () => ({}) },
        timestamp: 1700000000000,
        toJSON: () => ({}),
      } as GeolocationPosition);
    },
    fail(code) {
      error?.({ code, message: 'fake', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    },
  };
}

describe('LocationStore', () => {
  let geo: ReturnType<typeof fakeGeolocation>;
  beforeEach(() => {
    geo = fakeGeolocation();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true, value: { watchPosition: geo.watchPosition, clearWatch: geo.clearWatch, getCurrentPosition: vi.fn() },
    });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('starts in idle state', () => {
    const s = new LocationStore();
    expect(s.state.status).toBe('idle');
    expect(s.lastPosition()).toBeNull();
  });

  it('transitions idle → pending → tracking on successful start + fix', () => {
    const s = new LocationStore();
    const seen: string[] = [];
    s.subscribe((st) => seen.push(st.status));
    s.start();
    expect(geo.watchPosition).toHaveBeenCalledOnce();
    expect(s.state.status).toBe('pending');
    geo.fire({ lat: 33.7501, lon: -84.389, acc: 12 });
    expect(s.state.status).toBe('tracking');
    expect(s.lastPosition()).toMatchObject({ lat: 33.7501, lon: -84.389, accuracyMeters: 12 });
    expect(seen).toEqual(['pending', 'tracking']);
  });

  it('transitions to denied on PERMISSION_DENIED', () => {
    const s = new LocationStore();
    s.start();
    geo.fail(1);
    expect(s.state.status).toBe('denied');
  });

  it('transitions to unavailable on POSITION_UNAVAILABLE', () => {
    const s = new LocationStore();
    s.start();
    geo.fail(2);
    expect(s.state.status).toBe('unavailable');
  });

  it('start() is idempotent — does not re-watch', () => {
    const s = new LocationStore();
    s.start(); s.start(); s.start();
    expect(geo.watchPosition).toHaveBeenCalledOnce();
  });

  it('stop() clears the watch and returns to idle', () => {
    const s = new LocationStore();
    s.start();
    geo.fire({ lat: 1, lon: 2, acc: 5 });
    s.stop();
    expect(geo.clearWatch).toHaveBeenCalledWith(42);
    expect(s.state.status).toBe('idle');
  });

  it('subscribe() returns an unsubscribe fn', () => {
    const s = new LocationStore();
    const cb = vi.fn();
    const unsub = s.subscribe(cb);
    s.start();
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    geo.fire({ lat: 0, lon: 0, acc: 1 });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('state object is replaced on update (immutability)', () => {
    const s = new LocationStore();
    const before = s.state;
    s.start();
    expect(s.state).not.toBe(before);
  });
});
