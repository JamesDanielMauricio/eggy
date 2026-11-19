import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts, bundled with the app instead of fetched from Google at
// runtime: no extra connections to two other servers before text can
// render, the files are cached by the service worker (so they work
// offline), and they're already there for the login screen — previously
// they were only injected once the dashboard mounted.
import '@fontsource-variable/work-sans/wght.css'
import '@fontsource-variable/bitter/wght.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Only register in production — in dev this would fight Vite's own dev
// server (stale cached responses instead of live HMR'd code).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}
