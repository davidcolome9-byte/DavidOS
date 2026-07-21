import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AppErrorBoundary from './AppErrorBoundary';
import '../styles/index.css';

// The crash boundary wraps EVERYTHING (StoreProvider, router, layout): any
// render crash lands on a recovery surface with reload + export instead of a
// permanent blank page (DOS-STAB-001A).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);

// Register the service worker for offline support / PWA installability.
// Only in production builds — the dev server doesn't need it.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.error('DavidOS: service worker registration failed', err);
    });
  });
}
