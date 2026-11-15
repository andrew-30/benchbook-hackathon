import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Already running as an installed app (own window / iOS home-screen launch). */
function detectStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iOS Safari, where there is no install prompt — only manual Add to Home Screen. */
function detectIOSSafari(): boolean {
  const ua = window.navigator.userAgent;
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ masquerades as macOS; a touch-capable "Mac" is really an iPad.
    (/Macintosh/.test(ua) && 'ontouchend' in document);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome/.test(ua);
  return iOS && isSafari;
}

/**
 * Surfaces installability across platforms:
 *  - `canPrompt`  — Android / desktop Chromium fired `beforeinstallprompt`; we
 *    stashed it and can trigger the native prompt on demand.
 *  - `isIOS`      — iOS Safari, not yet installed; caller shows manual A2HS steps.
 *  - `installed`  — already launched as an installed app; hide install UI.
 */
export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(detectStandalone);
  const [isIOSSafari] = useState(detectIOSSafari);

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      // Stop Chrome's mini-infobar; we present our own button instead.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferred(null);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!deferred) return 'unavailable';
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    return outcome;
  }

  return {
    canPrompt: !!deferred && !installed,
    isIOS: isIOSSafari && !installed,
    installed,
    promptInstall,
  };
}
