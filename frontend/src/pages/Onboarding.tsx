import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCreateProfile } from '../hooks/useProfile';
import { usePageTitle } from '../hooks/usePageTitle';
import { PageTransition } from '../components/PageTransition';
import { Icon } from '../components/Icon';
import { BrandMark } from '../components/BrandMark';
import { InstitutionField } from '../components/InstitutionField';
import type { UserProfile } from '../lib/types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type Phase = 'form' | 'welcome' | 'choose';

function firstName(full: string | null | undefined): string {
  if (!full) return 'there';
  return full.trim().split(/\s+/)[0] ?? 'there';
}

function useUserCount() {
  return useQuery({
    queryKey: ['user-count'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/users/count`);
      if (!res.ok) throw new Error('count fetch failed');
      return res.json() as Promise<{ count: number }>;
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function Onboarding() {
  usePageTitle('Welcome');
  const navigate = useNavigate();
  const create = useCreateProfile();
  const userCount = useUserCount();

  const [phase, setPhase] = useState<Phase>('form');
  const [savedProfile, setSavedProfile] = useState<UserProfile | null>(null);

  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [researchArea, setResearchArea] = useState<string>('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const profile = await create.mutateAsync({
      name: name.trim(),
      institution: institution.trim() || null,
      research_area: researchArea.trim() || null,
    });
    setSavedProfile(profile);
    setPhase('welcome');
  }

  // After 1.5s, advance from welcome card → choose-action card.
  useEffect(() => {
    if (phase !== 'welcome') return;
    const t = setTimeout(() => setPhase('choose'), 1500);
    return () => clearTimeout(t);
  }, [phase]);

  return (
    <PageTransition>
      <div
        className="relative flex min-h-screen items-center justify-center overflow-hidden p-4"
        style={{ background: 'linear-gradient(160deg, #ecedff 0%, #f5f5ff 48%, #ffffff 100%)' }}
      >
        {/* Soft indigo glow — decorative, premium, calm. Matches /login and /tour. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
        />

        <div className="relative w-full max-w-md">
          <div className="mb-8 flex justify-center">
            <BrandMark />
          </div>

          <div className="bb-card p-6 md:p-8">
            {phase === 'form' && (
              <FormPhase
                userCount={userCount.data?.count}
                name={name}
                setName={setName}
                institution={institution}
                setInstitution={setInstitution}
                researchArea={researchArea}
                setResearchArea={setResearchArea}
                create={create}
                onSubmit={onSubmit}
              />
            )}

            {phase === 'welcome' && savedProfile && <WelcomePhase name={savedProfile.name} />}

            {phase === 'choose' && savedProfile && (
              <ChoosePhase
                name={savedProfile.name}
                onSkip={() => navigate('/dashboard', { replace: true })}
                onImport={() => navigate('/import', { replace: true })}
                onCreate={() => navigate('/protocols', { replace: true })}
              />
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}

// ---------------------------------------------------------------------------
// Phase 1 — form
// ---------------------------------------------------------------------------

interface FormProps {
  userCount: number | undefined;
  name: string;
  setName: (v: string) => void;
  institution: string;
  setInstitution: (v: string) => void;
  researchArea: string;
  setResearchArea: (v: string) => void;
  create: ReturnType<typeof useCreateProfile>;
  onSubmit: (e: React.FormEvent) => void;
}

function FormPhase({
  userCount,
  name,
  setName,
  institution,
  setInstitution,
  researchArea,
  setResearchArea,
  create,
  onSubmit,
}: FormProps) {
  return (
    <>
      <div className="text-center">
        <h2 className="text-2xl text-ink">Welcome to Benchbook</h2>
        <p className="mt-1.5 text-sm text-muted">
          No more lost data, no more “I'll write it up later.”
        </p>
      </div>

      {typeof userCount === 'number' && userCount > 0 && (
        <div className="mt-4 flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-primary/60" aria-hidden />
            Join {userCount} other researcher{userCount === 1 ? '' : 's'}
          </div>
        </div>
      )}

      <div className="mt-6 border-t border-line pt-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your details</p>

        <form onSubmit={onSubmit} className="mt-3 space-y-3">
          <div>
            <label htmlFor="name" className="bb-label">
              Your name <span className="text-danger">*</span>
            </label>
            <input
              id="name"
              type="text"
              required
              autoFocus
              className="bb-input"
              placeholder="Dr. Amara Osei"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <InstitutionField value={institution} onChange={setInstitution} />

          <div>
            <label htmlFor="research_area" className="bb-label">Research area</label>
            <input
              id="research_area"
              type="text"
              maxLength={120}
              className="bb-input"
              placeholder="e.g. Neuroscience, Molecular biology"
              value={researchArea}
              onChange={(e) => setResearchArea(e.target.value)}
            />
          </div>

          {create.error && (
            <p className="text-sm text-danger">
              {create.error instanceof Error ? create.error.message : 'Failed to save profile'}
            </p>
          )}

          <button
            type="submit"
            className="bb-btn-primary mt-2 w-full min-h-[56px] text-base font-semibold"
            disabled={create.isPending || !name.trim()}
          >
            {create.isPending ? (
              'Setting up…'
            ) : (
              <>
                Get Started
                <Icon name="arrow-right" size={18} />
              </>
            )}
          </button>

          <p className="mt-3 text-center text-xs text-muted">
            By signing up you agree to our{' '}
            <Link to="/terms" className="underline hover:text-ink">Terms</Link>
            {' '}and{' '}
            <Link to="/privacy" className="underline hover:text-ink">Privacy Policy</Link>
          </p>
        </form>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Phase 2 — welcome moment
// ---------------------------------------------------------------------------

function WelcomePhase({ name }: { name: string }) {
  return (
    <div className="mb-2 mt-4 text-center">
      <div className="bb-animate-bounce mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
        <Icon name="check" size={28} strokeWidth={2} />
      </div>
      <h2 className="mt-4 text-2xl text-ink">Welcome, {firstName(name)}!</h2>
      <p className="mt-1 text-sm text-muted">Your notebook is ready.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 3 — choose first action
// ---------------------------------------------------------------------------

function ChoosePhase({
  name,
  onImport,
  onCreate,
  onSkip,
}: {
  name: string;
  onImport: () => void;
  onCreate: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="mt-2">
      <h2 className="text-center text-2xl text-ink">Welcome, {firstName(name)}!</h2>
      <p className="mt-1 text-center text-sm text-muted">What would you like to do first?</p>

      <div className="mt-6 space-y-3">
        <button
          onClick={onImport}
          className="bb-card flex w-full items-center gap-3 p-4 text-left"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon name="import" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink">Import an existing protocol</span>
            <span className="block text-sm text-muted">Upload a Word document or paste text</span>
          </span>
          <Icon name="arrow-right" size={18} className="shrink-0 text-muted" />
        </button>

        <button
          onClick={onCreate}
          className="bb-card flex w-full items-center gap-3 p-4 text-left"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon name="plus" size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink">Create a protocol from scratch</span>
            <span className="block text-sm text-muted">Build your first protocol step by step</span>
          </span>
          <Icon name="arrow-right" size={18} className="shrink-0 text-muted" />
        </button>
      </div>

      <div className="mt-5 text-center">
        <Link
          to="/dashboard"
          replace
          onClick={onSkip}
          className="text-sm text-muted hover:text-ink"
        >
          Skip for now, take me to my dashboard
        </Link>
      </div>
    </div>
  );
}
