import type { ReactNode } from 'react';

export function PagePlaceholder({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8">
      <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
      {description && <p className="mt-1 text-sm text-neutral-600">{description}</p>}
      <div className="mt-6 bb-card p-6 text-sm text-neutral-500">
        {children ?? (
          <>
            <p>This page is a Day 1 placeholder.</p>
            <p className="mt-2">Feature implementation lands in subsequent days.</p>
          </>
        )}
      </div>
    </div>
  );
}
