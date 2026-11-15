import { useEffect } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Icon, type IconName } from './Icon';
import { OfflineBanner } from './OfflineBanner';
import { InstallBanner } from './InstallBanner';
import { EmailVerificationBanner } from './EmailVerificationBanner';
import { hasSeenTour, markTourSeen } from '../lib/tourState';
import { LEGAL_ENTITY } from '../legal/entity';

// Top nav (md and up) — matches the bottom nav so the IA is consistent on
// every breakpoint. Settings lives separately as an icon-style link on the
// far right alongside Sign out.
const topNav: { to: string; label: string; icon: IconName; tourId?: string }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: 'home' },
  { to: '/protocols', label: 'Protocols', icon: 'flask', tourId: 'protocols' },
  { to: '/reagents', label: 'Reagents', icon: 'droplet', tourId: 'reagents' },
  { to: '/runs', label: 'Experiments', icon: 'run', tourId: 'runs' },
  { to: '/statistics', label: 'Statistics', icon: 'chart', tourId: 'statistics' },
];

// Mobile bottom nav — six tabs after adding Reagents. Each tab still hits a
// comfortable thumb target at 375px width (each tab is ~62px wide).
const bottomNav: { to: string; label: string; icon: IconName; tourId?: string }[] = [
  { to: '/dashboard', label: 'Home', icon: 'home' },
  { to: '/protocols', label: 'Protocols', icon: 'flask', tourId: 'protocols' },
  { to: '/reagents', label: 'Reagents', icon: 'droplet', tourId: 'reagents' },
  { to: '/runs', label: 'Experiments', icon: 'run', tourId: 'runs' },
  { to: '/statistics', label: 'Stats', icon: 'chart', tourId: 'statistics' },
  { to: '/settings', label: 'Settings', icon: 'gear' },
];

export function AppLayout() {
  const { signOut, user } = useAuth();

  // First-run: auto-launch the guided tour once, ever. Mark it seen up front so
  // a refresh mid-tour doesn't relaunch it (the Settings replay button ignores
  // the flag). driver.js is imported lazily so it stays out of the main bundle.
  useEffect(() => {
    if (hasSeenTour()) return;
    markTourSeen();
    const t = setTimeout(() => {
      void import('../lib/guidedTour').then((m) => m.startGuidedTour());
    }, 700);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-full flex flex-col bg-canvas">
      {/* Top nav (desktop + tablet) */}
      <header className="hidden md:flex sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-line h-14 items-center px-6 gap-6">
        <NavLink
          to="/dashboard"
          className="font-display font-semibold text-primary text-lg flex items-center gap-2"
          aria-label="Benchbook home"
        >
          <Icon name="beaker" size={22} />
          <span>Benchbook</span>
        </NavLink>
        <nav className="flex gap-1 flex-1">
          {topNav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              data-tour-d={n.tourId}
              className={({ isActive }) =>
                `inline-flex items-center gap-2 px-3 py-1.5 rounded-card text-sm font-medium transition-all duration-150 ease-out ${
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted hover:text-ink'
                }`
              }
            >
              <Icon name={n.icon} size={17} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-1.5 text-sm ${
              isActive ? 'text-primary font-medium' : 'text-muted hover:text-ink'
            }`
          }
          aria-label="Settings"
          title={user?.email ?? 'Settings'}
        >
          <Icon name="gear" size={18} />
          <span className="hidden lg:inline">Settings</span>
        </NavLink>
        <button onClick={signOut} className="text-sm text-muted hover:text-danger">
          Sign out
        </button>
      </header>

      {/* Mobile header */}
      <header className="md:hidden sticky top-0 z-10 bg-white border-b border-line h-12 flex items-center px-4">
        <NavLink to="/dashboard" className="font-display font-semibold text-primary flex items-center gap-2">
          <Icon name="beaker" size={20} />
          <span>Benchbook</span>
        </NavLink>
      </header>

      <main className="flex-1 pb-28 md:pb-6">
        <OfflineBanner className="mx-4 md:mx-6 mt-3" />
        <EmailVerificationBanner className="mx-4 md:mx-6 mt-3" />
        <InstallBanner className="mx-4 md:mx-6 mt-3" />
        <Outlet />
      </main>

      {/* Minimal legal footer. Extra bottom padding on mobile so the links
          never sit under the fixed bottom nav. */}
      <footer className="text-center py-4 text-xs text-slate-300 pb-24 sm:pb-4">
        <Link to="/why-benchbook" className="hover:text-slate-500">
          Why Benchbook
        </Link>
        {' · '}
        <Link to="/about" className="hover:text-slate-500">
          Our Story
        </Link>
        {' · '}
        <Link to="/privacy" className="hover:text-slate-500">
          Privacy
        </Link>
        {' · '}
        <Link to="/terms" className="hover:text-slate-500">
          Terms
        </Link>
        {' · '}
        © 2026 {LEGAL_ENTITY}
      </footer>

      {/* Bottom nav (mobile only) — taller for thumb reach, with iOS home-indicator
          padding so the labels never sit under the indicator. */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-line flex z-10 bb-safe-bottom"
        aria-label="Primary"
      >
        {bottomNav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/dashboard'}
            data-tour-m={n.tourId}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-1 min-h-[64px] text-[11px] font-medium transition-all duration-200 ease-out relative ${
                isActive ? 'text-primary' : 'text-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {/* Always-mounted indicator pill — opacity-driven so the slide
                    transition has something to interpolate between (rendering
                    it conditionally would just pop in/out). */}
                <span
                  aria-hidden
                  className={`absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 rounded-full bg-primary transition-all duration-200 ease-out ${
                    isActive ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-50'
                  }`}
                />
                <Icon name={n.icon} size={22} />
                <span>{n.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
