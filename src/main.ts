import './brand/tokens.css';
import { startApp } from './app';
import { createServiceWorkerRegistrar, SW_UPDATE_EVENT } from './pwa/registerServiceWorker';
import { mountUpdatePrompt } from './pwa/updatePrompt';

void startApp().catch((err) => {
  console.error('Failed to start app', err);
  const el = document.getElementById('app');
  if (el) el.textContent = `Startup error: ${(err as Error).message}`;
});

const registrar = createServiceWorkerRegistrar({ navigator, document });
const startRegistration = (): void => {
  void registrar.register();
};
const w = window as Window & {
  requestIdleCallback?: (cb: () => void) => void;
};
if (typeof w.requestIdleCallback === 'function') {
  w.requestIdleCallback(startRegistration);
} else {
  setTimeout(startRegistration, 1);
}

document.addEventListener(SW_UPDATE_EVENT, (e) => {
  const reg = (e as CustomEvent<{ registration: ServiceWorkerRegistration }>).detail.registration;
  const host = document.getElementById('map') ?? document.body;
  const prompt = mountUpdatePrompt(host, {
    onReload: () => {
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          window.location.reload();
        },
        { once: true },
      );
    },
    onDismiss: () => prompt.dismiss(),
  });
  prompt.show();
});
