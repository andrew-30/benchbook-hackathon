import { useSyncExternalStore } from 'react';

/**
 * Reactive `navigator.onLine`. This is a coarse signal — the browser only knows
 * whether a network interface is up, not whether our server is actually
 * reachable — but it's the right primitive for a "you're offline" banner: a
 * false "online" just means we briefly show data that's still current, and a
 * real disconnect flips it immediately via the `offline` event.
 */
function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true, // server render / first paint: assume online
  );
}
