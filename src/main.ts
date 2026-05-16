import './brand/tokens.css';
import { startApp } from './app';

void startApp().catch((err) => {
  console.error('Failed to start app', err);
  const el = document.getElementById('app');
  if (el) el.textContent = `Startup error: ${(err as Error).message}`;
});
