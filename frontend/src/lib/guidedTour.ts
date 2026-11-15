import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { markTourSeen } from './tourState';

/**
 * First-run product tour — a spotlight walk through the persistent navigation
 * so a new user learns the core loop (protocol → reagents → run → stats) in a
 * handful of steps.
 *
 * Anchored to the always-present nav, so it works from any AppLayout page and
 * across breakpoints: the top nav carries `data-tour-d` on desktop, the bottom
 * nav carries `data-tour-m` on mobile — we pick the one that's actually
 * visible. driver.js is loaded lazily by the caller (AppLayout auto-start /
 * Settings replay button) so it stays out of the main bundle.
 */
export function startGuidedTour(): void {
  const desktop = window.matchMedia('(min-width: 768px)').matches;
  const attr = desktop ? 'data-tour-d' : 'data-tour-m';
  const side = desktop ? 'bottom' : 'top';

  const nav = (id: string, title: string, description: string): DriveStep => ({
    element: `[${attr}="${id}"]`,
    popover: { title, description, side, align: 'start' },
  });

  const steps: DriveStep[] = [
    {
      popover: {
        title: 'Welcome to Benchbook',
        description:
          'A quick tour of how you turn a protocol into a recorded experiment. Skip anytime — you can replay this from Settings.',
      },
    },
    nav(
      'protocols',
      'Protocols — your recipes',
      'Every experiment starts from a protocol: its steps, materials, and checks. Import one from a Word doc, or build it here.',
    ),
    nav(
      'reagents',
      'Reagents & materials',
      'Track lot numbers and expiry dates so Benchbook can flag an expired reagent before you run.',
    ),
    nav(
      'runs',
      'Experiments',
      'Run a protocol step by step — with timers, measurements, and deviations — and every run is recorded here.',
    ),
    nav(
      'statistics',
      'Statistics',
      'See trends across your experiments: completion, timing, and how your measurements spread.',
    ),
    {
      popover: {
        title: "That's the loop",
        description:
          'Protocol → run → record. Ready? Start by adding your first protocol — replay this tour anytime from Settings.',
      },
    },
  ];

  // Defensive: drop any nav step whose target isn't in the DOM (unusual
  // breakpoint, future nav change) so the tour never dead-ends on a missing
  // element.
  const usable = steps.filter(
    (s) => !s.element || document.querySelector(s.element as string),
  );

  const tour = driver({
    showProgress: true,
    overlayColor: 'rgba(15, 11, 32, 0.6)',
    popoverClass: 'benchbook-tour',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    steps: usable,
    onDestroyed: () => markTourSeen(),
  });
  tour.drive();
}
