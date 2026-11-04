import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { ScreenTransition } from './components/MotionUI';
import LoginPage from './LoginPage';
import EggFarmDashboard from './EggFarmDashboard';
import { COLORS } from './lib/theme';
import { getCurrentUser, logout } from './lib/api';

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

  useEffect(() => {
    let mounted = true;
    getCurrentUser()
      .then((user) => {
        if (!mounted) return;
        setUsername(user.username);
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
    setStatus('anon');
  }

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.paper }}>
        <Loader2 size={28} className="animate-spin" style={{ color: COLORS.barnwood }} />
      </div>
    );
  }

  return (
    <ScreenTransition viewKey={status}>
      {status === 'anon'
        ? <LoginPage onLoggedIn={(name) => { setUsername(name); setStatus('authed'); }} />
        : <EggFarmDashboard username={username} onLogout={handleLogout} />}
    </ScreenTransition>
  );
}
