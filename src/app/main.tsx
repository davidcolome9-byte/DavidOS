import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '../styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
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
