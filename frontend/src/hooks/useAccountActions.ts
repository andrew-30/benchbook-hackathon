import { useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { secondsToDisplay } from '../lib/duration';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Shared export-payload shape and helpers
// ---------------------------------------------------------------------------

/**
 * The /api/users/export response. Loose-typed because the backend evolves
 * the shape (new fields like has_expired_reagent, timer_tolerance_seconds)
 * without breaking older consumers — the export hooks only read what they
 * need and fall back gracefully on missing fields.
 */
interface ExportPayload {
  exported_at: string;
  export_version: string;
  user: {
    name: string | null;
    institution: string | null;
    research_area: string | null;
    created_at: string | null;
  } | null;
  summary: {
    total_protocols: number;
    total_experiments: number;
    total_reagents: number;
    total_steps_completed: number;
  };
  protocols: Array<{
    name: string;
    description: string | null;
    classification: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    steps: Array<{
      step_order: number;
      title: string | null;
      instruction: string;
      expected_duration_seconds?: number | null;
      timer_tolerance_seconds?: number | null;
      measurement_parameters?: Array<{
        name: string;
        unit?: string | null;
        min_value?: number | null;
        max_value?: number | null;
        target_value?: number | null;
        tolerance?: number | null;
      }>;
    }>;
    checklist_items: Array<{ item_text: string; category: string }>;
  }>;
  experiments: Array<{
    protocol_name: string;
    run_state: string;
    run_started_at: string;
    run_ended_at: string | null;
    operator_name: string | null;
    has_expired_reagent: boolean;
    notes: string | null;
    result_notes: string | null;
    checklist_completed: Record<string, unknown>;
    steps_snapshot: Array<{
      step_order: number;
      title?: string | null;
      instruction: string;
      measurement_parameters?: Array<{
        name: string;
        unit?: string | null;
        min_value?: number | null;
        max_value?: number | null;
        target_value?: number | null;
        tolerance?: number | null;
      }>;
    }>;
    step_runs: Array<{
      step_order: number;
      step_state: string;
      step_completed_at: string | null;
      timer_elapsed_seconds: number;
      measurement_values: Record<string, unknown>;
      notes: string | null;
      deviation_flagged: boolean;
      deviation_description: string | null;
    }>;
  }>;
  reagents: Array<{
    name: string;
    manufacturer: string | null;
    catalogue_number: string | null;
    current_lot_number: string | null;
    expiry_date: string | null;
    storage_conditions: string | null;
    notes: string | null;
    category: string;
    status: string;
    needs_details?: boolean;
    protocol_id?: string | null;
  }>;
}

/** Fetch the full export payload — used by Excel + PDF hooks. The raw JSON
 *  download path stays as-is in `useExportData` below. */
async function fetchExportPayload(): Promise<ExportPayload> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${API_URL}/api/users/export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** HTML-escape user-supplied strings before embedding them in the PDF
 *  template. Critical because protocol names + notes + reagent fields are
 *  free text and would otherwise allow markup injection. */
function escapeHtml(input: unknown): string {
  if (input == null) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function classifyMeasurement(
  value: number,
  min: number | null | undefined,
  max: number | null | undefined,
  target: number | null | undefined,
  tolerance: number | null | undefined,
): 'within_tolerance' | 'outside_tolerance' | 'outside_spec' | 'no_spec' {
  const hasMin = typeof min === 'number' && Number.isFinite(min);
  const hasMax = typeof max === 'number' && Number.isFinite(max);
  const hasTol =
    typeof target === 'number' && Number.isFinite(target) &&
    typeof tolerance === 'number' && Number.isFinite(tolerance);
  if (hasMin && value < (min as number)) return 'outside_spec';
  if (hasMax && value > (max as number)) return 'outside_spec';
  if (hasTol) {
    const lo = (target as number) - (tolerance as number);
    const hi = (target as number) + (tolerance as number);
    return value < lo || value > hi ? 'outside_tolerance' : 'within_tolerance';
  }
  if (hasMin || hasMax) return 'within_tolerance';
  return 'no_spec';
}

// Run-state pill for the exported notebook — mirrors the app's status colours
// (completed = green, in-progress = indigo, abandoned = amber).
function runStatusBadge(state: string): string {
  const cls =
    state === 'completed'
      ? 'badge-completed'
      : state === 'abandoned'
        ? 'badge-abandoned'
        : 'badge-in_progress';
  const label = state.charAt(0).toUpperCase() + state.slice(1).replace(/_/g, ' ');
  return `<span class="status-badge ${cls}">${escapeHtml(label)}</span>`;
}

function statusLabel(s: ReturnType<typeof classifyMeasurement>): string {
  if (s === 'within_tolerance') return 'Within tolerance';
  if (s === 'outside_tolerance') return 'Outside tolerance';
  if (s === 'outside_spec') return 'Outside specification';
  return 'No spec';
}

function expiryStatus(iso: string | null | undefined): {
  label: string;
  cssClass: string;
} {
  if (!iso) return { label: 'No date', cssClass: '' };
  const days = Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: `Expired ${Math.abs(days)} days ago`, cssClass: 'status-expired' };
  if (days < 30) return { label: `Expires in ${days} days`, cssClass: 'status-warning' };
  return { label: 'Valid', cssClass: 'status-valid' };
}

/**
 * GDPR — Export all my data. Fetches the JSON archive from the backend and
 * triggers a browser download. We can't use the regular api() helper here
 * because we need the raw response body as a blob.
 *
 * Errors propagate so the caller can render them via the toast system.
 */
export function useExportData() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Not signed in');
      const res = await fetch(`${API_URL}/api/users/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        // Try to surface a structured error message if the body parses as
        // JSON; fall back to status text otherwise.
        let msg = `Export failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const date = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `benchbook-export-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Defer revoke until the browser has had a moment to start the
      // download — revoking too early in some browsers cancels the file.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { ok: true as const };
    },
  });
}

export interface DeleteRequestSummary {
  protocols_count: number;
  experiments_count: number;
  reagents_count: number;
  warning: string;
}

/** Step 1 of the account-deletion flow — returns the counts the modal
 *  shows on its warning screen. */
export function useDeleteRequest() {
  return useMutation({
    mutationFn: () =>
      api<DeleteRequestSummary>('/api/users/delete-request', { method: 'POST' }),
  });
}

/**
 * Step 2 — actually deletes the account. The backend verifies
 * `confirmation_email` matches the authenticated user's email server-side
 * before doing anything destructive.
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: (confirmationEmail: string) =>
      api<{ message: string }>('/api/users/account', {
        method: 'DELETE',
        body: JSON.stringify({ confirmation_email: confirmationEmail }),
      }),
  });
}

// ---------------------------------------------------------------------------
// Excel export — four sheets aimed at the researcher who wants to slice
// their measurement data in their tool of choice.
// ---------------------------------------------------------------------------

/**
 * Builds a four-sheet workbook (Experiments / Measurements / Protocols /
 * Reagents) and triggers download. The `xlsx` package is lazy-imported the
 * first time the user clicks Export → keeps the main JS bundle small
 * (xlsx is ~600KB minified) since most visitors never export.
 */
export function useExportExcel() {
  return useMutation({
    mutationFn: async () => {
      const payload = await fetchExportPayload();
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      // Sheet 1 — Experiments (one row per run, newest first).
      const experiments = [...payload.experiments].sort(
        (a, b) =>
          new Date(b.run_started_at).getTime() -
          new Date(a.run_started_at).getTime(),
      );
      const experimentRows: (string | number)[][] = [
        [
          'Date',
          'Protocol',
          'Status',
          'Duration',
          'Steps Completed',
          'Deviations',
          'Notes',
          'Expired Reagent Used',
        ],
      ];
      for (const exp of experiments) {
        const startedMs = new Date(exp.run_started_at).getTime();
        const endedMs = exp.run_ended_at ? new Date(exp.run_ended_at).getTime() : null;
        const durationSecs = endedMs ? Math.max(0, Math.round((endedMs - startedMs) / 1000)) : 0;
        const stepsCompleted = exp.step_runs.filter((s) => s.step_state === 'completed').length;
        const deviations = exp.step_runs.filter((s) => s.deviation_flagged).length;
        experimentRows.push([
          formatDate(exp.run_started_at),
          exp.protocol_name,
          exp.run_state,
          durationSecs > 0 ? secondsToDisplay(durationSecs) : '—',
          stepsCompleted,
          deviations,
          exp.notes ?? '',
          exp.has_expired_reagent ? 'Yes' : 'No',
        ]);
      }
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(experimentRows),
        'Experiments',
      );

      // Sheet 2 — Measurements. One row per (run, step_run, parameter) so the
      // researcher can pivot in Excel/Sheets directly. Spec + tolerance + a
      // pre-computed Status column let them filter on validity without
      // re-deriving the rules.
      const measurementRows: (string | number)[][] = [
        [
          'Date',
          'Protocol',
          'Experiment #',
          'Step',
          'Parameter',
          'Value',
          'Unit',
          'Target',
          'Tolerance',
          'Min Spec',
          'Max Spec',
          'Status',
          'Deviation Flagged',
        ],
      ];
      // Number experiments by chronology (oldest = 1) so "Experiment #" is
      // stable per protocol — useful when comparing reproducibility runs.
      const experimentNumbers = new Map<string, number>();
      const chronological = [...payload.experiments].sort(
        (a, b) =>
          new Date(a.run_started_at).getTime() -
          new Date(b.run_started_at).getTime(),
      );
      const perProtocolIndex = new Map<string, number>();
      for (const exp of chronological) {
        const next = (perProtocolIndex.get(exp.protocol_name) ?? 0) + 1;
        perProtocolIndex.set(exp.protocol_name, next);
        experimentNumbers.set(`${exp.protocol_name}|${exp.run_started_at}`, next);
      }
      for (const exp of experiments) {
        const expNum =
          experimentNumbers.get(`${exp.protocol_name}|${exp.run_started_at}`) ?? 0;
        // Build a step-order → snapshot index so we can resolve parameter
        // specs (target/tolerance/min/max) per step.
        const snapshotByOrder = new Map(
          (exp.steps_snapshot ?? []).map((s) => [s.step_order, s]),
        );
        for (const sr of exp.step_runs) {
          const snap = snapshotByOrder.get(sr.step_order);
          const params = snap?.measurement_parameters ?? [];
          for (const [name, raw] of Object.entries(sr.measurement_values ?? {})) {
            if (raw == null || raw === '') continue;
            const num = typeof raw === 'number' ? raw : Number(raw);
            if (!Number.isFinite(num)) continue;
            const spec = params.find((p) => p.name === name);
            const status = classifyMeasurement(
              num,
              spec?.min_value,
              spec?.max_value,
              spec?.target_value,
              spec?.tolerance,
            );
            measurementRows.push([
              formatDate(exp.run_started_at),
              exp.protocol_name,
              expNum,
              `Step ${sr.step_order}${snap?.title ? ` — ${snap.title}` : ''}`,
              name,
              num,
              spec?.unit ?? '',
              spec?.target_value ?? '',
              spec?.tolerance ?? '',
              spec?.min_value ?? '',
              spec?.max_value ?? '',
              statusLabel(status),
              sr.deviation_flagged ? 'Yes' : 'No',
            ]);
          }
        }
      }
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(measurementRows),
        'Measurements',
      );

      // Sheet 3 — Protocols. Compute "Last Used" + "Total Experiments" from
      // the experiments slice rather than per-row joins on the backend.
      const experimentsByProtocol = new Map<
        string,
        { count: number; lastUsed: number | null }
      >();
      for (const exp of payload.experiments) {
        const t = new Date(exp.run_started_at).getTime();
        const cur = experimentsByProtocol.get(exp.protocol_name) ?? {
          count: 0,
          lastUsed: null,
        };
        cur.count += 1;
        if (cur.lastUsed == null || t > cur.lastUsed) cur.lastUsed = t;
        experimentsByProtocol.set(exp.protocol_name, cur);
      }
      const protocolRows: (string | number)[][] = [
        [
          'Protocol Name',
          'Classification',
          'Status',
          'Steps',
          'Created Date',
          'Last Used',
          'Total Experiments',
        ],
      ];
      for (const proto of payload.protocols) {
        const stats = experimentsByProtocol.get(proto.name) ?? {
          count: 0,
          lastUsed: null,
        };
        protocolRows.push([
          proto.name,
          proto.classification ?? '',
          proto.status,
          proto.steps.length,
          formatDate(proto.created_at),
          stats.lastUsed ? formatDate(new Date(stats.lastUsed).toISOString()) : '—',
          stats.count,
        ]);
      }
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(protocolRows),
        'Protocols',
      );

      // Sheet 4 — Reagents.
      const reagentRows: (string | number)[][] = [
        [
          'Name',
          'Manufacturer',
          'Catalogue Number',
          'Current Lot',
          'Expiry Date',
          'Category',
          'Storage',
          'Status',
          'Protocol',
        ],
      ];
      for (const r of payload.reagents) {
        reagentRows.push([
          r.name,
          r.manufacturer ?? '',
          r.catalogue_number ?? '',
          r.current_lot_number ?? '',
          r.expiry_date ? formatDate(r.expiry_date) : '—',
          r.category,
          r.storage_conditions ?? '',
          r.status,
          // protocol_id is opaque in the export (IDs are stripped), so this
          // column is blank for backwards-compatible payloads. Future
          // versions could include a protocol_name field.
          '',
        ]);
      }
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(reagentRows),
        'Reagents',
      );

      XLSX.writeFile(wb, `benchbook-data-${todayStamp()}.xlsx`);
      return { ok: true as const };
    },
  });
}

// ---------------------------------------------------------------------------
// PDF (browser-print) export — opens a print-optimised HTML document in a
// new tab and triggers the print dialog. The user picks "Save as PDF" from
// the browser's native print sheet, which every researcher recognises.
// ---------------------------------------------------------------------------

export function useExportPDF() {
  return useMutation({
    mutationFn: async () => {
      const payload = await fetchExportPayload();
      const html = buildLabNotebookHtml(payload);

      // Open a new tab; some browsers ignore window.open from non-direct
      // user gestures, so this MUST be called inside the React click
      // handler chain (the mutation runs synchronously up to the first
      // await, which happens above). If the popup is blocked we report it.
      const win = window.open('', '_blank');
      if (!win) {
        throw new Error(
          'Popup blocked — allow popups for this site, then try again.',
        );
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
      // Wait for the new document's load event before triggering print so
      // images / fonts / layout have all settled. onload fires reliably
      // after document.close() in Chromium and Firefox.
      win.onload = () => {
        try {
          win.focus();
          win.print();
        } catch {
          /* user can still print manually */
        }
      };
      return { ok: true as const };
    },
  });
}

function buildLabNotebookHtml(data: ExportPayload): string {
  const userName = data.user?.name ?? 'Researcher';
  const protocolsHtml = data.protocols
    .map(
      (p) => `
    <h3>${escapeHtml(p.name)}</h3>
    <p class="meta">
      ${escapeHtml(p.classification ?? 'Unclassified')} ·
      ${p.steps.length} step${p.steps.length === 1 ? '' : 's'} ·
      Created: ${escapeHtml(formatDate(p.created_at))}
    </p>
    ${p.description ? `<p>${escapeHtml(p.description)}</p>` : ''}
    <ol>
      ${p.steps
        .map((s) => {
          const dur = s.expected_duration_seconds;
          const tol = s.timer_tolerance_seconds;
          return `
        <li>
          ${s.title ? `<strong>${escapeHtml(s.title)}</strong><br>` : ''}
          ${escapeHtml(s.instruction)}
          ${
            dur
              ? `<br><span class="meta">Timer: ${escapeHtml(
                  secondsToDisplay(dur),
                )}${
                  tol ? ` ± ${escapeHtml(secondsToDisplay(tol))}` : ''
                }</span>`
              : ''
          }
        </li>`;
        })
        .join('')}
    </ol>`,
    )
    .join('');

  const experimentsHtml = data.experiments
    .map((exp) => {
      const completed = exp.step_runs.filter((s) => s.step_state === 'completed');
      const stepsHtml = completed
        .map((step) => {
          const measurementsHtml = Object.entries(step.measurement_values ?? {})
            .filter(([, v]) => v != null && v !== '')
            .map(
              ([k, v]) =>
                `<span class="measurement">${escapeHtml(k)}: ${escapeHtml(
                  String(v),
                )}</span>`,
            )
            .join(' ');
          const deviationHtml = step.deviation_flagged
            ? `<div class="deviation"><strong>Deviation:</strong> ${escapeHtml(
                step.deviation_description ?? 'Deviation logged',
              )}</div>`
            : '';
          const notesHtml = step.notes
            ? `<p class="meta">Notes: ${escapeHtml(step.notes)}</p>`
            : '';
          const durationHtml = step.timer_elapsed_seconds
            ? `<span class="meta"> · ${escapeHtml(
                secondsToDisplay(step.timer_elapsed_seconds),
              )}</span>`
            : '';
          return `
        <div class="step">
          <strong>Step ${step.step_order}</strong>${durationHtml}
          ${measurementsHtml ? `<div>${measurementsHtml}</div>` : ''}
          ${deviationHtml}
          ${notesHtml}
        </div>`;
        })
        .join('');
      return `
    <div class="experiment">
      <h3>${escapeHtml(exp.protocol_name)}</h3>
      <p class="meta">
        Date: ${escapeHtml(formatDate(exp.run_started_at))} ·
        ${runStatusBadge(exp.run_state)} ·
        Operator: ${escapeHtml(exp.operator_name ?? '—')}
        ${
          exp.has_expired_reagent
            ? ' · <span class="status-warning">⚠ Expired reagent used</span>'
            : ''
        }
      </p>
      ${stepsHtml}
      ${exp.notes ? `<p class="meta"><em>${escapeHtml(exp.notes)}</em></p>` : ''}
    </div>`;
    })
    .join('');

  const reagentsHtml = data.reagents
    .map((r) => {
      const exp = expiryStatus(r.expiry_date);
      return `
    <tr>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.manufacturer ?? '—')}</td>
      <td>${escapeHtml(r.catalogue_number ?? '—')}</td>
      <td>${escapeHtml(r.current_lot_number ?? '—')}</td>
      <td>${escapeHtml(r.expiry_date ? formatDate(r.expiry_date) : '—')}</td>
      <td class="${exp.cssClass}">${escapeHtml(exp.label)}</td>
    </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Benchbook Experiment Record — ${escapeHtml(userName)}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11pt; color: #333;
           max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #6366f1; font-size: 24pt; border-bottom: 2px solid #6366f1;
         padding-bottom: 10px; }
    h2 { color: #4f46e5; font-size: 16pt; margin-top: 30px;
         border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
    h3 { color: #374151; font-size: 13pt; }
    .meta { color: #6b7280; font-size: 10pt; }
    .experiment { border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px;
                  margin: 15px 0; page-break-inside: avoid; }
    .step { margin: 10px 0; padding: 8px; background: #f9fafb;
            border-radius: 4px; }
    .measurement { display: inline-block; background: #eff6ff;
                   padding: 2px 8px; border-radius: 4px; margin: 2px;
                   font-size: 10pt; }
    .deviation { background: #fef2f2; border-left: 3px solid #ef4444;
                 padding: 5px 10px; margin: 5px 0; }
    .reagent-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    .reagent-table th { background: #6366f1; color: white; padding: 6px 10px;
                        text-align: left; }
    .reagent-table td { padding: 5px 10px; border-bottom: 1px solid #e5e7eb; }
    .reagent-table tr:nth-child(even) td { background: #f9fafb; }
    .status-valid { color: #059669; }
    .status-warning { color: #d97706; }
    .status-expired { color: #dc2626; }
    .brand-header { display: flex; align-items: center; gap: 12px;
                    border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 4px; }
    .brand-header svg { width: 36px; height: 36px; flex: none; }
    .brand-name { font-size: 22pt; font-weight: 700; color: #6366f1; letter-spacing: -0.5px; }
    .brand-sub { margin-left: auto; font-size: 10pt; color: #6b7280;
                 text-transform: uppercase; letter-spacing: 1.5px; }
    .status-badge { display: inline-block; padding: 1px 9px; border-radius: 10px;
                    font-size: 9pt; font-weight: 700; }
    .badge-completed { background: #dcfce7; color: #15803d; }
    .badge-abandoned { background: #fef3c7; color: #b45309; }
    .badge-in_progress { background: #eef0fe; color: #4f46e5; }
    .signoff { display: flex; gap: 28px; margin-top: 32px; page-break-inside: avoid; }
    .signoff-cell { flex: 1; }
    .signoff-name { font-size: 10pt; color: #111827; font-weight: 600; height: 16px; }
    .signoff-line { border-bottom: 1px solid #9ca3af; height: 38px; }
    .signoff-label { font-size: 9pt; color: #6b7280; margin-top: 5px;
                     text-transform: uppercase; letter-spacing: 0.5px; }
    .page-footer { text-align: center; border-top: 1px solid #e5e7eb; padding-top: 10px;
                   color: #6b7280; font-size: 9pt; margin-top: 28px; }
    .running-header { display: none; }
    @media print {
      .no-print { display: none; }
      .running-header { display: flex; align-items: center; gap: 6px;
                        position: fixed; top: 0; left: 0; right: 0;
                        font-size: 8pt; color: #9ca3af; padding: 3px 0; }
      .running-header svg { width: 12px; height: 12px; flex: none; }
      h2 { page-break-before: always; }
      h2:first-of-type { page-break-before: avoid; }
    }
  </style>
</head>
<body>
  <div class="running-header">
    <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"/><path d="M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 14h9"/></svg>
    Benchbook · Experiment Record — ${escapeHtml(userName)}
  </div>
  <div class="brand-header">
    <svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"/><path d="M10 3v6L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 14h9"/></svg>
    <span class="brand-name">Benchbook</span>
    <span class="brand-sub">Experiment Record</span>
  </div>
  <p class="meta">
    Exported by: ${escapeHtml(userName)}<br>
    Institution: ${escapeHtml(data.user?.institution ?? '—')}<br>
    Export date: ${escapeHtml(formatDate(data.exported_at))}
  </p>
  <p class="meta">
    <strong>Summary:</strong>
    ${data.summary.total_protocols} protocol${data.summary.total_protocols === 1 ? '' : 's'} ·
    ${data.summary.total_experiments} experiment${data.summary.total_experiments === 1 ? '' : 's'} ·
    ${data.summary.total_reagents} reagent${data.summary.total_reagents === 1 ? '' : 's'}
  </p>

  <h2>Protocols</h2>
  ${protocolsHtml || '<p class="meta">No protocols yet.</p>'}

  <h2>Experiments</h2>
  ${experimentsHtml || '<p class="meta">No experiments yet.</p>'}

  <h2>Reagents &amp; Materials</h2>
  ${
    data.reagents.length > 0
      ? `<table class="reagent-table">
    <tr>
      <th>Name</th><th>Manufacturer</th><th>Cat. No.</th>
      <th>Lot Number</th><th>Expiry</th><th>Status</th>
    </tr>
    ${reagentsHtml}
  </table>`
      : '<p class="meta">No reagents tracked.</p>'
  }

  <div class="signoff">
    <div class="signoff-cell">
      <div class="signoff-name">${escapeHtml(userName)}</div>
      <div class="signoff-line"></div>
      <div class="signoff-label">Recorded by</div>
    </div>
    <div class="signoff-cell">
      <div class="signoff-name">&nbsp;</div>
      <div class="signoff-line"></div>
      <div class="signoff-label">Reviewed by</div>
    </div>
    <div class="signoff-cell">
      <div class="signoff-name">&nbsp;</div>
      <div class="signoff-line"></div>
      <div class="signoff-label">Date</div>
    </div>
  </div>

  <p class="page-footer">
    Generated by Benchbook · benchbook.app · ${escapeHtml(formatDate(data.exported_at))}
  </p>
</body>
</html>`;
}
