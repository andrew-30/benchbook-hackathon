export interface UserProfile {
  id: string;
  user_id: string;
  name: string;
  institution: string | null;
  research_area: string | null;
  created_at: string;
  updated_at: string;
}

export type RunState = 'in_progress' | 'completed' | 'abandoned';

export interface RunSummary {
  id: string;
  protocol_id: string;
  protocol_name: string;
  run_state: RunState;
  run_started_at: string;
  run_ended_at: string | null;
  created_at: string;
}

export interface DashboardData {
  protocols_count: number;
  runs_this_month: number;
  total_runs: number;
  recent_runs: RunSummary[];
}

export type ProtocolStatus = 'draft' | 'active' | 'archived';

export const CLASSIFICATIONS = [
  'Academic Research',
  'Biology',
  'Chemistry',
  'Clinical',
  'Biotech',
  'Physics',
  'Food Science',
  'Environmental',
  'General',
  'Other',
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export interface Protocol {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  classification: Classification | null;
  status: ProtocolStatus;
  estimated_duration_minutes: number | null;
  step_count: number;
  run_count: number;
  created_at: string;
  updated_at: string;
  /** Start of the most recent experiment; null when never run. Only set by
   *  the GET /api/protocols list endpoint. */
  last_run_at?: string | null;
  /** Materials for this protocol (stamped or checklist-linked, one per name). */
  materials_count?: number;
  /** Materials still missing lot/expiry details (equipment excluded). */
  materials_needs_details?: number;
  /** Materials past their expiry date (equipment excluded). */
  materials_expired?: number;
}

export interface MeasurementParameter {
  name: string;
  unit?: string;
  /** Hard spec — value outside [min_value, max_value] is flagged as out of spec (red). */
  min_value?: number | null;
  max_value?: number | null;
  /**
   * Soft target ± tolerance band. Both target_value and tolerance must be
   * set for the band to apply. Values inside the band are "within tolerance"
   * (green); outside the band but still within hard spec is "outside
   * tolerance" (amber). Backward compatible — older protocols that have only
   * min_value/max_value behave exactly as before.
   */
  target_value?: number | null;
  tolerance?: number | null;
  required?: boolean;
}

export interface ProtocolStep {
  id?: string;
  protocol_id?: string;
  step_order: number;
  /** Optional parent subsection name (e.g. "Solutions Preparation"). Used to
   *  render section dividers in ProtocolDetail and a section header in
   *  RunExecution. NULL for flat protocols and legacy imports. */
  section_title?: string | null;
  title: string | null;
  instruction: string;
  is_critical: boolean;
  timing_mode: 'none' | 'advisory' | 'strict';
  expected_duration_seconds: number | null;
  /**
   * Optional ± tolerance band around expected_duration_seconds. When set
   * along with a non-zero expected_duration_seconds, completion is classified
   * as within / outside tolerance. NULL or 0 = no tolerance (legacy).
   */
  timer_tolerance_seconds?: number | null;
  requires_measurement: boolean;
  measurement_parameters: MeasurementParameter[];
}

// Checklist items can be any material type the universal reagent enum
// supports, PLUS a 'safety' value for items that aren't materials at all
// (e.g. "Don PPE", "Verify fume hood"). Keeping 'safety' separate avoids
// forcing safety-step authors to pick a misleading material category.
export const CHECKLIST_CATEGORIES = [
  'chemical_reagent',
  'biological',
  'standard',
  'solvent',
  'gas',
  'equipment',
  'consumable',
  'safety',
  'other',
] as const;
export type ChecklistItemCategory = (typeof CHECKLIST_CATEGORIES)[number];

export interface ChecklistItem {
  id?: string;
  protocol_id?: string;
  item_order: number;
  item_text: string;
  category: ChecklistItemCategory;
  reagent_id?: string | null;
  is_critical_reagent?: boolean;
}

// ImportResult is defined below alongside the reagent types (it gained
// reagents_created / reagents_created_names for the protocol-organised
// reagent feature).

export type StepState = 'pending' | 'in_progress' | 'completed' | 'skipped';

export type DeviationType =
  | 'measurement_out_of_range'
  | 'timer_exceeded'
  | 'reagent_issue'
  | 'operator_note'
  | 'other';

export interface StepRun {
  id: string;
  user_id: string;
  run_id: string;
  step_id: string;
  step_order: number;
  step_state: StepState;
  step_started_at: string | null;
  step_completed_at: string | null;
  measurement_values: Record<string, unknown>;
  notes: string | null;
  timer_elapsed_seconds: number;
  deviation_flagged: boolean;
  deviation_description: string | null;
  deviation_type: DeviationType | null;
}

export interface Run {
  id: string;
  user_id: string;
  protocol_id: string;
  protocol_name: string;
  run_state: 'in_progress' | 'completed' | 'abandoned';
  run_started_at: string;
  run_ended_at: string | null;
  checklist_completed: Record<string, unknown>;
  notes: string | null;
  result_notes: string | null;
  steps_snapshot: ProtocolStep[] | null;
  /** Auto-set by the start-run handler when the pre-run checklist contained
   *  any expired reagents the researcher chose to proceed with. Drives the
   *  amber notice on Run Detail and the badge on Run History. */
  has_expired_reagent?: boolean;
  created_at: string;
}

export interface RunDetailData {
  run: Run;
  step_runs: StepRun[];
}

export interface RunListItem {
  id: string;
  protocol_id: string;
  protocol_name: string;
  run_state: 'in_progress' | 'completed' | 'abandoned';
  run_started_at: string;
  run_ended_at: string | null;
  created_at: string;
  step_count: number;
  steps_completed: number;
  deviation_count: number;
  measurement_count: number;
  duration_minutes: number | null;
  has_expired_reagent?: boolean;
}

export type RunListPeriod = 'week' | 'month' | 'all';

export interface MethodsResult {
  methods_text: string;
  stats: Array<{ name: string; unit: string; mean: number; sd: number; n: number }>;
  duration_minutes: number | null;
}

export interface StatsTimeSeriesPoint {
  run_number: number;
  value: number;
  run_date: string;
  run_id: string;
}

export interface StatsParameter {
  unit: string;
  min_spec: number | null;
  max_spec: number | null;
  /** Soft target ± tolerance band — both must be present for tolerance scoring. */
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
  time_series: StatsTimeSeriesPoint[];
}

export interface ShareResult {
  token: string;
  share_url: string;
}

export interface SharedRunSnapshotStep {
  step_order: number;
  title: string | null;
  instruction: string;
  is_critical: boolean;
  timing_mode: 'none' | 'advisory' | 'strict';
  expected_duration_seconds: number | null;
  requires_measurement: boolean;
  measurement_parameters: MeasurementParameter[];
}

export interface SharedRunRun {
  id: string;
  protocol_name: string;
  run_started_at: string;
  run_ended_at: string | null;
  run_state: 'in_progress' | 'completed' | 'abandoned';
  steps_snapshot: SharedRunSnapshotStep[] | null;
}

export interface SharedRunStepRun {
  step_order: number;
  step_state: StepState;
  step_completed_at: string | null;
  measurement_values: Record<string, unknown>;
  deviation_flagged: boolean;
  deviation_description: string | null;
  deviation_type: DeviationType | null;
  notes: string | null;
  timer_elapsed_seconds: number;
}

export interface SharedRunData {
  run: SharedRunRun;
  step_runs: SharedRunStepRun[];
  // Optional — the backend tells us whether the viewer is signed in so the
  // page can render the "Copy to my notebook" CTA in one pass.
  viewer_is_authenticated?: boolean;
}

export type ParamStatus = 'consistent' | 'variable' | 'needs_attention' | 'no_spec';
export type ScoreLabel = 'Poor' | 'Fair' | 'Good' | 'Excellent';
export type ScoreColor = 'red' | 'amber' | 'green' | 'indigo';
export type Trend = 'improving' | 'stable' | 'declining' | 'insufficient_data';

export interface StatsExperimentValue {
  experiment_number: number;
  value: number;
  in_spec: boolean;
  /** Three-level status from getMeasurementStatus — null when no constraint applies. */
  tolerance_status:
    | 'within_tolerance'
    | 'outside_tolerance'
    | 'outside_spec'
    | 'no_spec';
  run_date: string;
}

export interface EnrichedStatsParameter extends StatsParameter {
  status: ParamStatus;
  status_label: string;
  tip: string | null;
  experiment_values: StatsExperimentValue[];
}

export type ReagentExpiryStatus = 'no_date' | 'valid' | 'expiring_soon' | 'expired';

// Universal material categories — these work across biology, chemistry,
// physics, clinical, food science, and any other research field. The old
// biology-flavoured set (enzyme/antibody/primer/buffer) was confusing for
// non-biologists; migration 004 remaps existing rows to chemical_reagent.
export const REAGENT_CATEGORIES = [
  'chemical_reagent',
  'biological',
  'standard',
  'solvent',
  'gas',
  'equipment',
  'consumable',
  'other',
] as const;
export type ReagentCategory = (typeof REAGENT_CATEGORIES)[number];

export interface Reagent {
  id: string;
  user_id: string;
  name: string;
  manufacturer: string | null;
  catalogue_number: string | null;
  current_lot_number: string | null;
  expiry_date: string | null;
  storage_conditions: string | null;
  notes: string | null;
  category: ReagentCategory;
  status: 'active' | 'depleted' | 'expired';
  /** Protocol this reagent belongs to (NULL = global / unassigned). */
  protocol_id?: string | null;
  /** Hoisted on grouped + protocol-filtered fetches so cards can render the
   *  parent protocol name without a second round-trip. */
  protocol_name?: string | null;
  source?: 'manual' | 'imported' | 'checklist';
  /** Auto-flipped by the backend — true when lot AND expiry are both blank. */
  needs_details?: boolean;
  created_at: string;
  updated_at: string;
  expiry_status: ReagentExpiryStatus;
  days_until_expiry: number | null;
}

export interface ProtocolReagentGroup {
  /** null for the "General / Unassigned" bucket. */
  protocol_id: string | null;
  protocol_name: string | null;
  /** 'draft' | 'active' | 'archived'; null for Unassigned. */
  protocol_status: string | null;
  /** Checklist rows on the protocol — distinguishes "no materials linked yet"
   *  from "nothing to link". 0 for Unassigned. */
  checklist_count: number;
  /** Reagents stamped with this protocol OR linked from its checklist. A
   *  shared reagent appears in every protocol that uses it. */
  reagents: Reagent[];
}

export interface GroupedReagentsResponse {
  by_protocol: ProtocolReagentGroup[];
  needs_details_count: number;
}

export interface ReagentInput {
  name: string;
  manufacturer?: string | null;
  catalogue_number?: string | null;
  current_lot_number?: string | null;
  expiry_date?: string | null;
  storage_conditions?: string | null;
  notes?: string | null;
  category?: ReagentCategory;
  protocol_id?: string | null;
  source?: 'manual' | 'imported' | 'checklist';
  needs_details?: boolean;
}

export interface ImportResult {
  protocol: Protocol;
  steps: ProtocolStep[];
  checklist_items: ChecklistItem[];
  step_count: number;
  /** Set by the backend when the AI import auto-creates reagent_inventory
   *  rows from the extracted checklist. Used by the Import success card. */
  reagents_created?: number;
  reagents_created_names?: string[];
}

/** Phase-1 response from POST /api/import/ai when the document has 3+
 *  distinct section titles. The client renders a choice modal and POSTs
 *  back with `extracted` + `split_choice` to actually persist. */
export interface ImportPreview {
  requires_choice: true;
  protocol_name: string;
  step_count: number;
  sections: Array<{ title: string; step_count: number }>;
  /** Opaque payload echoed back on confirm — do not introspect. */
  extracted: unknown;
}

/** Phase-2 response when the user chose to split into N protocols. */
export interface ImportSplitResult {
  split: true;
  protocols: Array<{ id: string; name: string; step_count: number }>;
  protocols_created: number;
}

export type ImportResponse = ImportResult | ImportPreview | ImportSplitResult;

export function isImportPreview(r: ImportResponse): r is ImportPreview {
  return (r as ImportPreview).requires_choice === true;
}
export function isImportSplit(r: ImportResponse): r is ImportSplitResult {
  return (r as ImportSplitResult).split === true;
}

export interface ExpiringReagents {
  expired: Reagent[];
  expiring_soon: Reagent[];
}

/** Per-checklist-item snapshot captured at run start.
 *
 *  `reagent_name` carries the library reagent name when the checklist item
 *  was linked to one. `item_text` carries the raw checklist text, which is
 *  ALWAYS captured at run-start so display surfaces (RunDetail / PDF /
 *  methods generator) can show "<name> — Lot X" even for items that aren't
 *  linked to a library reagent. The backend GET /api/runs/:id handler
 *  back-fills `item_text` for legacy runs that pre-date this field. */
export interface ReagentSnapshot {
  checked?: boolean;
  lot_number?: string | null;
  expiry_date?: string | null;
  expiry_status?: ReagentExpiryStatus;
  catalogue_number?: string | null;
  manufacturer?: string | null;
  reagent_name?: string | null;
  reagent_id?: string | null;
  /** Original checklist item text (e.g. "Nuclease-free Water"). */
  item_text?: string | null;
  /** Checklist category (for filtering / future grouping). */
  category?: string | null;
}

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  parameter: string;
  message: string;
}

export interface StatisticsData {
  protocol_name: string;
  total_runs: number;
  completed_runs: number;
  total_measurements: number;
  total_deviations: number;
  /** Cross-parameter tolerance totals (only counts params that have tolerance set). */
  total_within_tolerance: number;
  total_with_tolerance: number;
  /** Cross-parameter spec totals (only counts params that have min/max set). */
  total_in_spec: number;
  total_with_spec: number;
  parameters: Record<string, EnrichedStatsParameter>;
  reproducibility_score: number;
  score_label: ScoreLabel;
  score_color: ScoreColor;
  trend: Trend;
  recommendations: Recommendation[];
}
