import { Navigate, useLocation } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';

export function ProfileGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { data, isLoading, error } = useProfile();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-neutral-500">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-sm text-danger">
        Couldn't load your profile: {(error as Error).message}
      </div>
    );
  }

  const hasProfile = !!data?.profile;
  const onOnboarding = location.pathname === '/onboarding';

  if (!hasProfile && !onOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }
  if (hasProfile && onOnboarding) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
