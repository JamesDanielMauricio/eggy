import { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { COLORS, FONT_DISPLAY, FONT_BODY, inputClasses, inputStyle } from './lib/theme';
import { login } from './lib/api';

export default function LoginPage({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(username, password);
      onLoggedIn(user.username);
    } catch (err) {
      setError(err.status === 401 ? 'Wrong username or password.' : 'Could not log in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: COLORS.paper }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
            style={{ border: `2px solid ${COLORS.yolk}`, backgroundColor: COLORS.barnwood, transform: 'rotate(-6deg)' }}
          >
            <span style={{ transform: 'rotate(6deg)' }} className="text-2xl">🥚</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: COLORS.ink, fontFamily: FONT_DISPLAY }}>
            Egg Farm Ledger
          </h1>
          <p className="text-xs mt-1" style={{ color: COLORS.inkSoft, fontFamily: FONT_BODY }}>Sign in to continue</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-5 shadow-sm space-y-4"
          style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.cardBorder}` }}
        >
          {error && (
            <div
              className="text-sm rounded-lg px-3 py-2"
              style={{ backgroundColor: '#F7E6E1', border: `1px solid ${COLORS.brick}55`, color: COLORS.brick, fontFamily: FONT_BODY }}
            >
              {error}
            </div>
          )}

          <label className="block">
            <span className="block text-xs font-medium mb-1" style={{ color: COLORS.inkSoft, fontFamily: FONT_BODY }}>Username</span>
            <input
              type="text"
              autoComplete="username"
              required
              className={inputClasses}
              style={inputStyle}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium mb-1" style={{ color: COLORS.inkSoft, fontFamily: FONT_BODY }}>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              className={inputClasses}
              style={inputStyle}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="w-full font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ backgroundColor: COLORS.barnwood, color: '#FFFFFF', fontFamily: FONT_BODY }}
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
