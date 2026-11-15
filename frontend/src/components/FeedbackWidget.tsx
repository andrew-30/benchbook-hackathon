import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { api, apiErrorMessage } from '../lib/api';
import { Icon } from './Icon';

const EMAILISH = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Global feedback affordance — a fixed pill on every page that opens a modal
 * form. Mounted once at the app root (inside the router), so it covers public
 * pages the AppLayout footer never reaches. Sends to POST /api/feedback, which
 * emails the team via Resend.
 *
 * Hidden on the immersive run-execution screen so it never sits over the timer.
 */
export function FeedbackWidget() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { pathname } = useLocation();

  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState(''); // honeypot — must stay empty
  const [sending, setSending] = useState(false);

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Keep it out of the full-screen focus mode.
  if (pathname.endsWith('/execute')) return null;

  const signedInEmail = user?.email ?? '';
  const emailValid = !!signedInEmail || EMAILISH.test(email.trim());
  const canSend = message.trim().length >= 10 && emailValid && !sending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    try {
      await api('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({
          message: message.trim(),
          email: (signedInEmail || email.trim()) || undefined,
          company, // honeypot
          page: window.location.href,
        }),
      });
      showToast('Thanks! Your feedback was sent.', 'success');
      setOpen(false);
      setMessage('');
      setEmail('');
    } catch (err) {
      showToast(apiErrorMessage(err, 'Could not send feedback. Please try again.'), 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Send feedback"
          className="fixed z-30 bottom-20 right-4 md:bottom-5 md:right-6 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary/25 transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
        >
          <Icon name="mail" size={16} />
          Feedback
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Send feedback"
            className="bb-card w-full max-w-md bg-white p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">Send feedback</h2>
                <p className="mt-0.5 text-sm text-muted">Found a bug or have an idea? We read every message.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="-mr-1 -mt-1 shrink-0 p-1 text-muted hover:text-ink"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <form onSubmit={submit} className="mt-4 space-y-3">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={4000}
                required
                autoFocus
                placeholder="What's on your mind?"
                className="w-full resize-y rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />

              {signedInEmail ? (
                <p className="text-xs text-muted">
                  Replying as <span className="font-medium text-ink">{signedInEmail}</span>
                </p>
              ) : (
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="Your email (so we can reply)"
                  className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              )}

              {/* Honeypot — hidden from real users, catches naive bots. */}
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}
              />

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button type="submit" disabled={!canSend} className="bb-btn-primary disabled:opacity-50">
                  {sending ? 'Sending…' : 'Send feedback'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
