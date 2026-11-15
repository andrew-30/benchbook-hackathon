import { useEffect } from 'react';
import { useGenerateMethods } from '../hooks/useMethodsAndPdf';
import { useToast } from '../contexts/ToastContext';
import { apiErrorMessage } from '../lib/api';
import { Icon } from './Icon';

interface Props {
  runId: string;
  onClose: () => void;
}

export function MethodsModal({ runId, onClose }: Props) {
  const generate = useGenerateMethods(runId);
  const { showToast } = useToast();

  // Trigger generation on mount.
  useEffect(() => {
    generate.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function copyToClipboard() {
    if (!generate.data) return;
    try {
      await navigator.clipboard.writeText(generate.data.methods_text);
      showToast('Methods copied to clipboard', 'success');
    } catch {
      showToast('Copy failed — try selecting the text manually', 'error');
    }
  }

  const text = generate.data?.methods_text ?? '';
  const error = generate.error;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/40 overflow-y-auto bb-animate-fade">
      <div className="w-full max-w-2xl bb-card p-6 my-8 bb-animate-scale">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Methods Section</h2>
            <p className="text-sm text-neutral-600 mt-0.5">
              AI-generated draft — review and edit before publication.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-900"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 min-h-[200px]">
          {generate.isPending ? (
            <div className="flex items-center gap-3 text-sm text-neutral-600">
              <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Writing your methods section…
            </div>
          ) : error ? (
            <div className="bb-card p-3 bg-rose-50 border-rose-200 text-sm text-rose-700">
              {apiErrorMessage(error, 'Could not generate the methods section.')}
            </div>
          ) : (
            <article className="bb-card p-4 bg-white whitespace-pre-wrap leading-relaxed text-[15px] text-neutral-900">
              {text}
            </article>
          )}
        </div>

        <p className="mt-3 rounded-card border border-warning/25 bg-warning/5 px-3 py-2 text-xs leading-relaxed text-neutral-700">
          <span className="font-semibold">Disclaimer:</span> This section is generated automatically
          from your experiment record and may contain errors or omissions. Verify every reagent,
          quantity, timing and statistic against your own records before using it. You remain
          responsible for the accuracy of anything you publish.
        </p>

        {generate.data && generate.data.stats.length > 0 && (
          <div className="mt-3 text-xs text-neutral-500">
            Statistics included:{' '}
            {generate.data.stats.map((s, i) => (
              <span key={s.name}>
                {i > 0 && ' · '}
                <span className="font-medium text-neutral-700">{s.name}</span>{' '}
                mean {s.mean.toFixed(2)} ± {s.sd.toFixed(2)} (n={s.n})
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 mt-5">
          <button onClick={onClose} className="bb-btn-ghost">
            ✕ Close
          </button>
          <button
            onClick={() => generate.mutate()}
            className="bb-btn-ghost"
            disabled={generate.isPending}
          >
            ↻ Regenerate
          </button>
          <button
            onClick={copyToClipboard}
            className="bb-btn-primary gap-1.5"
            disabled={!text}
          >
            <Icon name="copy" size={16} />
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}
