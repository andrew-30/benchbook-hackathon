// Lightweight skeleton primitives. Tailwind's `animate-pulse` + neutral
// background is enough to read as "loading" without pulling in a heavy library.

interface SkeletonProps {
  className?: string;
}

export function SkeletonBlock({ className = '' }: SkeletonProps) {
  return (
    <div className={`animate-pulse bg-neutral-200/80 rounded ${className}`} aria-hidden />
  );
}

export function SkeletonCard({ className = '', height = 'h-28' }: SkeletonProps & { height?: string }) {
  return (
    <div className={`bb-card p-4 ${className}`} aria-hidden>
      <div className={`animate-pulse bg-neutral-200/60 rounded ${height}`} />
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bb-card p-4" aria-hidden>
      <div className="animate-pulse bg-neutral-200/60 rounded h-3 w-16" />
      <div className="animate-pulse bg-neutral-200/80 rounded h-8 w-12 mt-2" />
    </div>
  );
}

export function ExperimentRowSkeleton() {
  return (
    <div className="bb-card p-4 flex items-center justify-between gap-4" aria-hidden>
      <div className="flex-1 space-y-2">
        <div className="animate-pulse bg-neutral-200/80 rounded h-4 w-3/4" />
        <div className="animate-pulse bg-neutral-200/60 rounded h-3 w-1/2" />
      </div>
      <div className="animate-pulse bg-neutral-200/80 rounded h-3 w-12" />
    </div>
  );
}

export function ProtocolCardSkeleton() {
  return (
    <div className="bb-card p-4 md:p-5 space-y-3" aria-hidden>
      <div className="animate-pulse bg-neutral-200/80 rounded h-5 w-2/3" />
      <div className="animate-pulse bg-neutral-200/60 rounded h-3 w-1/2" />
      <div className="animate-pulse bg-neutral-200/60 rounded h-3 w-full" />
      <div className="flex gap-2 mt-2">
        <div className="animate-pulse bg-neutral-200/80 rounded-card h-9 flex-1" />
        <div className="animate-pulse bg-neutral-200/60 rounded-card h-9 w-16" />
      </div>
    </div>
  );
}

export function StepRowSkeleton() {
  return (
    <div className="bb-card p-4 flex gap-3" aria-hidden>
      <div className="animate-pulse bg-neutral-200/80 rounded-full w-7 h-7 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="animate-pulse bg-neutral-200/60 rounded h-3 w-16" />
        <div className="animate-pulse bg-neutral-200/80 rounded h-4 w-full" />
        <div className="animate-pulse bg-neutral-200/60 rounded h-3 w-1/3" />
      </div>
    </div>
  );
}
