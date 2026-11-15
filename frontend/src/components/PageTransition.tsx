import { useEffect, useState } from 'react';

/**
 * Subtle page entrance — fades in and slides up by 8px over 150ms.
 *
 * Wraps every navigable page (except RunExecution, which is full-bleed dark and
 * has its own staging). The 10ms initial setTimeout lets the browser paint the
 * initial (hidden) state before flipping to visible so the transition actually
 * runs instead of being collapsed on mount.
 *
 * The visible state deliberately carries NO translate class (not even
 * translate-y-0): any transform on this wrapper makes it the containing block
 * for `position: fixed` descendants, so every modal on the page was positioned
 * against the full page height instead of the viewport and opened below the
 * fold.
 */
export function PageTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  // Visible from the start when rendered at build time (no window), so the
  // pre-rendered HTML isn't hidden at opacity 0 for crawlers and no-JS users.
  const [visible, setVisible] = useState(() => typeof window === 'undefined');
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      className={`transition-all duration-150 ease-out ${
        visible ? 'opacity-100' : 'opacity-0 translate-y-2'
      }`}
    >
      {children}
    </div>
  );
}
