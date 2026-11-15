import type { ReactNode } from 'react';

/**
 * Frames a mocked-up Benchbook screen as a small browser window — three quiet
 * chrome dots + a "benchbook.app/…" address pill — so it reads as a real
 * product screenshot rather than a floating card. Shared by the "/"
 * landing page so every marketing mockup looks identical.
 *
 * `contentClassName` sets the background of the screen area itself (white for
 * light screens, slate-900 for the dark in-run execution screen).
 */
export function ScreenFrame({
  path,
  contentClassName = 'bg-white',
  children,
  className = '',
}: {
  path: string;
  contentClassName?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bb-card overflow-hidden ${className}`}>
      <div className="flex items-center gap-3 border-b border-line bg-neutral-50/70 px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-neutral-300" />
          <span className="h-2 w-2 rounded-full bg-neutral-300" />
          <span className="h-2 w-2 rounded-full bg-neutral-300" />
        </div>
        <div className="flex flex-1 justify-center">
          <span className="max-w-[240px] truncate rounded-full border border-line bg-white px-3 py-0.5 text-[11px] font-medium text-muted">
            benchbook.app/{path}
          </span>
        </div>
      </div>
      <div className={contentClassName}>{children}</div>
    </div>
  );
}
