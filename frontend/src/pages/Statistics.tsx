import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useProtocolsForFilter } from '../hooks/useRunHistory';
import { downloadProtocolCsv, useStatistics } from '../hooks/useStatistics';
import { usePageTitle } from '../hooks/usePageTitle';
import { ChartIllustration } from '../components/Illustrations';
import { PageTransition } from '../components/PageTransition';
import { Icon, type IconName } from '../components/Icon';
import type {
  EnrichedStatsParameter,
  ParamStatus,
  Recommendation,
  ScoreColor,
  StatisticsData,
  StatsExperimentValue,
  Trend,
} from '../lib/types';

// ---------------------------------------------------------------------------
// Data-viz palette
//
// Recharts props are plain SVG attributes, not classNames — they need literal
// colour values. These mirror the tokens in tailwind.config.js exactly; keep
// them in sync if the palette ever changes.
// ---------------------------------------------------------------------------

const VIZ = {
  primary: '#6366f1', // indigo accent — the trend line itself, never status
  muted: '#6f6b81',
  line: '#ece7f2',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
} as const;

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  return Number(n.toFixed(digits)).toString();
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function targetText(p: EnrichedStatsParameter): string {
  // When tolerance is set we lead with "target ± tolerance" — it's the
  // intended scientific notation. The acceptable range + hard spec render on
  // their own lines below the card title.
  if (p.target_value != null && p.tolerance != null) {
    return `${p.target_value} ± ${p.tolerance}${p.unit ? ` ${p.unit}` : ''}`;
  }
  if (p.min_spec != null && p.max_spec != null) {
    if (p.min_spec === p.max_spec) return `${p.min_spec}${p.unit ? ` ${p.unit}` : ''}`;
    return `${p.min_spec} – ${p.max_spec}${p.unit ? ` ${p.unit}` : ''}`;
  }
  if (p.min_spec != null) return `≥ ${p.min_spec}${p.unit ? ` ${p.unit}` : ''}`;
  if (p.max_spec != null) return `≤ ${p.max_spec}${p.unit ? ` ${p.unit}` : ''}`;
  return 'No target defined';
}

function acceptableRangeText(p: EnrichedStatsParameter): string | null {
  if (p.tolerance_min == null || p.tolerance_max == null) return null;
  return `${p.tolerance_min} – ${p.tolerance_max}${p.unit ? ` ${p.unit}` : ''}`;
}

function specRangeText(p: EnrichedStatsParameter): string | null {
  if (p.min_spec == null && p.max_spec == null) return null;
  const u = p.unit ? ` ${p.unit}` : '';
  if (p.min_spec != null && p.max_spec != null) return `${p.min_spec} – ${p.max_spec}${u}`;
  if (p.min_spec != null) return `≥ ${p.min_spec}${u}`;
  return `≤ ${p.max_spec}${u}`;
}

function rangeText(p: EnrichedStatsParameter): string {
  if (p.count === 0) return '—';
  return `${fmt(p.min)} – ${fmt(p.max)}${p.unit ? ` ${p.unit}` : ''}`;
}

function scoreDescription(label: StatisticsData['score_label']): string {
  switch (label) {
    case 'Poor':
      return 'Your results vary significantly between experiments. Focus on the steps marked below.';
    case 'Fair':
      return 'Some consistency in your results but several parameters need attention.';
    case 'Good':
      return 'Your technique is mostly consistent. A few parameters could be improved.';
    case 'Excellent':
      return 'Excellent reproducibility! Your technique is highly consistent.';
  }
}

const SCORE_PALETTE: Record<ScoreColor, { bg: string; text: string; ring: string }> = {
  red: { bg: 'border-danger/15 bg-danger/5', text: 'text-danger', ring: VIZ.danger },
  amber: { bg: 'border-warning/15 bg-warning/5', text: 'text-warning', ring: VIZ.warning },
  green: { bg: 'border-success/15 bg-success/5', text: 'text-success', ring: VIZ.success },
  indigo: { bg: 'border-primary/15 bg-primary/5', text: 'text-primary', ring: VIZ.primary },
};

const STATUS_BADGE: Record<ParamStatus, { className: string }> = {
  consistent: { className: 'bg-success/10 text-success' },
  variable: { className: 'bg-warning/10 text-warning' },
  needs_attention: { className: 'bg-danger/10 text-danger' },
  no_spec: { className: 'bg-neutral-100 text-muted' },
};

// Trend copy no longer bakes an arrow glyph into the string — a rotated
// arrow-right icon carries the direction instead.
const TREND_META: Record<Trend, { text: string; className: string; rotate: number } | null> = {
  improving: { text: 'Consistency improving over time', className: 'text-success', rotate: -45 },
  stable: { text: 'Consistency stable over time', className: 'text-muted', rotate: 0 },
  declining: { text: 'Consistency declining over time', className: 'text-warning', rotate: 45 },
  insufficient_data: null,
};

const PRIORITY_PILL: Record<
  Recommendation['priority'],
  { dot: string; border: string; bg: string }
> = {
  high: { dot: 'bg-danger', border: 'border-danger/40', bg: 'bg-danger/5' },
  medium: { dot: 'bg-warning', border: 'border-warning/40', bg: 'bg-warning/5' },
  low: { dot: 'bg-muted', border: 'border-line', bg: 'bg-neutral-50' },
};

// Per-measurement chart status — a distinct, simpler 4-state palette from the
// ExperimentValueRow fallback below (that one also considers legacy in_spec).
const CHART_STATUS_META: Record<
  StatsExperimentValue['tolerance_status'],
  { color: string; label: string; icon: IconName }
> = {
  within_tolerance: { color: VIZ.success, label: 'Within tolerance', icon: 'check' },
  outside_tolerance: { color: VIZ.warning, label: 'Outside tolerance', icon: 'alert' },
  outside_spec: { color: VIZ.danger, label: 'Out of spec', icon: 'x' },
  no_spec: { color: VIZ.muted, label: 'No target set', icon: 'check' },
};

// ---------------------------------------------------------------------------
// Small reusable bits
// ---------------------------------------------------------------------------

function KpiChip({ icon, warn }: { icon: IconName; warn?: boolean }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
        warn ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'
      }`}
    >
      <Icon name={icon} size={17} />
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string | number;
  tone?: 'warning';
}) {
  return (
    <div className="bb-card p-4">
      <KpiChip icon={icon} warn={tone === 'warning'} />
      <div className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div
        className={`mt-1 font-display text-2xl tabular-nums md:text-3xl ${
          tone === 'warning' ? 'text-warning' : 'text-ink'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ScoreRing({ score, color }: { score: number; color: ScoreColor }) {
  const palette = SCORE_PALETTE[color];
  const radius = 66;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * circumference;
  return (
    <svg viewBox="0 0 160 160" className="h-36 w-36 shrink-0 md:h-40 md:w-40" aria-hidden>
      <circle cx="80" cy="80" r={radius} fill="none" stroke={VIZ.line} strokeWidth="14" />
      <circle
        cx="80"
        cy="80"
        r={radius}
        fill="none"
        stroke={palette.ring}
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference - dash}`}
        transform="rotate(-90 80 80)"
        style={{ transition: 'stroke-dasharray 200ms ease-out' }}
      />
      <text
        x="80"
        y="90"
        textAnchor="middle"
        fontSize="34"
        fill="currentColor"
        className={`font-display ${palette.text}`}
      >
        {Math.round(score)}%
      </text>
    </svg>
  );
}

function BreakdownRow({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink">{label}</span>
        <span className="font-medium tabular-nums text-ink">
          {count}/{total} <span className="text-muted">({pct}%)</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color, transition: 'width 200ms ease-out' }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero score card (Section 1) — the bold centerpiece
// ---------------------------------------------------------------------------

function HeroScoreCard({ data }: { data: StatisticsData }) {
  const palette = SCORE_PALETTE[data.score_color];
  const trend = TREND_META[data.trend];
  return (
    <section className={`bb-card relative overflow-hidden border p-6 md:p-8 ${palette.bg}`}>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-14 h-48 w-48 rounded-full blur-3xl"
        style={{ backgroundColor: palette.ring, opacity: 0.12 }}
      />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
        <ScoreRing score={data.reproducibility_score} color={data.score_color} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">
            Reproducibility score
          </div>
          <div className={`mt-1 font-display text-3xl ${palette.text}`}>{data.score_label}</div>
          <p className="mt-2 max-w-prose text-sm text-ink/80">
            {scoreDescription(data.score_label)}
          </p>
          <p className="mt-2 text-xs text-muted">
            Based on {data.total_measurements} measurement
            {data.total_measurements === 1 ? '' : 's'} across {data.completed_runs} experiment
            {data.completed_runs === 1 ? '' : 's'}.
          </p>

          {data.total_with_tolerance > 0 && (
            <div className="mt-4 space-y-3 border-t border-line/70 pt-4">
              <BreakdownRow
                label="Within tolerance"
                count={data.total_within_tolerance}
                total={data.total_with_tolerance}
                color={VIZ.success}
              />
              {data.total_with_spec > 0 && (
                <BreakdownRow
                  label="Within specification"
                  count={data.total_in_spec}
                  total={data.total_with_spec}
                  color={VIZ.primary}
                />
              )}
            </div>
          )}

          {trend && (
            <div className={`mt-3 inline-flex items-center gap-1.5 text-sm font-medium ${trend.className}`}>
              <Icon name="arrow-right" size={15} style={{ transform: `rotate(${trend.rotate}deg)` }} />
              {trend.text}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Parameter cards (simple + collapsible chart)
// ---------------------------------------------------------------------------

function ChartTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: Array<{ payload: StatsExperimentValue }>;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!.payload;
  const meta = CHART_STATUS_META[p.tolerance_status] ?? CHART_STATUS_META.no_spec;
  return (
    <div className="rounded-card border border-line bg-white px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-ink">
        Experiment {p.experiment_number}
        <span className="text-muted"> · {fmtDate(p.run_date)}</span>
      </div>
      <div className="mt-1 font-display text-base tabular-nums text-ink">
        {p.value}
        {unit}
      </div>
      <div className="mt-1 flex items-center gap-1.5" style={{ color: meta.color }}>
        {p.tolerance_status === 'no_spec' ? (
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
        ) : (
          <Icon name={meta.icon} size={12} />
        )}
        <span className="text-[11px] font-medium">{meta.label}</span>
      </div>
    </div>
  );
}

interface DotRenderProps {
  cx?: number;
  cy?: number;
  index?: number;
  payload: StatsExperimentValue;
}

function ParameterChart({ param }: { param: EnrichedStatsParameter }) {
  const points = param.experiment_values;
  const dataValues = points.map((p) => p.value);
  const minSpec = param.min_spec ?? Math.min(...dataValues);
  const maxSpec = param.max_spec ?? Math.max(...dataValues);
  const bounds = [minSpec, maxSpec, ...dataValues];
  if (param.tolerance_min != null) bounds.push(param.tolerance_min);
  if (param.tolerance_max != null) bounds.push(param.tolerance_max);
  if (param.target_value != null) bounds.push(param.target_value);
  const lo = Math.min(...bounds);
  const hi = Math.max(...bounds);
  const pad = Math.max((hi - lo) * 0.1, 0.5);
  const domain: [number, number] = [
    Math.floor((lo - pad) * 100) / 100,
    Math.ceil((hi + pad) * 100) / 100,
  ];
  const hasToleranceBand = param.tolerance_min != null && param.tolerance_max != null;
  const lastIndex = points.length - 1;

  function renderDot(dotProps: unknown) {
    const { cx, cy, index, payload } = dotProps as DotRenderProps;
    if (cx == null || cy == null) return <g key={`dot-${index}`} />;
    const meta = CHART_STATUS_META[payload.tolerance_status] ?? CHART_STATUS_META.no_spec;
    const isLatest = index === lastIndex;
    return (
      <circle
        key={`dot-${index}`}
        cx={cx}
        cy={cy}
        r={isLatest ? 6 : 4}
        fill={meta.color}
        stroke="#ffffff"
        strokeWidth={2}
      />
    );
  }

  function renderActiveDot(dotProps: unknown) {
    const { cx, cy, index, payload } = dotProps as DotRenderProps;
    if (cx == null || cy == null) return <g key={`adot-${index}`} />;
    const meta = CHART_STATUS_META[payload.tolerance_status] ?? CHART_STATUS_META.no_spec;
    return (
      <circle
        key={`adot-${index}`}
        cx={cx}
        cy={cy}
        r={7}
        fill={meta.color}
        stroke="#ffffff"
        strokeWidth={2.5}
      />
    );
  }

  return (
    <div className="mt-3 h-56">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={VIZ.line} vertical={false} strokeDasharray="3 5" />
          <XAxis
            dataKey="experiment_number"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: VIZ.muted }}
            tickMargin={8}
          />
          <YAxis
            domain={domain}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: VIZ.muted }}
            width={44}
          />
          <Tooltip content={<ChartTooltip unit={param.unit} />} cursor={{ stroke: VIZ.line, strokeWidth: 1 }} />

          {/* Target ± tolerance band — recessive shaded area behind the line. */}
          {hasToleranceBand && (
            <ReferenceArea
              y1={param.tolerance_min!}
              y2={param.tolerance_max!}
              fill={VIZ.warning}
              fillOpacity={0.07}
              stroke={VIZ.warning}
              strokeOpacity={0.25}
              strokeDasharray="4 4"
            />
          )}
          {param.target_value != null && (
            <ReferenceLine
              y={param.target_value}
              stroke={VIZ.muted}
              strokeOpacity={0.6}
              strokeDasharray="3 3"
              label={{ value: 'target', position: 'insideTopRight', fontSize: 10, fill: VIZ.muted }}
            />
          )}
          {param.min_spec != null && (
            <ReferenceLine
              y={param.min_spec}
              stroke={VIZ.danger}
              strokeOpacity={0.45}
              strokeDasharray="5 4"
              label={{
                value: `min ${param.min_spec}`,
                position: 'insideBottomLeft',
                fontSize: 10,
                fill: VIZ.danger,
              }}
            />
          )}
          {param.max_spec != null && (
            <ReferenceLine
              y={param.max_spec}
              stroke={VIZ.danger}
              strokeOpacity={0.45}
              strokeDasharray="5 4"
              label={{
                value: `max ${param.max_spec}`,
                position: 'insideTopLeft',
                fontSize: 10,
                fill: VIZ.danger,
              }}
            />
          )}

          {/* Faint area fill under the trend line — accent colour, single series so no legend. */}
          <Area
            type="monotone"
            dataKey="value"
            stroke="none"
            fill={VIZ.primary}
            fillOpacity={0.06}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={VIZ.primary}
            strokeWidth={2}
            isAnimationActive={false}
            dot={renderDot}
            activeDot={renderActiveDot}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ExperimentValueRow({ point, unit }: { point: StatsExperimentValue; unit: string }) {
  // Three-state when tolerance is set; falls back to legacy in_spec/out-of-spec
  // when tolerance_status is missing (older payloads) or 'no_spec'.
  const status = point.tolerance_status;
  let cls = 'text-ink';
  let icon: IconName = 'check';
  let label = '';
  if (status === 'within_tolerance') {
    cls = 'text-success';
    icon = 'check';
    label = 'within tolerance';
  } else if (status === 'outside_tolerance') {
    cls = 'text-warning';
    icon = 'alert';
    label = 'outside tolerance';
  } else if (status === 'outside_spec') {
    cls = 'text-danger';
    icon = 'x';
    label = 'outside specification';
  } else if (point.in_spec) {
    cls = 'text-success';
    icon = 'check';
    label = 'on target';
  } else {
    cls = 'text-danger';
    icon = 'x';
    label = 'off target';
  }
  return (
    <li className="flex items-center justify-between gap-2 border-b border-line py-1.5 text-sm last:border-0">
      <span className="text-muted">
        Exp {point.experiment_number} <span className="text-muted/70">({fmtDate(point.run_date)})</span>
      </span>
      <span className={`inline-flex items-center gap-1.5 font-medium tabular-nums ${cls}`}>
        {point.value}
        {unit ? ` ${unit}` : ''}
        <span className="inline-flex items-center gap-1 text-xs font-normal">
          <Icon name={icon} size={13} />
          {label}
        </span>
      </span>
    </li>
  );
}

function SimpleParameterCard({
  name,
  param,
}: {
  name: string;
  param: EnrichedStatsParameter;
}) {
  const [showChart, setShowChart] = useState(false);
  const badge = STATUS_BADGE[param.status];
  const accept = acceptableRangeText(param);
  const spec = specRangeText(param);
  const hasTolerance = param.target_value != null && param.tolerance != null;
  return (
    <div className="bb-card p-4 md:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-ink">{name}</h3>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
          {param.status_label}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-muted">Target: {targetText(param)}</p>
      {accept && <p className="mt-0.5 text-sm text-muted">Acceptable: {accept}</p>}
      {spec && hasTolerance && <p className="mt-0.5 text-sm text-muted">Spec: {spec}</p>}
      {hasTolerance && param.count > 0 && (
        <p className="mt-2 text-xs text-muted">
          <span className="font-medium text-ink">Within tolerance:</span>{' '}
          {param.within_tolerance_count}/{param.count} ({param.within_tolerance_pct}%)
          {spec && (
            <>
              {' · '}
              <span className="font-medium text-ink">Within spec:</span>{' '}
              {param.in_spec_count}/{param.count} (
              {param.count > 0 ? Math.round((param.in_spec_count / param.count) * 100) : 0}
              %)
            </>
          )}
        </p>
      )}

      <div className="mt-3">
        <div className="mb-1 text-xs uppercase tracking-wide text-muted">Your experiments</div>
        {param.experiment_values.length === 0 ? (
          <p className="text-sm italic text-muted">No measurements recorded yet.</p>
        ) : (
          <ul>
            {param.experiment_values.map((p) => (
              <ExperimentValueRow key={`${p.experiment_number}-${p.value}`} point={p} unit={param.unit} />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 text-sm text-muted">
        <span className="font-medium text-ink">Range:</span> {rangeText(param)}
      </div>

      {param.tip && (
        <div className="mt-3 flex items-start gap-2 rounded-card border border-warning/20 bg-warning/5 px-3 py-2 text-sm text-ink">
          <Icon name="bulb" size={16} className="mt-0.5 shrink-0 text-warning" />
          <span>{param.tip}</span>
        </div>
      )}

      {param.experiment_values.length > 1 && (
        <button
          onClick={() => setShowChart((v) => !v)}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          aria-expanded={showChart}
        >
          {showChart ? 'Hide chart' : 'Show chart'}
          <Icon
            name="chevron-down"
            size={15}
            className={`transition-transform duration-150 ${showChart ? 'rotate-180' : ''}`}
          />
        </button>
      )}
      {showChart && <ParameterChart param={param} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recommendations + detailed view
// ---------------------------------------------------------------------------

function Recommendations({ items }: { items: Recommendation[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-lg text-ink">
        <Icon name="bulb" size={18} className="text-warning" />
        Recommendations
      </h2>
      <ul className="space-y-2">
        {items.map((r, i) => {
          const style = PRIORITY_PILL[r.priority];
          return (
            <li key={i} className={`rounded-card border-l-4 px-3 py-2.5 text-sm ${style.border} ${style.bg}`}>
              <span className="inline-flex items-center gap-2 font-medium text-ink">
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
                {r.parameter}
              </span>
              <span className="text-muted"> — {r.message}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DetailedView({ data }: { data: StatisticsData }) {
  return (
    <section className="space-y-4">
      {Object.entries(data.parameters).map(([name, param]) => (
        <div key={name} className="bb-card p-4 md:p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-display text-lg text-ink">
              {name}
              {param.unit ? <span className="text-sm font-normal text-muted"> ({param.unit})</span> : null}
            </h3>
            <span className="shrink-0 text-xs text-muted">
              In spec: {param.in_spec_count}/{param.count}
            </span>
          </div>
          <ParameterChart param={param} />
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <div className="rounded-card bg-neutral-50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted">Mean</div>
              <div className="font-display text-base tabular-nums text-ink">{fmt(param.mean)}</div>
            </div>
            <div className="rounded-card bg-neutral-50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted">SD</div>
              <div className="font-display text-base tabular-nums text-ink">±{fmt(param.sd)}</div>
            </div>
            <div className="rounded-card bg-neutral-50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted">Min</div>
              <div className="font-display text-base tabular-nums text-ink">{fmt(param.min)}</div>
            </div>
            <div className="rounded-card bg-neutral-50 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted">Max</div>
              <div className="font-display text-base tabular-nums text-ink">{fmt(param.max)}</div>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

function EmptyForProtocol({ protocolId }: { protocolId: string }) {
  return (
    <div className="bb-card p-8 text-center md:p-10">
      <div className="flex justify-center">
        <ChartIllustration className="h-20 w-20" />
      </div>
      <h2 className="mt-4 text-lg text-ink">No completed experiments yet</h2>
      <p className="mt-1 text-sm text-muted">Complete your first experiment to see reproducibility analysis.</p>
      <Link to={`/protocols/${protocolId}`} className="bb-btn-primary mt-4 inline-flex gap-1.5">
        <Icon name="run" size={16} />
        Start experiment
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Statistics() {
  usePageTitle('Statistics');
  const protocolsQ = useProtocolsForFilter();
  const [protocolId, setProtocolId] = useState<string>('');
  const stats = useStatistics(protocolId || undefined);
  const [showDetails, setShowDetails] = useState(false);

  const selectable = useMemo(
    () => (protocolsQ.data ?? []).filter((p) => (p.run_count ?? 0) > 0),
    [protocolsQ.data],
  );

  const [csvBusy, setCsvBusy] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  async function onCsvDownload() {
    const proto = selectable.find((p) => p.id === protocolId);
    if (!proto) return;
    setCsvError(null);
    setCsvBusy(true);
    try {
      await downloadProtocolCsv(proto.id, proto.name);
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : 'CSV download failed');
    } finally {
      setCsvBusy(false);
    }
  }

  return (
    <PageTransition>
    <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-8">
      <header>
        <h1 className="text-2xl text-ink md:text-3xl">Reproducibility & Statistics</h1>
        <p className="mt-1 text-sm text-muted">Track your measurement consistency across experiments.</p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[240px] flex-1">
          <label className="bb-label" htmlFor="stats-protocol">
            Select a protocol to analyse
          </label>
          <select
            id="stats-protocol"
            className="bb-input"
            value={protocolId}
            onChange={(e) => setProtocolId(e.target.value)}
            disabled={protocolsQ.isLoading}
          >
            <option value="">— Choose a protocol —</option>
            {selectable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.run_count} {p.run_count === 1 ? 'experiment' : 'experiments'})
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={onCsvDownload}
          className="bb-btn-ghost gap-1.5"
          disabled={!protocolId || csvBusy}
          title={!protocolId ? 'Pick a protocol first' : undefined}
        >
          <Icon name="import" size={16} />
          {csvBusy ? 'Preparing CSV…' : 'Download CSV'}
        </button>
      </div>

      {csvError && (
        <div className="bb-card flex items-center gap-2 p-3 text-sm text-danger">
          <Icon name="alert" size={16} className="shrink-0" />
          {csvError}
        </div>
      )}

      {!protocolId ? (
        <div className="bb-card p-6 text-center text-sm text-muted">
          Select a protocol above to see your reproducibility analysis.
        </div>
      ) : stats.isLoading ? (
        <div className="text-sm text-muted">Loading statistics…</div>
      ) : stats.error ? (
        <div className="bb-card p-4 text-sm text-danger">
          Couldn't load statistics: {(stats.error as Error).message}
        </div>
      ) : stats.data && stats.data.completed_runs === 0 ? (
        <EmptyForProtocol protocolId={protocolId} />
      ) : stats.data ? (
        <>
          {/* 1. Hero score card */}
          <HeroScoreCard data={stats.data} />

          {/* 2. Overview stats row */}
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard icon="run" label="Total experiments" value={stats.data.total_runs} />
            <StatCard icon="check" label="Completed" value={stats.data.completed_runs} />
            <StatCard icon="pulse" label="Measurements" value={stats.data.total_measurements} />
            <StatCard
              icon="alert"
              label="Deviations"
              value={stats.data.total_deviations}
              tone={stats.data.total_deviations > 0 ? 'warning' : undefined}
            />
          </section>

          {stats.data.completed_runs === 1 && (
            <div className="bb-card bg-neutral-50 p-3 text-sm text-muted">
              Complete more experiments to see trends and improve accuracy.
            </div>
          )}

          {/* 3. Simple parameter cards */}
          <section className="space-y-3">
            {Object.entries(stats.data.parameters).length === 0 ? (
              <div className="bb-card p-6 text-center text-sm text-muted">
                This protocol has no measurement parameters configured.
              </div>
            ) : (
              Object.entries(stats.data.parameters).map(([name, param]) => (
                <SimpleParameterCard key={name} name={name} param={param} />
              ))
            )}
          </section>

          {/* 4. Recommendations */}
          <Recommendations items={stats.data.recommendations} />

          {/* 5. Detailed view toggle */}
          <section className="pt-2">
            <button
              onClick={() => setShowDetails((v) => !v)}
              className="bb-btn-ghost w-full gap-1.5 sm:w-auto"
              aria-expanded={showDetails}
            >
              <Icon name="chart" size={16} />
              {showDetails ? 'Hide detailed statistics' : 'Show detailed statistics'}
              <Icon
                name="chevron-down"
                size={15}
                className={`transition-transform duration-150 ${showDetails ? 'rotate-180' : ''}`}
              />
            </button>
          </section>
          {showDetails && <DetailedView data={stats.data} />}
        </>
      ) : null}
    </div>
    </PageTransition>
  );
}
