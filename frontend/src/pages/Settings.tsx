import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useProfile, useUpdateProfile } from '../hooks/useProfile';
import { usePageTitle } from '../hooks/usePageTitle';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { useToast } from '../contexts/ToastContext';
import {
  useExportData,
  useExportExcel,
  useExportPDF,
} from '../hooks/useAccountActions';
import { PageTransition } from '../components/PageTransition';
import { DeleteAccountModal } from '../components/DeleteAccountModal';
import { Icon, type IconName } from '../components/Icon';
import { InstitutionField } from '../components/InstitutionField';
import type { UserProfile } from '../lib/types';
import { LEGAL_ENTITY } from '../legal/entity';

/** "Dr. Amara Osei" → "AO"; single-word names fall back to the first two
 *  letters. Used for the avatar chip when there's no Google photo. */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return '?';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Profile — name, institution (reuses the Onboarding combobox), free-text
// research area.
// ---------------------------------------------------------------------------

function ProfileSection({ profile }: { profile: UserProfile }) {
  const update = useUpdateProfile();
  const { showToast } = useToast();
  const [name, setName] = useState(profile.name);
  const [institution, setInstitution] = useState(profile.institution ?? '');
  const [researchArea, setResearchArea] = useState(profile.research_area ?? '');

  // Reset local state if the profile loads fresh values (e.g. across tabs).
  useEffect(() => {
    setName(profile.name);
    setInstitution(profile.institution ?? '');
    setResearchArea(profile.research_area ?? '');
  }, [profile.id]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await update.mutateAsync({
      name: name.trim(),
      institution: institution.trim() || null,
      research_area: researchArea.trim() || null,
    });
    showToast('Profile updated', 'success');
  }

  return (
    <section className="bb-card p-5 md:p-6">
      <h2 className="text-lg font-display text-ink">Profile</h2>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <div>
          <label className="bb-label" htmlFor="setting-name">
            Name <span className="text-danger">*</span>
          </label>
          <input
            id="setting-name"
            type="text"
            required
            className="bb-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* Same University/Independent combobox as onboarding — initialised
            from the existing profile value on mount (see InstitutionField's
            `value` prop docs for why this is safe as an initial-only value). */}
        <InstitutionField value={institution} onChange={setInstitution} />

        <div>
          <label className="bb-label" htmlFor="setting-area">Research area</label>
          <input
            id="setting-area"
            type="text"
            maxLength={120}
            className="bb-input"
            placeholder="e.g. Neuroscience, Molecular biology"
            value={researchArea}
            onChange={(e) => setResearchArea(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="submit"
            className="bb-btn-primary"
            disabled={update.isPending || !name.trim()}
          >
            {update.isPending ? 'Saving…' : 'Save changes'}
          </button>
          {update.error && (
            <span className="text-sm text-danger">
              {(update.error as Error).message}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Account — Google avatar (with initials fallback), email, member-since,
// sign-in method, and sign out.
// ---------------------------------------------------------------------------

function AccountSection({ profile }: { profile: UserProfile }) {
  const { user, signOut } = useAuth();
  const [avatarFailed, setAvatarFailed] = useState(false);

  const avatarUrl =
    (user?.user_metadata?.avatar_url as string | undefined) ??
    (user?.user_metadata?.picture as string | undefined);
  const showAvatarImage = !!avatarUrl && !avatarFailed;
  const isGoogle = user?.app_metadata?.provider === 'google';

  return (
    <section className="bb-card p-5 md:p-6">
      <h2 className="text-lg font-display text-ink">Account</h2>

      <div className="mt-4 flex items-center gap-4">
        {showAvatarImage ? (
          <img
            src={avatarUrl}
            alt=""
            onError={() => setAvatarFailed(true)}
            className="h-14 w-14 shrink-0 rounded-full border border-line object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary"
          >
            {getInitials(profile.name)}
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate font-medium text-ink">{profile.name}</div>
          <div className="truncate text-sm text-muted">{user?.email ?? 'your account'}</div>
          <div className="mt-0.5 text-xs text-muted">
            Member since {formatMemberSince(profile.created_at)}
          </div>
        </div>
      </div>

      {isGoogle && (
        <p className="mt-4 text-xs text-muted">Signed in with Google</p>
      )}

      <div className="mt-5 flex justify-end border-t border-line pt-4">
        <button onClick={signOut} className="bb-btn-ghost">
          <Icon name="log-out" size={17} />
          Sign out
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Export — Excel / PDF / JSON as icon tiles.
// ---------------------------------------------------------------------------

interface ExportTile {
  key: string;
  icon: IconName;
  title: string;
  pendingTitle: string;
  description: string;
  pending: boolean;
  onClick: () => void;
}

function ExportSection() {
  const { showToast } = useToast();
  const exportExcel = useExportExcel();
  const exportPDF = useExportPDF();
  const exportJSON = useExportData();

  async function onExportExcel() {
    try {
      await exportExcel.mutateAsync();
      showToast('Excel file downloaded', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }
  async function onExportPDF() {
    try {
      await exportPDF.mutateAsync();
      showToast('Experiment record opened for printing', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }
  async function onExportJSON() {
    try {
      await exportJSON.mutateAsync();
      showToast('JSON export downloaded', 'success');
    } catch (err) {
      showToast((err as Error).message, 'error');
    }
  }

  const tiles: ExportTile[] = [
    {
      key: 'excel',
      icon: 'table',
      title: 'Excel spreadsheet',
      pendingTitle: 'Preparing…',
      description: 'Measurements and data for analysis',
      pending: exportExcel.isPending,
      onClick: onExportExcel,
    },
    {
      key: 'pdf',
      icon: 'file',
      title: 'PDF experiment record',
      pendingTitle: 'Opening…',
      description: 'Complete notebook for archive or thesis',
      pending: exportPDF.isPending,
      onClick: onExportPDF,
    },
    {
      key: 'json',
      icon: 'braces',
      title: 'JSON archive',
      pendingTitle: 'Preparing…',
      description: 'Raw data for developers and data scientists',
      pending: exportJSON.isPending,
      onClick: onExportJSON,
    },
  ];

  return (
    <section className="bb-card p-5 md:p-6">
      <h2 className="text-lg font-display text-ink">Export your data</h2>
      <p className="mt-1 text-sm text-muted">
        Download your complete experiment record in your preferred format.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={t.onClick}
            disabled={t.pending}
            className="flex min-h-[44px] flex-col items-start gap-2 rounded-card border border-line bg-white p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-card bg-primary/10 text-primary">
              <Icon name={t.icon} size={19} />
            </span>
            <span className="font-medium text-ink">
              {t.pending ? t.pendingTitle : t.title}
            </span>
            <span className="text-xs leading-relaxed text-muted">{t.description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Danger zone — deletion, visually separated with a danger hairline.
// ---------------------------------------------------------------------------

function DangerZone({ onDelete }: { onDelete: () => void }) {
  return (
    <section className="bb-card border-danger/25 p-5 md:p-6">
      <h2 className="text-lg font-display text-danger">Danger zone</h2>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-ink">Delete account</div>
          <p className="mt-0.5 max-w-md text-xs text-muted">
            Permanent — cannot be undone. All protocols, experiments, and
            reagents will be removed.
          </p>
        </div>
        <button
          onClick={onDelete}
          className="bb-btn-ghost border-danger/30 text-danger hover:bg-danger/5"
        >
          <Icon name="trash" size={16} />
          Delete account
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function HelpSection() {
  return (
    <section className="bb-card p-5 md:p-6">
      <h2 className="text-lg font-display text-ink">Help &amp; guidance</h2>
      <p className="mt-1 text-sm text-muted">
        New here, or want a refresher? Replay the guided tour of the core workflow.
      </p>
      <button
        onClick={() => {
          void import('../lib/guidedTour').then((m) => m.startGuidedTour());
        }}
        className="bb-btn-ghost mt-4 inline-flex items-center gap-2"
      >
        <Icon name="bulb" size={17} />
        Replay guided tour
      </button>
    </section>
  );
}

function InstallSection() {
  const { canPrompt, isIOS, installed, promptInstall } = usePwaInstall();
  return (
    <section className="bb-card p-5 md:p-6">
      <h2 className="text-lg font-display text-ink">Install Benchbook</h2>
      {installed ? (
        <p className="mt-2 text-sm text-muted inline-flex items-center gap-1.5">
          <Icon name="check" size={16} className="text-success" />
          You're using the installed app.
        </p>
      ) : isIOS ? (
        <p className="mt-1 text-sm text-muted">
          Tap <span className="font-medium text-ink">Share</span> in Safari, then{' '}
          <span className="font-medium text-ink">Add to Home Screen</span> for a full-screen app
          that works offline.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            Add Benchbook to your device for a full-screen app that works offline.
          </p>
          <button
            onClick={() => void promptInstall()}
            disabled={!canPrompt}
            className="bb-btn-primary mt-4 inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Icon name="device" size={17} />
            Install app
          </button>
          {!canPrompt && (
            <p className="mt-2 text-xs text-muted">
              Not enabled yet? Your browser offers this once it detects the app is installable —
              or use its menu → "Install app" / "Add to Home screen".
            </p>
          )}
        </>
      )}
    </section>
  );
}

export function Settings() {
  usePageTitle('Settings');
  const profileQ = useProfile();
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (profileQ.isLoading) {
    return <div className="p-8 text-sm text-muted">Loading settings…</div>;
  }
  if (profileQ.error || !profileQ.data?.profile) {
    return (
      <div className="p-8 text-sm text-danger">
        Couldn't load your profile.{' '}
        {(profileQ.error as Error | undefined)?.message ?? ''}
      </div>
    );
  }

  const profile = profileQ.data.profile;

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-5">
        <header>
          <h1 className="text-2xl text-ink md:text-3xl">Settings</h1>
          <p className="mt-1 text-sm text-muted">
            Manage your profile, account, and data.
          </p>
        </header>

        <ProfileSection profile={profile} />
        <AccountSection profile={profile} />
        <HelpSection />
        <InstallSection />
        <ExportSection />
        <DangerZone onDelete={() => setDeleteOpen(true)} />

        <footer className="pt-2 text-center text-xs text-muted">
          <Link to="/privacy" className="hover:text-ink">
            Privacy Policy
          </Link>
          {' · '}
          <Link to="/terms" className="hover:text-ink">
            Terms of Service
          </Link>
          {' · '}
          © 2026 {LEGAL_ENTITY}
        </footer>

        {deleteOpen && <DeleteAccountModal onClose={() => setDeleteOpen(false)} />}
      </div>
    </PageTransition>
  );
}
