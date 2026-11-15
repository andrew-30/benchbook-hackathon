import { useRegisterSW } from 'virtual:pwa-register/react';
import { Icon } from './Icon';

/**
 * Prompt-to-reload for the installed/offline app. When a new build is deployed,
 * the waiting service worker triggers this toast instead of silently reloading —
 * so nobody gets yanked out of an experiment mid-record. Registers the SW (we
 * set injectRegister: false in the plugin) and checks for updates hourly while
 * the app stays open.
 */
export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        setInterval(() => void registration.update(), 60 * 60 * 1000);
      }
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed z-50 bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:w-96 flex items-center gap-3 rounded-card border border-line bg-white p-4 shadow-xl bb-safe-bottom"
    >
      <span className="flex-none w-9 h-9 rounded-full bg-primary/10 text-primary grid place-items-center">
        <Icon name="sparkles" size={17} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink">New version available</div>
        <div className="text-xs text-muted">Reload to get the latest Benchbook.</div>
      </div>
      <button onClick={() => setNeedRefresh(false)} className="bb-btn-ghost shrink-0">
        Later
      </button>
      <button onClick={() => void updateServiceWorker(true)} className="bb-btn-primary shrink-0">
        Reload
      </button>
    </div>
  );
}
