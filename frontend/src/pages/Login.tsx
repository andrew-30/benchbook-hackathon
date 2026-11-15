import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { usePageTitle } from '../hooks/usePageTitle';
import { Icon } from '../components/Icon';
import { BrandMark } from '../components/BrandMark';

type Mode = 'signin' | 'signup';

function friendlyAuthError(message: string): string {
  // Map Supabase's terse error strings to copy a researcher can actually act on.
  const m = message.toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid email or password')) {
    return 'Invalid email or password';
  }
  if (m.includes('email not confirmed')) {
    return 'Please confirm your email — check your inbox for the confirmation link.';
  }
  if (m.includes('user already registered') || m.includes('already exists')) {
    return 'An account with that email already exists. Try signing in instead.';
  }
  if (m.includes('password should be at least')) {
    return 'Password must be at least 6 characters';
  }
  if (m.includes('rate limit')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  return message;
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px bg-line" />
      <span className="text-xs uppercase tracking-wide text-muted">{children}</span>
      <div className="flex-1 h-px bg-line" />
    </div>
  );
}

function GoogleButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="w-full inline-flex items-center justify-center gap-3 px-4 rounded-card border border-line bg-white text-ink font-medium text-sm min-h-[52px] hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition disabled:opacity-50"
      aria-label="Continue with Google"
    >
      {/* Inline SVG so we don't ship a Google asset. Official multi-colour mark. */}
      <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
        <path
          fill="#FFC107"
          d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
        />
        <path
          fill="#FF3D00"
          d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"
        />
        <path
          fill="#4CAF50"
          d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
        />
        <path
          fill="#1976D2"
          d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571c.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
        />
      </svg>
      <span>{busy ? 'Redirecting to Google…' : 'Continue with Google'}</span>
    </button>
  );
}

export function Login() {
  usePageTitle('Sign in');
  const [searchParams, setSearchParams] = useSearchParams();
  // Anonymous viewers of /shared/:token who hit "Copy & Sign Up" are routed
  // here with ?next=copy-protocol. Reframe the page copy so they know why
  // they're being asked to sign up.
  const copyIntent = searchParams.get('next') === 'copy-protocol';

  // DeleteAccountModal redirects here with ?deleted=1 after a successful
  // account deletion. We show a one-time green banner and clear the param
  // after 5 seconds so the message doesn't reappear on refresh.
  const [showDeletedBanner, setShowDeletedBanner] = useState(
    searchParams.get('deleted') === '1',
  );
  useEffect(() => {
    if (!showDeletedBanner) return;
    const t = setTimeout(() => {
      setShowDeletedBanner(false);
      const next = new URLSearchParams(searchParams);
      next.delete('deleted');
      setSearchParams(next, { replace: true });
    }, 5000);
    return () => clearTimeout(t);
  }, [showDeletedBanner, searchParams, setSearchParams]);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState<'google' | 'password' | 'signup' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signupSentTo, setSignupSentTo] = useState<string | null>(null);

  function reset() {
    setError(null);
  }

  async function onGoogle() {
    reset();
    setBusy('google');
    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/dashboard` },
      });
      if (err) throw err;
      // signInWithOAuth navigates to Google; we won't reach this point on success.
    } catch (err) {
      setBusy(null);
      setError(friendlyAuthError(err instanceof Error ? err.message : 'Google sign-in failed'));
    }
  }

  async function onPasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    reset();
    setBusy('password');
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw err;
      // The AuthContext listener will pick up the new session and the route
      // guard will redirect to /dashboard.
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : 'Sign-in failed'));
    } finally {
      setBusy(null);
    }
  }

  async function onSignUp(e: React.FormEvent) {
    e.preventDefault();
    reset();
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setBusy('signup');
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (err) throw err;
      // If email confirmation is enabled, there's no session yet — let the user
      // know to check their inbox. Otherwise the auth listener will sign them in.
      if (data.session == null) {
        setSignupSentTo(email);
      }
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : 'Sign-up failed'));
    } finally {
      setBusy(null);
    }
  }

  // --- Post-action confirmation screen --------------------------------------

  if (signupSentTo) {
    // The post-signup "check your email" screen takes over the page so the auth
    // form isn't redundantly available.
    return (
      <PageBackground>
        <div className="flex min-h-screen items-center justify-center px-4 py-12">
          <div className="w-full max-w-md">
            <div className="mb-8 flex justify-center">
              <BrandMark />
            </div>
            <div className="bb-card p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon name="mail" size={26} />
              </div>
              <h2 className="mt-5 text-xl text-ink">Check your email</h2>
              <p className="mt-2 text-sm text-muted leading-relaxed">
                We sent a confirmation link to{' '}
                <span className="font-medium text-ink">{signupSentTo}</span>. Click the link to
                finish creating your account.
              </p>
              <button
                onClick={() => {
                  setSignupSentTo(null);
                  setMode('signin');
                }}
                className="bb-btn-ghost mt-6"
              >
                Back to sign in
              </button>
            </div>
          </div>
        </div>
      </PageBackground>
    );
  }

  // --- Split-screen login ---------------------------------------------------

  return (
    <PageBackground>
      <div className="md:grid md:min-h-screen md:grid-cols-2">

        {/* LEFT PANEL — quiet indigo-tinted brand panel. Hidden on mobile; the
            right column carries a compact brand header instead so the auth card
            is never pushed below the fold. */}
        <aside
          className="relative hidden overflow-hidden border-r border-line px-10 py-14 md:flex md:flex-col lg:px-16"
          style={{
            background:
              'linear-gradient(160deg, #ecedff 0%, #f5f5ff 48%, #ffffff 100%)',
          }}
        >
          {/* Soft indigo glow — decorative, premium, calm. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
          />

          <div className="relative">
            <BrandMark />
          </div>

          <div className="relative flex flex-1 flex-col justify-center">
            <h1 className="text-4xl leading-[1.08] text-ink lg:text-5xl">
              Every experiment.
              <br />
              Perfectly recorded.
            </h1>
            <p className="mt-5 max-w-sm text-lg leading-relaxed text-muted">
              The experiment execution platform built for reproducible research.
            </p>
          </div>

          <div className="relative text-xs text-muted">
            Reproducible by design — from first step to final methods.
          </div>
        </aside>

        {/* RIGHT — auth column, vertically centered. */}
        <main className="flex min-h-screen flex-col justify-center px-4 py-10 sm:px-6">
          <div className="mx-auto w-full max-w-md">

            {/* Compact brand for mobile only. */}
            <div className="mb-8 flex justify-center md:hidden">
              <BrandMark />
            </div>

            {/* One-time banners. */}
            {showDeletedBanner && (
              <div className="mb-5 flex items-start gap-2.5 rounded-card border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <span className="mt-0.5 shrink-0 text-emerald-600">
                  <Icon name="check" size={18} />
                </span>
                <div>
                  <div className="font-semibold">Your account has been deleted</div>
                  <p className="text-emerald-700">Thank you for using Benchbook.</p>
                </div>
              </div>
            )}

            {copyIntent && (
              <div className="mb-5 flex items-start gap-2.5 rounded-card border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
                <span className="mt-0.5 shrink-0">
                  <Icon name="flask" size={18} />
                </span>
                <div>
                  <div className="font-semibold">Sign in to copy this protocol</div>
                  <p className="text-primary/80">
                    Create a free account to save it to your notebook.
                  </p>
                </div>
              </div>
            )}

            {/* Auth card. */}
            <div className="bb-card p-6 md:p-8">
              <div className="mb-6">
                <h2 className="text-2xl text-ink">
                  {mode === 'signin' ? 'Sign in to Benchbook' : 'Create your account'}
                </h2>
                <p className="mt-1.5 text-sm text-muted">
                  {mode === 'signin'
                    ? 'Welcome back. Pick up where you left off.'
                    : 'Start recording reproducible experiments.'}
                </p>
              </div>

              <GoogleButton onClick={onGoogle} busy={busy === 'google'} />

              <Divider>or</Divider>

              {mode === 'signin' ? (
                <form onSubmit={onPasswordSignIn} className="space-y-3">
                  <Field id="email" label="Email" type="email" value={email} onChange={setEmail} />
                  <Field
                    id="password"
                    label="Password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    autoComplete="current-password"
                  />
                  <button
                    type="submit"
                    className="bb-btn-primary w-full min-h-[52px] text-base"
                    disabled={busy === 'password' || !email || !password}
                  >
                    {busy === 'password' ? 'Signing in…' : 'Sign in'}
                  </button>
                  <p className="pt-1 text-center text-sm text-muted">
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        reset();
                        setMode('signup');
                      }}
                      className="font-medium text-primary hover:underline"
                    >
                      Sign up
                    </button>
                  </p>
                </form>
              ) : (
                <form onSubmit={onSignUp} className="space-y-3">
                  <Field id="email" label="Email" type="email" value={email} onChange={setEmail} />
                  <Field
                    id="password"
                    label="Password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    autoComplete="new-password"
                    hint="At least 6 characters"
                  />
                  <Field
                    id="confirm"
                    label="Confirm password"
                    type="password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    autoComplete="new-password"
                  />
                  <button
                    type="submit"
                    className="bb-btn-primary w-full min-h-[52px] text-base"
                    disabled={busy === 'signup' || !email || !password || !confirmPassword}
                  >
                    {busy === 'signup' ? 'Creating account…' : 'Create account'}
                  </button>
                  <p className="pt-1 text-center text-sm text-muted">
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        reset();
                        setMode('signin');
                      }}
                      className="font-medium text-primary hover:underline"
                    >
                      Sign in
                    </button>
                  </p>
                </form>
              )}

              {error && (
                <div
                  role="alert"
                  className="mt-4 rounded-card border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                >
                  {error}
                </div>
              )}

              <p className="mt-6 text-center text-xs text-muted">
                By continuing you agree to our{' '}
                <Link to="/terms" className="underline hover:text-ink">
                  Terms of Service
                </Link>
                {' '}and{' '}
                <Link to="/privacy" className="underline hover:text-ink">
                  Privacy Policy
                </Link>
              </p>
            </div>

            {/* Slim secondary links — the info pages that used to live in the
                old landing footer. Kept quiet so the page still reads as a
                login, not a marketing page. */}
            <nav
              aria-label="Secondary"
              className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted"
            >
              <Link to="/why-benchbook" className="hover:text-ink">Why Benchbook</Link>
              <span aria-hidden>·</span>
              <Link to="/about" className="hover:text-ink">Our story</Link>
            </nav>
          </div>
        </main>
      </div>
    </PageBackground>
  );
}

// ----------------------------------------------------------------------------
// Internal layout helpers
// ----------------------------------------------------------------------------

/** Modern Confident ground — plain white; the left panel carries the indigo. */
function PageBackground({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-canvas">{children}</div>;
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="bb-label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        required
        className="bb-input"
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  );
}
