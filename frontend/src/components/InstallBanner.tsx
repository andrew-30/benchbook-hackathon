import { useState } from 'react';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { Icon } from './Icon';

const DISMISS_KEY = 'bb-install-banner-dismissed-v1';

/**
 * Dismissible "Install Benchbook" strip. On Android/desktop it fires the
 * native install prompt; on iOS Safari (which never auto-prompts) it shows the
 * manual Add-to-Home-Screen steps. Hidden once installed or dismissed — the
 * always-available entry lives in Settings.
 */
export function InstallBanner({ className = '' }: { className?: string }) {
  const { canPrompt, isIOS, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === 'true';
    } catch {
      return false;
    }
  });

  if (dismissed || (!canPrompt && !isIOS)) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      /* storage disabled — banner just reappears next session */
    }
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-card border border-primary/25 bg-primary/5 px-4 py-3 ${className}`}
    >
      <span className="flex-none w-9 h-9 rounded-xl bg-primary text-white grid place-items-center">
        <Icon name="device" size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink">Install Benchbook</div>
        <div className="text-xs text-muted">
          {isIOS ? (
            <>
              Tap <span className="font-medium text-ink">Share</span>, then{' '}
              <span className="font-medium text-ink">Add to Home Screen</span> for a full-screen
              app that works offline.
            </>
          ) : (
            'Get a full-screen app that works offline — right from your browser.'
          )}
        </div>
      </div>
      {canPrompt && (
        <button onClick={() => void promptInstall()} className="bb-btn-primary shrink-0">
          Install
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 text-muted hover:text-ink p-1"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
