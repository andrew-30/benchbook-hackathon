import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  useDeleteAccount,
  useDeleteRequest,
  type DeleteRequestSummary,
} from '../hooks/useAccountActions';
import { supabase } from '../lib/supabase';

interface Props {
  onClose: () => void;
}

/**
 * GDPR-compliant two-step account deletion modal.
 *
 * Step 1 — Warning screen with row counts loaded from /delete-request.
 *          The counts come from a separate endpoint rather than being
 *          computed in the modal so the user sees the actual server-side
 *          numbers (and any RLS mismatch surfaces here, not after delete).
 * Step 2 — Email-confirmation gate. The Delete button stays disabled until
 *          the typed value EXACTLY matches the logged-in user's email
 *          (case-insensitive, trimmed). The backend re-verifies before
 *          deleting so a tampered client can't bypass it.
 *
 * After successful deletion the modal:
 *   1. Signs out from Supabase
 *   2. Navigates to /login?deleted=1
 *   3. Login.tsx picks up the param and renders the success banner.
 *
 * The modal itself never enters a "Step 3" state — by the time the request
 * resolves we're already on the way to /login.
 */
export function DeleteAccountModal({ onClose }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const userEmail = (user?.email ?? '').toLowerCase().trim();

  const [step, setStep] = useState<1 | 2>(1);
  const [typedEmail, setTypedEmail] = useState('');

  const summaryQ = useDeleteRequest();
  const deleteMut = useDeleteAccount();

  // Load the summary as soon as the modal opens. The hook is a mutation
  // (single-shot POST) so we trigger it manually here.
  useEffect(() => {
    summaryQ.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmDelete() {
    try {
      await deleteMut.mutateAsync(typedEmail.trim());
      // Sign out + redirect with the one-time success param. Use replace so
      // the user can't navigate back into the (now-empty) app.
      await supabase.auth.signOut();
      navigate('/login?deleted=1', { replace: true });
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }

  const emailMatches =
    !!userEmail && typedEmail.toLowerCase().trim() === userEmail;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/60 bb-animate-fade">
      <div className="w-full max-w-md bb-card p-6 bb-animate-scale">
        {step === 1 && (
          <Step1
            summary={summaryQ.data ?? null}
            loading={summaryQ.isPending}
            onCancel={onClose}
            onContinue={() => setStep(2)}
          />
        )}
        {step === 2 && (
          <Step2
            email={userEmail}
            typedEmail={typedEmail}
            onTypedEmailChange={setTypedEmail}
            emailMatches={emailMatches}
            deleting={deleteMut.isPending}
            onBack={() => setStep(1)}
            onDelete={confirmDelete}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Warning screen
// ---------------------------------------------------------------------------

function Step1({
  summary,
  loading,
  onCancel,
  onContinue,
}: {
  summary: DeleteRequestSummary | null;
  loading: boolean;
  onCancel: () => void;
  onContinue: () => void;
}) {
  return (
    <>
      <h2 className="text-lg font-semibold text-rose-700">Delete your account</h2>
      <div className="mt-4 rounded-card border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
        <div className="font-semibold">⚠ This will permanently delete:</div>
        <ul className="mt-2 list-disc pl-5 space-y-0.5">
          <li>All your protocols and steps</li>
          <li>All your experiments and results</li>
          <li>All your reagent records</li>
          <li>All your shared run links</li>
        </ul>
        <p className="mt-3 font-medium">This cannot be undone.</p>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-neutral-500">Loading deletion summary…</p>
      ) : summary ? (
        <ul className="mt-4 text-sm text-neutral-700 space-y-0.5 list-disc pl-5">
          <li>
            <span className="font-medium">{summary.protocols_count}</span> protocol
            {summary.protocols_count === 1 ? '' : 's'}
          </li>
          <li>
            <span className="font-medium">{summary.experiments_count}</span>{' '}
            experiment{summary.experiments_count === 1 ? '' : 's'}
          </li>
          <li>
            <span className="font-medium">{summary.reagents_count}</span> reagent
            {summary.reagents_count === 1 ? '' : 's'}
          </li>
        </ul>
      ) : null}

      <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
        <button onClick={onCancel} className="bb-btn-ghost">
          Cancel
        </button>
        <button
          onClick={onContinue}
          className="bb-btn-ghost border-rose-300 text-rose-700 hover:bg-rose-50"
        >
          I understand, continue →
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Email confirmation
// ---------------------------------------------------------------------------

function Step2({
  email,
  typedEmail,
  onTypedEmailChange,
  emailMatches,
  deleting,
  onBack,
  onDelete,
}: {
  email: string;
  typedEmail: string;
  onTypedEmailChange: (v: string) => void;
  emailMatches: boolean;
  deleting: boolean;
  onBack: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <h2 className="text-lg font-semibold text-rose-700">
        Confirm account deletion
      </h2>
      <p className="mt-3 text-sm text-neutral-700">
        To confirm, type your email address:{' '}
        <span className="font-mono text-neutral-900">{email || '—'}</span>
      </p>
      <input
        type="email"
        autoComplete="off"
        spellCheck={false}
        className="bb-input mt-3 font-mono"
        placeholder="your@email.com"
        value={typedEmail}
        onChange={(e) => onTypedEmailChange(e.target.value)}
      />
      <button
        onClick={onDelete}
        disabled={!emailMatches || deleting}
        className={`bb-btn w-full mt-4 justify-center font-semibold ${
          emailMatches
            ? 'bg-rose-600 text-white hover:opacity-90 disabled:opacity-50'
            : 'bg-rose-200 text-rose-500 cursor-not-allowed'
        }`}
      >
        {deleting ? 'Deleting…' : 'Delete My Account Forever'}
      </button>
      <p className="mt-3 text-xs text-neutral-500 text-center">
        Once deleted, your data cannot be recovered.
      </p>
      <div className="mt-4 text-center">
        <button
          onClick={onBack}
          className="text-sm text-neutral-600 hover:text-neutral-900"
        >
          ← Go back
        </button>
      </div>
    </>
  );
}
