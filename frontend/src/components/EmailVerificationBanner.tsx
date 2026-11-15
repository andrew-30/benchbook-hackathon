import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';
import { Icon } from './Icon';

/**
 * Shown while the signed-in user's email is unconfirmed. AI features (protocol
 * import + methods generation) are gated server-side (403 EMAIL_UNVERIFIED) for
 * these accounts, so this banner explains why and offers a one-tap resend of
 * the confirmation email.
 *
 * OAuth and magic-link users are auto-verified, so they never see this. Dismiss
 * is session-only (no persistence) — it reappears on the next load until the
 * email is actually confirmed, which is the point.
 */
export function EmailVerificationBanner({ className = '' }: { className?: string }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  // Nothing to do for verified users (email_confirmed_at set) or logged-out.
  if (dismissed || !user || user.email_confirmed_at) return null;

  async function resend() {
    if (!user?.email) return;
    setSending(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: user.email });
      if (error) throw error;
      showToast(`Verification email sent to ${user.email}.`, 'success');
    } catch (err) {
      // Supabase throttles resends — surface its message (e.g. "wait 60s") so
      // the user knows to try again shortly rather than assuming it failed.
      showToast(
        err instanceof Error ? err.message : 'Could not send the email. Please try again shortly.',
        'error',
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-card border border-warning/30 bg-warning/5 px-4 py-3 ${className}`}
    >
      <span className="flex-none w-9 h-9 rounded-xl bg-warning text-white grid place-items-center">
        <Icon name="mail" size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink">Verify your email to unlock AI features</div>
        <div className="text-xs text-muted">
          Protocol import and methods generation need a confirmed email. Check your inbox for the
          link, or resend it below.
        </div>
      </div>
      <button onClick={() => void resend()} disabled={sending} className="bb-btn-primary shrink-0">
        {sending ? 'Sending…' : 'Resend email'}
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 text-muted hover:text-ink p-1"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
