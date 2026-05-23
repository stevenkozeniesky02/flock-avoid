export const SW_UPDATE_EVENT = 'flockavoid:sw-update-ready';

export interface ServiceWorkerRegistrar {
  readonly register: () => Promise<void>;
}

export interface RegistrarScope {
  readonly navigator: Navigator | undefined;
  readonly document: Document | undefined;
}

export function createServiceWorkerRegistrar(scope: RegistrarScope): ServiceWorkerRegistrar {
  return {
    register: async () => {
      const nav = scope.navigator;
      const doc = scope.document;
      if (!nav || !('serviceWorker' in nav) || !doc) return;
      try {
        const reg = await nav.serviceWorker.register('/sw.js', { scope: '/' });
        if (reg.waiting && nav.serviceWorker.controller) {
          dispatchUpdate(doc, reg);
        }
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && nav.serviceWorker.controller) {
              dispatchUpdate(doc, reg);
            }
          });
        });
      } catch (err) {
        // Registration failures must not break the app. Log and move on.
        console.warn('Service worker registration failed', err);
      }
    },
  };
}

function dispatchUpdate(doc: Document, registration: ServiceWorkerRegistration): void {
  doc.dispatchEvent(new CustomEvent(SW_UPDATE_EVENT, { detail: { registration } }));
}
