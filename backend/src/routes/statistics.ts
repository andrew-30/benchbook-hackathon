import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { getMeasurementStatus } from '../lib/measurements.js';
import { sendError } from '../lib/errorResponse.js';

export const statisticsRouter = Router();

interface MeasurementParam {
  name: string;
  unit?: string | null;
  min_value?: number | null;
  max_value?: number | null;
  // Soft tolerance band — see frontend/src/lib/types.ts for semantics.
  target_value?: number | null;
  tolerance?: number | null;
  required?: boolean;
}

interface StepSnapshot {
  step_order: number;
  title?: string | null;
  instruction: string;
  measurement_parameters?: MeasurementParam[];
}

interface RunRow {
  id: string;
  protocol_id: string;
  protocol_name: string;
  run_state: 'in_progress' | 'completed' | 'abandoned';
  run_started_at: string;
  steps_snapshot: StepSnapshot[] | null;
}

interface StepRunRow {
  run_id: string;
  step_order: number;
  step_state: string;
  measurement_values: Record<string, unknown> | null;
  deviation_flagged: boolean;
  notes: string | null;
}

interface TimeSeriesPoint {
  run_number: number;
  value: number;
  run_date: string;
  run_id: string;
}

interface ParamSummary {
  unit: string;
  min_spec: number | null;
  max_spec: number | null;
  target_value: number | null;
  tolerance: number | null;
  tolerance_min: number | null;
  tolerance_max: number | null;
  mean: number;
  sd: number;
  min: number;
  max: number;
  count: number;
  in_spec_count: number;
  within_tolerance_count: number;
  within_tolerance_pct: number;
  time_series: TimeSeriesPoint[];
}

statisticsRouter.get('/:id/statistics', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const userId = req.userId!;
  const protocolId = String(req.params.id);

  const [protoResp, runsResp] = await Promise.all([
    sb
      .from('protocols')
      .select('id, name')
      .eq('id', protocolId)
      .eq('user_id', userId)
      .maybeSingle(),
    sb
      .from('runs')
      .select('id, protocol_id, protocol_name, run_state, run_started_at, steps_snapshot')
      .eq('protocol_id', protocolId)
      .eq('user_id', userId)
      .order('run_started_at', { ascending: true }),
  ]);

  if (protoResp.error) return sendError(res, 500, protoResp.error);
  if (!protoResp.data) return res.status(404).json({ error: 'Protocol not found' });
  if (runsResp.error) return sendError(res, 500, runsResp.error);

  const runs = (runsResp.data ?? []) as RunRow[];
  const completed = runs.filter((r) => r.run_state === 'completed');
  const completedIds = completed.map((r) => r.id);

  // Stable run numbering: 1-based, ordered by run_started_at (already sorted).
  const runNumberById = new Map<string, number>();
  completed.forEach((r, i) => runNumberById.set(r.id, i + 1));

  // Build parameter spec map from the most recent snapshot that has each
  // parameter. If specs change between protocol versions, the latest wins.
  const specs = new Map<string, MeasurementParam>();
  for (const run of completed) {
    for (const step of run.steps_snapshot ?? []) {
      for (const p of step.measurement_parameters ?? []) {
        specs.set(p.name, { ...specs.get(p.name), ...p });
      }
    }
  }

  let stepRunRows: StepRunRow[] = [];
  if (completedIds.length > 0) {
    const { data, error } = await sb
      .from('step_runs')
      .select('run_id, step_order, step_state, measurement_values, deviation_flagged, notes')
      .in('run_id', completedIds)
      .eq('user_id', userId);
    if (error) return sendError(res, 500, error);
    stepRunRows = (data ?? []) as StepRunRow[];
  }

  const totalDeviations = stepRunRows.filter((sr) => sr.deviation_flagged).length;

  // Collect values per parameter across all completed runs.
  const buckets = new Map<string, TimeSeriesPoint[]>();
  let totalMeasurements = 0;
  const runDateById = new Map(completed.map((r) => [r.id, r.run_started_at] as const));

  for (const sr of stepRunRows) {
    if (sr.step_state !== 'completed') continue;
    const mv = sr.measurement_values ?? {};
    for (const [name, raw] of Object.entries(mv)) {
      if (raw == null || raw === '') continue;
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isNaN(num)) continue;
      totalMeasurements++;
      const runNum = runNumberById.get(sr.run_id);
      const runDate = runDateById.get(sr.run_id);
      if (runNum == null || !runDate) continue;
      if (!buckets.has(name)) buckets.set(name, []);
      buckets.get(name)!.push({
        run_number: runNum,
        value: num,
        run_date: runDate,
        run_id: sr.run_id,
      });
    }
  }

  // Sort each parameter's points by run_number ascending so charts render left-to-right.
  for (const points of buckets.values()) {
    points.sort((a, b) => a.run_number - b.run_number);
  }

  // Helper: collapse all the spec/tolerance fields into one summary record.
  // Used by both the with-spec and the spec-less defensive branch below.
  function summarise(
    name: string,
    spec: MeasurementParam | undefined,
    points: TimeSeriesPoint[],
  ): ParamSummary {
    const n = points.length;
    const target_value = spec?.target_value ?? null;
    const tolerance = spec?.tolerance ?? null;
    const tolerance_min =
      target_value != null && tolerance != null ? target_value - tolerance : null;
    const tolerance_max =
      target_value != null && tolerance != null ? target_value + tolerance : null;
    if (n === 0) {
      return {
        unit: spec?.unit ?? '',
        min_spec: spec?.min_value ?? null,
        max_spec: spec?.max_value ?? null,
        target_value,
        tolerance,
        tolerance_min,
        tolerance_max,
        mean: 0,
        sd: 0,
        min: 0,
        max: 0,
        count: 0,
        in_spec_count: 0,
        within_tolerance_count: 0,
        within_tolerance_pct: 0,
        time_series: [],
      };
    }
    const values = points.map((p) => p.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
    const sd = Math.sqrt(variance);
    const inSpec = (v: number): boolean => {
      if (spec?.min_value != null && v < spec.min_value) return false;
      if (spec?.max_value != null && v > spec.max_value) return false;
      return true;
    };
    const inToleranceBand = (v: number): boolean => {
      if (tolerance_min == null || tolerance_max == null) return false;
      return v >= tolerance_min && v <= tolerance_max;
    };
    const within_tolerance_count =
      tolerance_min != null ? values.filter(inToleranceBand).length : 0;
    return {
      unit: spec?.unit ?? '',
      min_spec: spec?.min_value ?? null,
      max_spec: spec?.max_value ?? null,
      target_value,
      tolerance,
      tolerance_min,
      tolerance_max,
      mean,
      sd,
      min: Math.min(...values),
      max: Math.max(...values),
      count: n,
      in_spec_count: values.filter(inSpec).length,
      within_tolerance_count,
      within_tolerance_pct:
        tolerance_min != null && n > 0
          ? Math.round((within_tolerance_count / n) * 100)
          : 0,
      time_series: points,
    };
  }

  const parameters: Record<string, ParamSummary> = {};
  for (const [name, spec] of specs) {
    const points = buckets.get(name) ?? [];
    parameters[name] = summarise(name, spec, points);
  }

  // Also surface any parameters that have data but weren't in the snapshot specs
  // (defensive — covers schema drift).
  for (const [name, points] of buckets) {
    if (parameters[name]) continue;
    parameters[name] = summarise(name, undefined, points);
  }

  // -- Enrichment layer ------------------------------------------------------
  // Score, labels, tips and recommendations are derived from the raw stats so
  // the frontend can stay dumb: it just renders what the API hands it.

  let totalInSpec = 0;
  let totalSpecMeasurements = 0;
  let totalWithinTolerance = 0;
  let totalToleranceMeasurements = 0;
  let cvSum = 0;
  let cvSamples = 0;

  for (const param of Object.values(parameters)) {
    const hasSpec = param.min_spec != null || param.max_spec != null;
    const hasTolerance = param.tolerance_min != null && param.tolerance_max != null;
    if (hasSpec && param.count > 0) {
      totalSpecMeasurements += param.count;
      totalInSpec += param.in_spec_count;
    }
    if (hasTolerance && param.count > 0) {
      totalToleranceMeasurements += param.count;
      totalWithinTolerance += param.within_tolerance_count;
    }
    if (param.count >= 2 && Math.abs(param.mean) > 1e-9) {
      cvSum += Math.abs(param.sd / param.mean);
      cvSamples += 1;
    }
  }

  let reproducibility_score = 0;
  if (totalMeasurements === 0) {
    reproducibility_score = 0;
  } else if (totalSpecMeasurements > 0) {
    reproducibility_score = Math.round((totalInSpec / totalSpecMeasurements) * 100);
  } else if (cvSamples > 0) {
    // CV-based: lower CV → higher score. 5% CV → 90, 10% → 80, 20% → 60, 30% → 40.
    const avgCv = cvSum / cvSamples;
    reproducibility_score = Math.max(0, Math.min(100, Math.round(100 - avgCv * 200)));
  } else {
    // Only one measurement total — assume perfect (nothing to compare).
    reproducibility_score = 100;
  }

  const scoreLabel: 'Poor' | 'Fair' | 'Good' | 'Excellent' =
    reproducibility_score <= 40
      ? 'Poor'
      : reproducibility_score <= 70
        ? 'Fair'
        : reproducibility_score <= 90
          ? 'Good'
          : 'Excellent';
  const scoreColor: 'red' | 'amber' | 'green' | 'indigo' =
    scoreLabel === 'Poor'
      ? 'red'
      : scoreLabel === 'Fair'
        ? 'amber'
        : scoreLabel === 'Good'
          ? 'green'
          : 'indigo';

  // Trend — split completed runs in half by chronology and compare in-spec
  // rates. < 3 runs is "insufficient_data" per spec.
  type Trend = 'improving' | 'stable' | 'declining' | 'insufficient_data';
  let trend: Trend = 'insufficient_data';
  if (completed.length >= 3 && totalSpecMeasurements > 0) {
    // Walk every measurement again, tagging each as in-spec or not, plus the
    // run number it came from. Then split by run number.
    const perRun: Array<{ in: number; total: number }> = completed.map(() => ({
      in: 0,
      total: 0,
    }));
    for (const sr of stepRunRows) {
      if (sr.step_state !== 'completed') continue;
      const runNum = runNumberById.get(sr.run_id);
      if (runNum == null) continue;
      const idx = runNum - 1;
      const mv = sr.measurement_values ?? {};
      for (const [name, raw] of Object.entries(mv)) {
        if (raw == null || raw === '') continue;
        const num = typeof raw === 'number' ? raw : Number(raw);
        if (Number.isNaN(num)) continue;
        const spec = specs.get(name);
        if (!spec || (spec.min_value == null && spec.max_value == null)) continue;
        const inSpec =
          (spec.min_value == null || num >= spec.min_value) &&
          (spec.max_value == null || num <= spec.max_value);
        perRun[idx]!.total += 1;
        if (inSpec) perRun[idx]!.in += 1;
      }
    }
    const mid = Math.floor(perRun.length / 2);
    const first = perRun.slice(0, mid);
    const second = perRun.slice(mid + (perRun.length % 2 === 0 ? 0 : 1));
    const rate = (slice: typeof first) => {
      const t = slice.reduce((a, b) => a + b.total, 0);
      const i = slice.reduce((a, b) => a + b.in, 0);
      return t === 0 ? null : i / t;
    };
    const r1 = rate(first);
    const r2 = rate(second);
    if (r1 != null && r2 != null) {
      const diff = r2 - r1;
      if (diff > 0.1) trend = 'improving';
      else if (diff < -0.1) trend = 'declining';
      else trend = 'stable';
    }
  }

  // Per-parameter status + tip + experiment_values.
  type ParamStatus = 'consistent' | 'variable' | 'needs_attention' | 'no_spec';
  function statusFor(p: typeof parameters[string]): ParamStatus {
    const hasSpec = p.min_spec != null || p.max_spec != null;
    if (!hasSpec) return 'no_spec';
    if (p.count === 0) return 'no_spec';
    const ratio = p.in_spec_count / p.count;
    if (ratio >= 0.9) return 'consistent';
    if (ratio >= 0.5) return 'variable';
    return 'needs_attention';
  }
  function statusLabel(s: ParamStatus): string {
    switch (s) {
      case 'consistent':
        return 'Consistent ✓';
      case 'variable':
        return 'Variable ⚠';
      case 'needs_attention':
        return 'Needs attention ✗';
      case 'no_spec':
        return 'No spec defined';
    }
  }
  function tipFor(name: string, status: ParamStatus): string | null {
    if (status === 'consistent' || status === 'no_spec') return null;
    const n = name.toLowerCase();
    const high = status === 'needs_attention';
    if (/temperature|temp/.test(n)) {
      return high
        ? 'Check your incubator calibration and ensure the door is sealed between experiments'
        : 'Monitor your incubator temperature at the start of each experiment';
    }
    if (/volume|vol\b/.test(n)) {
      return high
        ? 'Check pipette calibration. Try a different pipette or tip size for this volume range'
        : 'Use the same pipette for this step each time to reduce variation';
    }
    if (/time|duration/.test(n)) {
      return high
        ? 'Use strict timer mode in Benchbook to enforce consistent timing'
        : 'Enable advisory timer for this step to track timing more closely';
    }
    if (/speed|rpm|centrifug/.test(n)) {
      return high
        ? 'Verify centrifuge settings before each run and record in your pre-run checklist'
        : 'Note centrifuge speed in your pre-run checklist';
    }
    if (/\bph\b/.test(n)) {
      return high
        ? 'Calibrate pH meter before each use and check buffer preparation'
        : 'Ensure pH meter is calibrated at the start of each session';
    }
    if (/concentration|conc|absorbance|\bod\b/.test(n)) {
      return high
        ? 'Check reagent preparation method and ensure consistent dilution technique'
        : 'Prepare reagents fresh for each experiment to reduce variation';
    }
    return high
      ? 'This parameter shows significant variation. Review your technique for this step.'
      : 'Some variation detected. Monitor this parameter closely.';
  }

  const enrichedParameters: Record<string, unknown> = {};
  for (const [name, param] of Object.entries(parameters)) {
    const s = statusFor(param);
    const experimentValues = param.time_series.map((p) => {
      const inSpec =
        (param.min_spec == null || p.value >= param.min_spec) &&
        (param.max_spec == null || p.value <= param.max_spec);
      const tolerance_status = getMeasurementStatus(p.value, {
        min_value: param.min_spec,
        max_value: param.max_spec,
        target_value: param.target_value,
        tolerance: param.tolerance,
      });
      return {
        experiment_number: p.run_number,
        value: p.value,
        in_spec: param.min_spec == null && param.max_spec == null ? true : inSpec,
        tolerance_status,
        run_date: p.run_date,
      };
    });
    enrichedParameters[name] = {
      ...param,
      status: s,
      status_label: statusLabel(s),
      tip: tipFor(name, s),
      experiment_values: experimentValues,
    };
  }

  // Recommendations — high → medium → low.
  interface Recommendation {
    priority: 'high' | 'medium' | 'low';
    parameter: string;
    message: string;
  }
  const recs: Recommendation[] = [];
  for (const [name, param] of Object.entries(parameters)) {
    const s = statusFor(param);
    const tip = tipFor(name, s);
    if (s === 'needs_attention' && tip) {
      recs.push({ priority: 'high', parameter: name, message: tip });
    } else if (s === 'variable' && tip) {
      recs.push({ priority: 'medium', parameter: name, message: tip });
    } else if (s === 'no_spec' && param.count > 0) {
      recs.push({
        priority: 'low',
        parameter: name,
        message: 'No target defined. Consider adding spec limits to this parameter.',
      });
    }
  }
  const priorityOrder = { high: 0, medium: 1, low: 2 } as const;
  recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return res.json({
    protocol_name: protoResp.data.name,
    total_runs: runs.length,
    completed_runs: completed.length,
    total_measurements: totalMeasurements,
    total_deviations: totalDeviations,
    // Both denominators are surfaced separately so the frontend can render
    // "within tolerance: X/Y (Z%)" and "within spec: A/B (C%)" side by side.
    total_within_tolerance: totalWithinTolerance,
    total_with_tolerance: totalToleranceMeasurements,
    total_in_spec: totalInSpec,
    total_with_spec: totalSpecMeasurements,
    parameters: enrichedParameters,
    reproducibility_score,
    score_label: scoreLabel,
    score_color: scoreColor,
    trend,
    recommendations: recs,
  });
});

statisticsRouter.get('/:id/export/csv', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const userId = req.userId!;
  const protocolId = String(req.params.id);

  const protoResp = await sb
    .from('protocols')
    .select('id, name')
    .eq('id', protocolId)
    .eq('user_id', userId)
    .maybeSingle();
  if (protoResp.error) return sendError(res, 500, protoResp.error);
  if (!protoResp.data) return res.status(404).json({ error: 'Protocol not found' });

  const { data: runs, error: runsErr } = await sb
    .from('runs')
    .select('id, run_started_at, run_state, steps_snapshot')
    .eq('protocol_id', protocolId)
    .eq('user_id', userId)
    .order('run_started_at', { ascending: true });
  if (runsErr) return sendError(res, 500, runsErr);

  const completed = (runs ?? []).filter(
    (r) => r.run_state === 'completed',
  ) as Array<{ id: string; run_started_at: string; steps_snapshot: StepSnapshot[] | null }>;

  if (completed.length === 0) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${slugify(protoResp.data.name)}-data.csv"`,
    );
    return res.send(
      'run_number,run_date,step_order,step_title,measurement_name,value,unit,in_spec,deviation_flagged,notes\n',
    );
  }

  const completedIds = completed.map((r) => r.id);
  const { data: stepRuns, error: srErr } = await sb
    .from('step_runs')
    .select('*')
    .in('run_id', completedIds)
    .eq('user_id', userId);
  if (srErr) return sendError(res, 500, srErr);

  const runNumberById = new Map<string, number>();
  const runDateById = new Map<string, string>();
  const snapshotById = new Map<string, StepSnapshot[]>();
  completed.forEach((r, i) => {
    runNumberById.set(r.id, i + 1);
    runDateById.set(r.id, r.run_started_at);
    snapshotById.set(r.id, r.steps_snapshot ?? []);
  });

  const rows: string[] = [
    'run_number,run_date,step_order,step_title,measurement_name,value,unit,in_spec,deviation_flagged,notes',
  ];

  // Order rows by (run_number asc, step_order asc) so one experiment's rows stay together.
  const ordered = [...(stepRuns ?? [])].sort((a, b) => {
    const ra = runNumberById.get(a.run_id) ?? 0;
    const rb = runNumberById.get(b.run_id) ?? 0;
    return ra !== rb ? ra - rb : a.step_order - b.step_order;
  });

  for (const sr of ordered) {
    const snapshot = snapshotById.get(sr.run_id) ?? [];
    const step = snapshot.find((s) => s.step_order === sr.step_order);
    const params = step?.measurement_parameters ?? [];
    const mv = (sr.measurement_values ?? {}) as Record<string, unknown>;
    const runNumber = runNumberById.get(sr.run_id) ?? '';
    const runDate = (runDateById.get(sr.run_id) ?? '').slice(0, 10);
    const stepTitle = step?.title ?? '';
    const baseCols = {
      run_number: String(runNumber),
      run_date: runDate,
      step_order: String(sr.step_order),
      step_title: stepTitle,
      deviation_flagged: sr.deviation_flagged ? 'true' : 'false',
      notes: sr.notes ?? '',
    };

    const measurementEntries = Object.entries(mv).filter(
      ([, v]) => v != null && v !== '',
    );

    if (measurementEntries.length === 0) {
      // Emit a row even when no measurement was recorded — keeps a per-step record.
      rows.push(
        toCsvRow([
          baseCols.run_number,
          baseCols.run_date,
          baseCols.step_order,
          baseCols.step_title,
          '',
          '',
          '',
          '',
          baseCols.deviation_flagged,
          baseCols.notes,
        ]),
      );
      continue;
    }

    for (const [name, raw] of measurementEntries) {
      const p = params.find((pp) => pp.name === name);
      const num = typeof raw === 'number' ? raw : Number(raw);
      const inSpec =
        Number.isFinite(num) &&
        (p?.min_value == null || num >= p.min_value) &&
        (p?.max_value == null || num <= p.max_value);
      rows.push(
        toCsvRow([
          baseCols.run_number,
          baseCols.run_date,
          baseCols.step_order,
          baseCols.step_title,
          name,
          String(raw),
          p?.unit ?? '',
          inSpec ? 'true' : 'false',
          baseCols.deviation_flagged,
          baseCols.notes,
        ]),
      );
    }
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${slugify(protoResp.data.name)}-data.csv"`,
  );
  return res.send(rows.join('\n') + '\n');
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'protocol';
}

function toCsvRow(cells: string[]): string {
  return cells.map(csvEscape).join(',');
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
