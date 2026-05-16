export interface GeoPosition {
  readonly lat: number;
  readonly lon: number;
  readonly accuracyMeters: number;
  readonly timestamp: number;
}

export type LocationState =
  | { readonly status: 'idle' }
  | { readonly status: 'pending' }
  | { readonly status: 'tracking'; readonly position: GeoPosition }
  | { readonly status: 'denied' }
  | { readonly status: 'unavailable'; readonly reason: string };

type Listener = (state: LocationState) => void;

const HIGH_ACCURACY_OFF: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 5000,
  timeout: 15000,
};

export class LocationStore {
  private current: LocationState = { status: 'idle' };
  private listeners = new Set<Listener>();
  private watchId: number | null = null;

  get state(): LocationState {
    return this.current;
  }

  lastPosition(): GeoPosition | null {
    return this.current.status === 'tracking' ? this.current.position : null;
  }

  start(): void {
    if (this.watchId !== null) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.set({ status: 'unavailable', reason: 'Geolocation API not available' });
      return;
    }
    this.set({ status: 'pending' });
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.set({
          status: 'tracking',
          position: {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracyMeters: pos.coords.accuracy,
            timestamp: pos.timestamp,
          },
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          this.set({ status: 'denied' });
        } else {
          this.set({ status: 'unavailable', reason: err.message });
        }
      },
      HIGH_ACCURACY_OFF,
    );
  }

  stop(): void {
    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    this.watchId = null;
    this.set({ status: 'idle' });
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private set(next: LocationState): void {
    this.current = next;
    for (const l of this.listeners) l(next);
  }
}
