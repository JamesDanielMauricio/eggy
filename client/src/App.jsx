import { useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { ScreenTransition } from './components/MotionUI';
import LoginPage from './LoginPage';
import EggFarmDashboard, { DashboardSkeleton } from './EggFarmDashboard';
import { getCurrentUser, getLedger, logout } from './lib/api';
import { loadTrendChart } from './lib/charts';

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AppContent />
    </MotionConfig>
  );
}

function AppContent() {
  // 'checking' avoids a flash of the login page on every reload while we
  // ask the server if the existing cookie is still valid.
  const [status, setStatus] = useState('checking');
  const [username, setUsername] = useState('');
  const [initialLedger, setInitialLedger] = useState(null);

  useEffect(() => {
    let mounted = true;
    // Ask for the ledger at the same time as the session check instead of
    // after it. Each request crosses the Pacific to the US server, so doing
    // them side by side rather than one after the other saves a full round
    // trip on every app open. If there's no valid session, this request just
    // fails with a 401 that nobody reads — the session check below decides
    // what to show.
    const ledger = getLedger();
    ledger.catch(() => {});
    // Same idea for the chart code: start downloading it now, so it's ready
    // by the time there's data to draw.
    loadTrendChart().catch(() => {});

    getCurrentUser()
      .then((user) => {
        if (!mounted) return;
        setUsername(user.username);
        setInitialLedger(ledger);
        setStatus('authed');
      })
      .catch(() => {
        if (mounted) setStatus('anon');
      });
    return () => { mounted = false; };
  }, []);

  async function handleLogout() {
    await logout().catch(() => {});
    setUsername('');
    // A later login must fetch fresh data, never reuse this old request.
    setInitialLedger(null);
    setStatus('anon');
  }

  // Nearly every open is from someone already signed in, so this shows the
  // dashboard's own loading skeleton rather than a bare spinner — it flows
  // straight into the real dashboard instead of swapping one placeholder
  // for another.
  if (status === 'checking') return <DashboardSkeleton />;

  return (
    <ScreenTransition viewKey={status}>
      {status === 'anon'
        ? <LoginPage onLoggedIn={(name) => { setUsername(name); setStatus('authed'); }} />
        : <EggFarmDashboard username={username} onLogout={handleLogout} initialLedger={initialLedger} />}
    </ScreenTransition>
  );
}
