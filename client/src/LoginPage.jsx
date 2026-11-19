import { useState } from 'react';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import BrandMark from './components/BrandMark';
import { inputClasses } from './lib/theme';
import { login } from './lib/api';

export default function LoginPage({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-paper">
      <div className="w-full max-w-sm eggy-rise">
        <div className="flex flex-col items-center text-center mb-7">
          <BrandMark size={60} />
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink mt-4">Egg Farm Ledger</h1>
          <p className="text-sm text-ink-soft mt-1">Sign in to record sales, expenses and harvests.</p>
        </div>

        <form onSubmit={handleSubmit} className="eggy-card eggy-form-flow p-5 space-y-4">
          {error && (
            <div role="alert" className="eggy-fade-in text-sm rounded-xl px-3 py-2.5 text-brick bg-[#F7E6E1] border border-[#9B443355]">
              {error}
            </div>
          )}

          <label className="block">
            <span className="eggy-label">Username</span>
            {/* Phones capitalise the first letter of a text field by default,
                which turned "demo" into "Demo" — and usernames are matched
                exactly, so the login failed for no visible reason. */}
            <input
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              className={inputClasses}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="eggy-label">Password</span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                className={`${inputClasses} pr-12`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {/* Lets you check what you typed on a phone keyboard before
                  submitting, instead of retyping after a failed attempt. */}
              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="eggy-icon-btn eggy-focus absolute right-1 top-1/2 -translate-y-1/2"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="eggy-btn eggy-btn-primary eggy-focus w-full py-3 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
