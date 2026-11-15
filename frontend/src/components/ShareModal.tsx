import { useEffect } from 'react';
import { useShareRun } from '../hooks/useShare';
import { useToast } from '../contexts/ToastContext';
import { Icon } from './Icon';

interface Props {
  runId: string;
  onClose: () => void;
}

export function ShareModal({ runId, onClose }: Props) {
  const share = useShareRun(runId);
  const { showToast } = useToast();

  // Generate the share link on open.
  useEffect(() => {
    share.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build the link from the site the user is actually on (www, apex or
  // staging) instead of the API's FRONTEND_URL, which made production share
  // links point at the staging site.
  const url = share.data?.token ? `${window.location.origin}/shared/${share.data.token}` : '';

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Share link copied to clipboard', 'success');
    } catch {
      showToast('Copy failed — select the link manually', 'error');
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/40 bb-animate-fade">
      <div className="w-full max-w-md bb-card p-6 bb-animate-scale">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold">Share this experiment</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-900" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-4 min-h-[64px]">
          {share.isPending ? (
            <div className="flex items-center gap-3 text-sm text-neutral-600">
              <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Generating share link…
            </div>
          ) : share.error ? (
            <div className="bb-card p-3 bg-rose-50 border-rose-200 text-sm text-rose-700">
              {(share.error as Error).message}
            </div>
          ) : url ? (
            <div className="flex flex-col gap-2">
              <label className="bb-label" htmlFor="share-url">Public link</label>
              <input
                id="share-url"
                readOnly
                value={url}
                className="bb-input bg-neutral-50 select-all"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button onClick={copy} className="bb-btn-primary mt-1 gap-1.5">
                <Icon name="copy" size={16} />
                Copy Link
              </button>
            </div>
          ) : null}
        </div>

        <p className="mt-4 text-xs text-neutral-500">
          Anyone with this link can view this experiment without signing in.
        </p>

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="bb-btn-ghost">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
