import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { errorMessage } from '../lib/api';

const DEMO_ACCOUNTS = [
  { label: 'Demo shopper', email: 'shopper@buywise.ai', password: 'demo1234' },
  { label: 'Demo merchant', email: 'merchant@buywise.ai', password: 'demo1234' },
];

export default function SignIn() {
  const { signIn } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'customer',
    storeName: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e, override) => {
    e?.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = override || form;
      const user = await signIn(payload, override ? 'login' : mode);
      const back = location.state?.from;
      navigate(user.role === 'merchant' ? '/merchant' : back && back !== '/signin' ? back : '/agent');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const isSignup = mode === 'signup';

  return (
    <div className="container-page flex justify-center py-12">
      <div className="w-full max-w-md">
        <div className="card p-7">
          <h1 className="text-2xl text-ink">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {isSignup
              ? 'A shopper account lets the agent save your cart and remember your preferences.'
              : 'Sign in to let the agent add things to your cart and check out.'}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {isSignup && (
              <div>
                <label htmlFor="name" className="label">
                  Your name
                </label>
                <input id="name" value={form.name} onChange={set('name')} className="field" required />
              </div>
            )}

            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={set('email')}
                className="field"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={form.password}
                onChange={set('password')}
                className="field"
                required
                minLength={6}
              />
              {isSignup && <p className="hint">At least 6 characters.</p>}
            </div>

            {isSignup && (
              <>
                <div>
                  <span className="label">I am a</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'customer', label: 'Shopper' },
                      { value: 'merchant', label: 'Merchant' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, role: option.value }))}
                        className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                          form.role === option.value
                            ? 'border-forest-500 bg-forest-50 text-forest-700'
                            : 'border-line bg-card text-ink-soft hover:border-ink-faint'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {form.role === 'merchant' && (
                  <div>
                    <label htmlFor="storeName" className="label">
                      Store name
                    </label>
                    <input
                      id="storeName"
                      value={form.storeName}
                      onChange={set('storeName')}
                      className="field"
                      placeholder="e.g. Rao Electronics"
                    />
                  </div>
                )}
              </>
            )}

            {error && (
              <p className="rounded-xl border border-clay-200 bg-clay-50 px-3.5 py-2.5 text-sm text-clay-500">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-ink-muted">
            {isSignup ? 'Already have an account?' : 'New to BuyWise?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(isSignup ? 'login' : 'signup');
                setError('');
              }}
              className="font-medium text-forest-700 underline-offset-2 hover:underline"
            >
              {isSignup ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </div>

        {/* One-click demo accounts - important for a live walkthrough. */}
        <div className="card mt-4 p-5">
          <p className="eyebrow mb-3">Demo accounts</p>
          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                disabled={busy}
                onClick={(e) => submit(e, { email: account.email, password: account.password })}
                className="btn-secondary w-full justify-between"
              >
                <span>{account.label}</span>
                <span className="text-xs font-normal text-ink-muted">{account.email}</span>
              </button>
            ))}
          </div>
          <p className="hint">Both use the password <code className="font-mono">demo1234</code>.</p>
        </div>

        <p className="mt-4 text-center text-sm text-ink-muted">
          <Link to="/agent" className="underline-offset-2 hover:underline">
            Or try the agent without an account
          </Link>
        </p>
      </div>
    </div>
  );
}
