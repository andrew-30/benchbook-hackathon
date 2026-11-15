import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ImportNetworkError,
  useAiImport,
  useAiImportConfirm,
} from '../hooks/useImport';
import { PageTransition } from '../components/PageTransition';
import { SectionChoiceModal } from '../components/SectionChoiceModal';
import { Icon, type IconName } from '../components/Icon';
import { usePageTitle } from '../hooks/usePageTitle';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, formatBytes } from '../lib/uploadLimits';
import {
  isImportPreview,
  isImportSplit,
  type ImportPreview,
  type ImportResult,
  type ImportSplitResult,
  type ProtocolStep,
} from '../lib/types';

type Tab = 'ai' | 'paste';

/** Small "AI-assisted" affordance shown once, on the success cards — an
 *  intentional nod to the AI extraction, not a gimmick sprinkled everywhere.
 *  User-facing copy never names the model. */
function AiAssistedChip() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
      <Icon name="sparkles" size={11} />
      AI-assisted
    </span>
  );
}

function StepPreview({ step }: { step: ProtocolStep }) {
  return (
    <div className="bb-card p-3">
      <div className="flex items-start gap-3">
        <div className="text-xs font-semibold text-primary bg-primary/10 rounded-full w-6 h-6 flex items-center justify-center shrink-0">
          {step.step_order}
        </div>
        <div className="min-w-0 flex-1">
          {step.title && (
            <div className="text-xs uppercase tracking-wide text-primary mb-0.5">
              {step.title}
            </div>
          )}
          <p className="text-sm text-ink mt-0.5 whitespace-pre-wrap">{step.instruction}</p>
          {step.is_critical && (
            <span className="inline-flex items-center gap-1 mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-danger/10 text-danger uppercase tracking-wide">
              <Icon name="alert" size={11} />
              Critical
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Preview({
  result,
  onConfirm,
  onReset,
  onAnother,
  navigating,
}: {
  result: ImportResult;
  onConfirm: () => void;
  onReset: () => void;
  onAnother: () => void;
  navigating: boolean;
}) {
  const reagentsCreated = result.reagents_created ?? 0;
  const reagentNames = result.reagents_created_names ?? [];
  const reagentPreview = reagentNames.slice(0, 5);
  return (
    <div className="space-y-4">
      <div className="bb-card p-4 bg-success/10 border-success/20">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <Icon name="check" size={18} className="mt-0.5 shrink-0 text-success" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-success">
                Protocol imported successfully
              </div>
              <div className="text-sm text-ink mt-0.5">
                <span className="font-semibold">{result.protocol.name}</span> —{' '}
                {result.step_count} {result.step_count === 1 ? 'step' : 'steps'} created
              </div>
              {result.protocol.description && (
                <p className="text-sm text-muted mt-1">{result.protocol.description}</p>
              )}
            </div>
          </div>
          <AiAssistedChip />
        </div>
      </div>

      {/* Auto-detected reagents banner — only when the backend created any. */}
      {reagentsCreated > 0 && (
        <div className="bb-card p-4 bg-warning/10 border-warning/20">
          <div className="flex items-start gap-2.5">
            <Icon name="flask" size={18} className="mt-0.5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-warning">
                {reagentsCreated} material{reagentsCreated === 1 ? '' : 's'} detected from
                your protocol
              </div>
              <p className="text-sm text-ink mt-1">
                We found these materials in your protocol and added them to your Reagent
                Library. Add lot numbers and expiry dates before your first experiment.
              </p>
              {reagentPreview.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-sm text-ink space-y-0.5">
                  {reagentPreview.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                  {reagentNames.length > reagentPreview.length && (
                    <li className="text-xs text-muted list-none -ml-5">
                      + {reagentNames.length - reagentPreview.length} more
                    </li>
                  )}
                </ul>
              )}
              <Link
                to={`/reagents?tab=by-protocol&protocol=${result.protocol.id}`}
                className="inline-flex mt-3 bb-btn-primary gap-1.5"
              >
                Fill in Lot Numbers
                <Icon name="arrow-right" size={16} />
              </Link>
            </div>
          </div>
        </div>
      )}

      <StepsPreview steps={result.steps} totalCount={result.step_count} />

      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
        <button onClick={onReset} className="bb-btn-ghost">Start over</button>
        <button onClick={onAnother} className="bb-btn-ghost">Import Another</button>
        <button onClick={onConfirm} className="bb-btn-primary gap-1.5" disabled={navigating}>
          View Protocol
          <Icon name="arrow-right" size={16} />
        </button>
      </div>
    </div>
  );
}

function DropZone({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  }

  function openPicker() {
    inputRef.current?.click();
  }

  return (
    <div
      onClick={openPicker}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPicker();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={file ? `Selected file ${file.name}. Click to change.` : 'Upload SOP document'}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`rounded-card border-2 border-dashed p-8 text-center cursor-pointer transition min-h-[180px] flex flex-col items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
        dragging
          ? 'border-primary bg-primary/5'
          : 'border-line bg-white hover:border-primary/50 hover:bg-primary/5'
      }`}
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-colors ${
          dragging ? 'bg-primary/15 text-primary' : 'bg-primary/10 text-primary'
        }`}
      >
        <Icon name="upload" size={22} />
      </span>
      <div className="mt-2 text-sm font-medium text-ink">
        {file ? file.name : dragging ? 'Drop to upload' : 'Drag your SOP document here'}
      </div>
      <div className="text-xs text-muted mt-1">
        {file
          ? `${(file.size / 1024).toFixed(1)} kB — click to change`
          : `or click to browse • .docx, .txt or .pdf • up to ${MAX_UPLOAD_MB}MB`}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".docx,.txt,.pdf,text/plain,application/pdf"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

export function Import() {
  usePageTitle('Import Protocol');
  const navigate = useNavigate();
  // Surface retry state via callback into local state so the spinner panel
  // can show "Retrying (attempt 2 of 3)" while the hook's retry loop runs.
  const [retryStatus, setRetryStatus] = useState<{ attempt: number; total: number } | null>(null);
  const importer = useAiImport((attempt, total) => setRetryStatus({ attempt, total }));
  const confirmer = useAiImportConfirm();
  const [tab, setTab] = useState<Tab>('ai');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  // Split result handled separately so the success card can render a
  // "N protocols created" summary instead of one protocol's preview.
  const [splitResult, setSplitResult] = useState<ImportSplitResult | null>(null);
  // When the backend returns requires_choice=true we stash the preview and
  // open the modal. The user picks one|separate, we POST back with the
  // echoed extraction, and route the response into result/splitResult.
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // Rejected client-side before any request is sent — an over-limit upload is
  // killed by the platform with a plain-text 413 our API never sees, so this is
  // the only place the user can get a message that names the file and the size.
  const [fileError, setFileError] = useState<string | null>(null);

  function onSelectFile(f: File | null) {
    setFileError(null);
    if (f && f.size > MAX_UPLOAD_BYTES) {
      setFileError(
        `"${f.name}" is ${formatBytes(f.size)} — the maximum is ${MAX_UPLOAD_MB}MB. ` +
          'Paste the procedure text instead, or split the document into smaller files.',
      );
      setFile(null);
      return;
    }
    setFile(f);
  }

  const canExtract = tab === 'ai' ? !!file : text.trim().length >= 20;

  async function onExtract() {
    setResult(null);
    setSplitResult(null);
    setPreview(null);
    setConfirmError(null);
    setRetryStatus(null);
    try {
      const r = await importer.mutateAsync(tab === 'ai' ? { file } : { text });
      if (isImportPreview(r)) {
        setPreview(r);
      } else if (isImportSplit(r)) {
        // Phase-1 already split — shouldn't happen without a split_choice,
        // but route defensively so we don't dead-end.
        setSplitResult(r);
      } else {
        setResult(r);
      }
    } catch {
      // Errors stay visible inline via importer.error.
    } finally {
      setRetryStatus(null);
    }
  }

  async function onConfirmChoice(
    choice: 'one' | 'separate' | 'custom',
    groups?: number[][],
  ) {
    if (!preview) return;
    setConfirmError(null);
    try {
      const r = await confirmer.mutateAsync({
        extracted: preview.extracted,
        split_choice: choice,
        // `groups` is only meaningful when choice === 'custom'; for the
        // other two paths the backend ignores it. Still attach it for
        // 'custom' so the request shape is explicit.
        ...(choice === 'custom' && groups ? { groups } : {}),
      });
      setPreview(null);
      if (isImportPreview(r)) {
        // Defensive — backend shouldn't preview a second time when
        // split_choice is set.
        setConfirmError('Unexpected preview response from server.');
      } else if (isImportSplit(r)) {
        setSplitResult(r);
      } else {
        setResult(r);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed';
      setConfirmError(msg);
    }
  }

  function onReset() {
    setResult(null);
    setSplitResult(null);
    setPreview(null);
    setConfirmError(null);
    setFile(null);
    setFileError(null);
    setText('');
    importer.reset();
    confirmer.reset();
  }

  return (
    <PageTransition>
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-5">
      <header>
        <h1 className="text-2xl text-ink md:text-3xl">Import a protocol</h1>
        <p className="text-sm text-muted mt-1">
          Drop an SOP or paste text — we extract the steps and materials for you.
        </p>
      </header>

      {!result && !splitResult && (
        <>
          <nav className="flex gap-1 border-b border-line">
            {(
              [
                { value: 'ai', label: 'AI Import', icon: 'sparkles' },
                { value: 'paste', label: 'Paste Text', icon: 'file' },
              ] as const
            ).map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`inline-flex min-h-[44px] items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                  tab === t.value
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <Icon name={t.icon as IconName} size={15} />
                {t.label}
              </button>
            ))}
          </nav>

          {tab === 'ai' ? (
            <>
              <DropZone file={file} onFile={onSelectFile} />
              {fileError && (
                <div className="bb-card p-3 border-danger/20 bg-danger/5 flex items-start gap-2 text-sm text-danger">
                  <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                  <span className="min-w-0">{fileError}</span>
                </div>
              )}
              {file && <FileSizeHint sizeBytes={file.size} />}
            </>
          ) : (
            <textarea
              rows={14}
              className="bb-input resize-y font-mono text-sm min-h-[200px]"
              placeholder="Paste your protocol text here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}

          {importer.error && (
            <div className="bb-card p-3 border-danger/20 bg-danger/5 flex flex-wrap items-start justify-between gap-2">
              <span className="min-w-0 flex items-start gap-2 text-sm text-danger">
                <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                {(importer.error as Error).message}
              </span>
              {/* Only network errors get an inline Try Again — HTTP errors
                  (free-tier limits, malformed documents) need the user to
                  change something rather than just retry. */}
              {importer.error instanceof ImportNetworkError && (
                <button
                  onClick={onExtract}
                  className="bb-btn-ghost text-xs gap-1.5"
                  disabled={importer.isPending}
                >
                  <Icon name="reset" size={14} />
                  Try Again
                </button>
              )}
            </div>
          )}

          {importer.isPending && <ImportProgress retryStatus={retryStatus} />}

          <div>
            <button
              onClick={onExtract}
              className="bb-btn-primary w-full sm:w-auto sm:float-right min-h-[56px] text-base gap-1.5"
              disabled={!canExtract || importer.isPending}
            >
              {importer.isPending ? (
                'Extracting…'
              ) : (
                <>
                  Extract Steps
                  <Icon name="arrow-right" size={16} />
                </>
              )}
            </button>
          </div>
        </>
      )}

      {result && (
        <Preview
          result={result}
          navigating={false}
          onReset={onReset}
          onAnother={onReset}
          onConfirm={() => navigate(`/protocols/${result.protocol.id}`)}
        />
      )}

      {splitResult && (
        <SplitPreview
          result={splitResult}
          onReset={onReset}
          onAnother={onReset}
          onView={() => navigate('/protocols')}
        />
      )}

      {preview && (
        <SectionChoiceModal
          protocolName={preview.protocol_name}
          totalStepCount={preview.step_count}
          sections={preview.sections}
          submitting={confirmer.isPending}
          errorMessage={confirmError}
          onConfirm={onConfirmChoice}
          onCancel={() => {
            setPreview(null);
            setConfirmError(null);
          }}
        />
      )}
    </div>
    </PageTransition>
  );
}

/** Success card for the split-into-N-protocols path. Mirrors the single
 *  Preview component's visual rhythm so the user feels at home. */
function SplitPreview({
  result,
  onReset,
  onAnother,
  onView,
}: {
  result: ImportSplitResult;
  onReset: () => void;
  onAnother: () => void;
  onView: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bb-card p-4 bg-success/10 border-success/20">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2.5">
            <Icon name="check" size={18} className="mt-0.5 shrink-0 text-success" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-success">
                Created {result.protocols_created} protocols
              </div>
              <p className="text-sm text-ink mt-1">
                One protocol per section, ready to view in your library.
              </p>
            </div>
          </div>
          <AiAssistedChip />
        </div>
        <ul className="mt-3 space-y-1 text-sm text-ink">
          {result.protocols.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between gap-3">
              <span className="truncate inline-flex items-center gap-1.5">
                <Icon name="file" size={13} className="shrink-0 text-muted" />
                {p.name}
              </span>
              <span className="text-xs text-muted whitespace-nowrap shrink-0">
                {p.step_count} {p.step_count === 1 ? 'step' : 'steps'}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
        <button onClick={onReset} className="bb-btn-ghost">Start over</button>
        <button onClick={onAnother} className="bb-btn-ghost">Import Another</button>
        <button onClick={onView} className="bb-btn-primary gap-1.5">
          View Protocols
          <Icon name="arrow-right" size={16} />
        </button>
      </div>
    </div>
  );
}

/**
 * Section-aware preview shown on the success card. When the AI extraction
 * gave steps titles (the section-aware prompt produces these), we group by
 * title so the researcher sees the document's structure instead of a flat
 * 1..N list. Untitled steps fall back to the original flat StepPreview
 * format. Caps each section at 5 visible items.
 */
/** First five extracted steps as a flat list — steps are no longer grouped
 *  under section headings anywhere in the app. */
function StepsPreview({
  steps,
  totalCount,
}: {
  steps: ProtocolStep[];
  totalCount: number;
}) {
  const flat = steps.slice(0, 5);
  return (
    <div className="space-y-2">
      {flat.map((s) => (
        <StepPreview key={s.step_order} step={s} />
      ))}
      {totalCount > flat.length && (
        <div className="text-xs text-muted text-center">
          …and {totalCount - flat.length} more
        </div>
      )}
    </div>
  );
}

/** Size-based heads-up shown beneath the DropZone. Two tiers:
 *  >200KB = warning-tinted "may take up to 2 minutes" reassurance,
 *  >500KB = stronger nudge toward the Paste-text path which sidesteps
 *  mammoth extraction + lets the user trim down to just the procedure. */
function FileSizeHint({ sizeBytes }: { sizeBytes: number }) {
  if (sizeBytes > 500_000) {
    return (
      <div className="rounded-card border border-warning/35 bg-warning/10 px-4 py-3 text-sm text-ink flex items-start gap-2.5">
        <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-warning" />
        <div>
          <div className="font-semibold text-warning">Very large document</div>
          <p className="mt-1">
            For best results with documents this large, try pasting just the
            procedure steps section using the <strong>Paste text</strong> tab.
          </p>
        </div>
      </div>
    );
  }
  if (sizeBytes > 200_000) {
    return (
      <div className="rounded-card border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-ink flex items-start gap-2.5">
        <Icon name="alert" size={16} className="mt-0.5 shrink-0 text-warning" />
        <div>
          <div className="font-semibold text-warning">Large document detected</div>
          <p className="mt-1">
            Documents over 200KB may take up to 2 minutes to process. Please
            wait after clicking Extract Steps.
          </p>
        </div>
      </div>
    );
  }
  return null;
}

/** Spinner + progressively-reassuring copy while the import is in flight.
 *  The 10s/30s breakpoints come from the typical end-to-end Claude latency:
 *  most small protocols return in <10s; anything longer should explicitly
 *  tell the user it's still working (otherwise it reads as frozen).
 *  retryStatus comes from useAiImport's onRetry callback and pre-empts the
 *  elapsed-time copy so the user knows a network blip is being recovered. */
function ImportProgress({
  retryStatus,
}: {
  retryStatus: { attempt: number; total: number } | null;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, []);
  let message: string;
  if (retryStatus) {
    message = `Retrying — attempt ${retryStatus.attempt} of ${retryStatus.total}…`;
  } else if (elapsed >= 30) {
    message = 'Almost there — extracting protocol steps from your document.';
  } else if (elapsed >= 10) {
    message = 'Still processing — large documents can take up to 2 minutes.';
  } else {
    message = 'Reading your protocol…';
  }
  return (
    <div className="bb-card p-4 flex items-center gap-3 text-sm text-muted">
      <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span>{message}</span>
    </div>
  );
}
