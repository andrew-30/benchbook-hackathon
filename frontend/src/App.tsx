import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, type Query } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { supabase } from './lib/supabase';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { AppLayout } from './components/AppLayout';
import { ReloadPrompt } from './components/ReloadPrompt';
import { FeedbackWidget } from './components/FeedbackWidget';
import { ProfileGate } from './components/ProfileGate';
import { Login } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
import { Dashboard } from './pages/Dashboard';
import { Protocols } from './pages/Protocols';
import { ProtocolDetail } from './pages/ProtocolDetail';
import { Import } from './pages/Import';
import { RunExecution } from './pages/RunExecution';
import { RunDetail } from './pages/RunDetail';
import { RunHistory } from './pages/RunHistory';
import { Statistics } from './pages/Statistics';
import { Settings } from './pages/Settings';
import { SharedRun } from './pages/SharedRun';
import { NotFound } from './pages/NotFound';
import { Reagents } from './pages/Reagents';
import { Privacy } from './pages/Privacy';
import { Terms } from './pages/Terms';
import { About } from './pages/About';
import { WhyBenchbook } from './pages/WhyBenchbook';
import { Home } from './pages/Home';
import { RouteMeta } from './components/RouteMeta';

// Persist a slice of the query cache to localStorage so an in-progress run, the
// reagent library, and protocols survive a refresh — and render offline —
// without a network round-trip (see OfflineBanner + useOnlineStatus for the UI
// side). Phase 1 is read resilience; a durable offline write-queue is Phase 2.
const PERSIST_KEY = 'benchbook-query-cache';
// Bump when a cached data shape changes in a breaking way, to drop old caches.
const CACHE_BUSTER = 'v1';

// Retry transient failures (network drop, 5xx) but never client errors — a 4xx
// (validation, auth, free-tier gate) won't succeed on retry and would just
// delay the error the caller needs to surface.
function retryOnTransient(failureCount: number, error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  if (/^API 4\d\d/.test(message)) return false;
  return failureCount < 3;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Keep entries in memory long enough to outlive the persister maxAge, so
      // a rehydrated query isn't garbage-collected out from under us.
      gcTime: 1000 * 60 * 60 * 24,
      retry: retryOnTransient,
    },
    mutations: { retry: retryOnTransient },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: PERSIST_KEY,
  throttleTime: 1000,
});

// Only the reads that matter at the bench / offline: the active run, the reagent
// library, and protocols. Heavy aggregates (statistics, dashboard) are excluded
// to stay well under the localStorage quota.
const OFFLINE_QUERY_KEYS = new Set(['run', 'reagents', 'protocols', 'protocol']);

const persistOptions = {
  persister,
  maxAge: 1000 * 60 * 60 * 24, // 24h
  buster: CACHE_BUSTER,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Query) =>
      query.state.status === 'success' &&
      OFFLINE_QUERY_KEYS.has(query.queryKey[0] as string),
  },
};

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-neutral-500">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** "/" is the public landing page; signed-in users go straight to their
 *  dashboard. While auth is still loading, show the landing page (it matches
 *  the pre-rendered HTML) rather than a spinner. */
function HomeRoute() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/dashboard" replace />;
  return <Home />;
}

export function App() {
  // On sign-out, drop the in-memory + persisted cache so the next user on this
  // shared lab device never sees the previous user's cached experiments.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        queryClient.clear();
        try {
          window.localStorage.removeItem(PERSIST_KEY);
        } catch {
          /* storage disabled — nothing to clear */
        }
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              {/* Public landing page (pre-rendered for SEO). */}
              <Route path="/" element={<HomeRoute />} />
              <Route path="/login" element={<Login />} />
              {/* Public, no auth — anyone with a share token can view this. */}
              <Route path="/shared/:token" element={<SharedRun />} />
              {/* Public legal + marketing pages — must stay reachable without an account. */}
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/about" element={<About />} />
              <Route path="/why-benchbook" element={<WhyBenchbook />} />
              <Route
                path="/onboarding"
                element={
                  <RequireAuth>
                    <ProfileGate>
                      <Onboarding />
                    </ProfileGate>
                  </RequireAuth>
                }
              />
              <Route
                path="/runs/:id/execute"
                element={
                  <RequireAuth>
                    <ProfileGate>
                      <RunExecution />
                    </ProfileGate>
                  </RequireAuth>
                }
              />
              <Route
                element={
                  <RequireAuth>
                    <ProfileGate>
                      <AppLayout />
                    </ProfileGate>
                  </RequireAuth>
                }
              >
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/protocols" element={<Protocols />} />
                <Route path="/protocols/:id" element={<ProtocolDetail />} />
                <Route path="/reagents" element={<Reagents />} />
                <Route path="/import" element={<Import />} />
                <Route path="/runs" element={<RunHistory />} />
                <Route path="/runs/:id" element={<RunDetail />} />
                {/* /runs/:id/execute is defined above outside AppLayout */}
                <Route path="/statistics" element={<Statistics />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Route>
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
            <RouteMeta />
            {/* Global feedback pill — inside the router so it can hide on the
                execution screen and read the current page. On every route. */}
            <FeedbackWidget />
          </BrowserRouter>
          <ReloadPrompt />
        </ToastProvider>
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
