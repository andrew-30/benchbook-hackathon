import { useEffect } from 'react';

const SUFFIX = 'Benchbook';

/** Sets `document.title` to "[page] — Benchbook" for the lifetime of the component. */
export function usePageTitle(page: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${page} — ${SUFFIX}`;
    return () => {
      document.title = prev;
    };
  }, [page]);
}
