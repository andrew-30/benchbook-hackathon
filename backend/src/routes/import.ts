import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import mammoth from 'mammoth';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth.js';
import { createHash } from 'node:crypto';
import { supabaseForUser, supabaseAdmin } from '../lib/supabase.js';
import { anthropic, ANTHROPIC_MODEL } from '../lib/anthropic.js';
import { aiLimiter } from '../lib/rateLimiters.js';
import { aiCostGuard } from '../lib/aiControls.js';
import { logAiUsage } from '../lib/aiUsage.js';
import { safeParseJSON } from '../lib/safeParseJSON.js';
import { sanitiseText, sanitiseRichText } from '../lib/sanitise.js';
import { sendError } from '../lib/errorResponse.js';
import {
  extractPdfText,
  MAX_PDF_PAGES,
  PdfEncryptedError,
  PdfNoTextLayerError,
  PdfTooManyPagesError,
  PdfUnreadableError,
} from '../lib/pdfText.js';

export const importRouter = Router();

// ---------------------------------------------------------------------------
// File upload security
// ---------------------------------------------------------------------------

// Hard-allowlist by MIME *and* by file extension. Either check alone is
// bypassable (MIME can be lied about in the multipart header, extensions can
// be doubled up like "evil.pdf.exe"), so we require BOTH to match the same
// document family.
const ALLOWED_MIME_TYPES = new Set<string>([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'text/plain', // .txt
  'application/pdf', // .pdf
]);

const ALLOWED_EXTENSIONS = new Set<string>(['docx', 'txt', 'pdf']);

/**
 * Upload ceiling.
 *
 * Vercel caps a function's REQUEST BODY at 4.5 MB (4,500,000 bytes) and returns
 * its own `413 FUNCTION_PAYLOAD_TOO_LARGE` as `text/plain` before Express sees
 * the request — so anything above that never reaches this app and can't be
 * reported nicely. Measured against prod 2026-10-13: a 4.2 MB file returned
 * 401 (reached us), a 4.3 MB file returned the platform 413.
 *
 * That limit is NOT raised by paid plans — Vercel scales memory, duration,
 * concurrency and regions by plan, but the request body is fixed. To go above
 * it the browser must upload directly to storage and send us a key instead of
 * bytes.
 *
 * 4 MB keeps ~300 KB of headroom for multipart overhead, so the limit below is
 * actually reachable and LIMIT_FILE_SIZE can return real JSON.
 */
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB — see above; was 5MB (unreachable).
const MAX_FILE_SIZE_MB = Math.round(MAX_FILE_SIZE / (1024 * 1024));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1, // exactly one file per request
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Invalid file type. Only DOCX, TXT, and PDF allowed.'));
    }
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(new Error('Invalid file extension.'));
    }
    cb(null, true);
  },
});

// Expanded for the section-aware normaliser — Food Science + Environmental
// are common for real-world SOPs (analytical chem methods, water testing,
// etc.) and "Other" gives Claude a graceful fallback. "General" stays for
// backward compat with old imports.
const CLASSIFICATIONS = new Set([
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
]);
// Must stay in sync with backend/src/routes/checklist.ts CATEGORIES (the
// universal material set + 'safety' + 'other'). Pre-universal-categories the
// AI was emitting 'reagent' — those land here from older prompts and get
// remapped to chemical_reagent so the row passes the new Zod enum on edit.
const CATEGORIES = new Set([
  'chemical_reagent',
  'biological',
  'standard',
  'solvent',
  'gas',
  'equipment',
  'consumable',
  'safety',
  'other',
]);
function normaliseCategory(raw: string | undefined): string {
  if (!raw) return 'other';
  if (raw === 'reagent') return 'chemical_reagent';
  return CATEGORIES.has(raw) ? raw : 'other';
}
const TIMING_MODES = new Set(['none', 'advisory', 'strict']);

// ---------------------------------------------------------------------------
// Section-aware document pre-analysis
//
// Two cheap regex passes over the cleaned text. The results are fed to Claude
// as inline hints inside the prompt so the model knows:
//   - whether the document has multiple procedure sections to group (vs a
//     flat numbered list)
//   - whether to expect a materials/equipment table to extract as checklist
//     items
//   - which research field the document likely belongs to, so the
//     classification field doesn't default to "Academic Research" for
//     domain-specific SOPs
// ---------------------------------------------------------------------------

interface DocumentAnalysis {
  hasSections: boolean;
  sectionCount: number;
  procedureSections: string[];
  hasMaterialsTable: boolean;
}

const PROCEDURE_HEADING_KEYWORDS = [
  'procedure',
  'method',
  'protocol',
  'analytical method',
  'preparation',
  'analysis',
  'steps',
  'instructions',
  'experimental',
];

const MATERIALS_HEADING_KEYWORDS = [
  'equipment',
  'materials',
  'reagents',
  'chemicals',
  'apparatus',
  'solutions',
];

function detectDocumentSections(text: string): DocumentAnalysis {
  const lines = text.split('\n');
  const procedureSections: string[] = [];
  let hasMaterialsTable = false;
  // Keep heading-like lines short — full prose paragraphs that happen to
  // mention "procedure" are not headings.
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.length > 120) continue;
    const lower = trimmed.toLowerCase();
    if (PROCEDURE_HEADING_KEYWORDS.some((k) => lower.includes(k))) {
      procedureSections.push(trimmed);
    }
    if (MATERIALS_HEADING_KEYWORDS.some((k) => lower.includes(k))) {
      hasMaterialsTable = true;
    }
  }
  return {
    hasSections: procedureSections.length > 1,
    sectionCount: procedureSections.length,
    procedureSections,
    hasMaterialsTable,
  };
}

const FIELD_KEYWORDS: Record<string, string[]> = {
  'Food Science': [
    'fatty acid',
    'gc analysis',
    'fames',
    'methyl ester',
    'nutritional',
    'sensory',
    'texture',
    'flavour',
    'aroma',
    'food',
  ],
  Chemistry: [
    'synthesis',
    'reaction',
    'solvent',
    'titration',
    'chromatography',
    'hplc',
    'nmr',
    'spectroscopy',
    'catalyst',
  ],
  Biology: [
    'cell',
    'pcr',
    'elisa',
    'western blot',
    'protein',
    'dna',
    'rna',
    'culture',
    'antibody',
    'enzyme',
  ],
  Clinical: [
    'patient',
    'clinical',
    'diagnostic',
    'assay',
    'sample collection',
    'serum',
  ],
  Physics: [
    'voltage',
    'current',
    'resistance',
    'optical',
    'laser',
    'substrate',
    'device',
  ],
  Environmental: [
    'water sampling',
    'soil sampling',
    'air quality',
    'environmental monitoring',
    'pollutant',
  ],
};

function detectResearchField(text: string): string {
  const lower = text.toLowerCase();
  // First match wins — keyword sets are intentionally weighted so the more
  // specific buckets ("Food Science", "Clinical") win over the generic
  // "Chemistry" / "Biology" matches when the document straddles fields.
  for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return field;
  }
  return 'Academic Research';
}

/**
 * Static base prompt sent as the Claude `system` message. Stays identical
 * across imports so Anthropic's prompt-cache can hit on the second call
 * onward — cuts both latency and per-call cost noticeably on large
 * documents. Kept under ~1k tokens so it doesn't crowd out output room.
 *
 * Two semantics decisions worth preserving when you edit this:
 *   - Rule 1 says ONE STEP PER ACTION (tagged with section_title), NOT
 *     one step per subsection. The split-into-N-protocols feature relies
 *     on multiple distinct section_title values appearing in the output.
 *     Collapsing a section into a single step regresses that feature.
 *   - CHECKLIST ATTRIBUTION exists so splitting a document into N protocols
 *     gives each one only the materials it actually uses. `null` means
 *     "document-wide" and is mirrored into every split protocol, so a model
 *     that over-attributes loses materials from protocols that need them —
 *     the rule deliberately tells it not to guess.
 *   - The field name is `expected_duration_seconds` (NOT
 *     `timer_duration_seconds`); the persistence layer reads that exact
 *     key. Rename it here and the timer feature silently breaks.
 */
const BASE_PROMPT = `Extract laboratory protocol steps from the document.

SKIP: Purpose, Scope, Background, References, Revision History, Definitions.
CHECKLIST: Equipment / Materials / Reagents tables → protocol-level checklist_items. Also add any reagent, solution, consumable or instrument named only inside the procedure text that is not already listed. Emit checklist_items BEFORE steps.
CHECKLIST ATTRIBUTION: set each item's section_title to the procedure subsection that uses it — a materials table printed inside that subsection, or an item named only in that subsection's steps. Use the SAME strings as the steps' section_title. Use null when the item is used document-wide, in more than one subsection, or when attribution is unclear. Do not guess.
STEPS: Procedure / Method / Analysis / Preparation sections → numbered steps.

RULES:
1. Named subsections → one step PER ACTION; set section_title to the parent subsection name. Do not collapse a subsection into a single step.
2. Flat procedures → one step per logical action; leave section_title null. Group related micro-actions together.
3. Embed safety warnings (NOTE/WARNING/CAUTION) inside the relevant step's instruction.
4. Measurements → measurement_parameters with name/unit/target_value/tolerance/min_value/max_value. Set requires_measurement true.
5. Wait times → expected_duration_seconds. timing_mode = strict (must follow exactly) | advisory (suggested) | none. Set timer_tolerance_seconds when the document gives a ± window.
6. Mark hazardous / time-critical steps with is_critical = true.

CATEGORIES (checklist + reagent mapping):
chemical_reagent | biological | standard | solvent | gas | equipment | consumable | safety | other.

CLASSIFICATIONS:
Academic Research | Biology | Chemistry | Physics | Clinical | Biotech | Food Science | Environmental | Other.

Return ONLY valid JSON — no markdown fences, no preamble, no postamble:
{
  "protocol_name": "string",
  "description": "string (1-2 sentences)",
  "classification": "string",
  "estimated_duration_minutes": number|null,
  "checklist_items": [{"item_text":"string","category":"string","item_order":number,"section_title":"string|null","manufacturer":"string|null","catalogue_number":"string|null"}],
  "steps": [{
    "step_order": number,
    "section_title": "string|null",
    "title": "string|null",
    "instruction": "string",
    "is_critical": boolean,
    "timing_mode": "strict|advisory|none",
    "expected_duration_seconds": number|null,
    "timer_tolerance_seconds": number|null,
    "requires_measurement": boolean,
    "measurement_parameters": [{"name":"string","unit":"string","target_value":number|null,"tolerance":number|null,"min_value":number|null,"max_value":number|null,"required":boolean}]
  }]
}

If no executable steps can be identified, return: { "error": "Could not identify protocol steps" }`;

/**
 * Build only the dynamic per-document context lines. Pairs with BASE_PROMPT
 * (system) — the user message is just these hints + the cleaned document.
 * Each line is omitted when the detector didn't flag it, so the model
 * doesn't get a wall of "false" hints for short documents.
 */
function buildContextHints(
  analysis: DocumentAnalysis,
  detectedField: string,
): string {
  const lines: string[] = [];
  if (analysis.hasSections) {
    const sample = analysis.procedureSections.slice(0, 6).join(' | ');
    lines.push(
      `Document has ${analysis.sectionCount} procedure sections (likely: ${sample}). ` +
        `Tag every step with section_title set to its parent subsection, and ` +
        `attribute checklist_items to a subsection only where the document is explicit.`,
    );
  } else {
    lines.push('Flat procedure structure — leave section_title null.');
  }
  if (analysis.hasMaterialsTable) {
    lines.push('Materials/equipment table present — extract every item into checklist_items.');
  }
  lines.push(`Detected research field: ${detectedField}. Use this for classification unless the text contradicts it.`);
  return lines.join('\n');
}

interface MeasurementParam {
  name?: string;
  unit?: string;
  min_value?: number | null;
  max_value?: number | null;
  // Tolerance fields — emitted by the section-aware prompt and persisted
  // straight through into protocol_steps.measurement_parameters JSONB.
  target_value?: number | null;
  tolerance?: number | null;
  required?: boolean;
}

interface ExtractedStep {
  step_order?: number;
  // Parent subsection label set by the AI when the SOP has named
  // subsections (e.g. "Solutions Preparation"). Drives the UI section
  // dividers + the "split into N protocols" import option.
  section_title?: string | null;
  title?: string | null;
  instruction?: string;
  is_critical?: boolean;
  timing_mode?: string;
  expected_duration_seconds?: number | null;
  // Timer tolerance — paired with expected_duration_seconds for strict
  // timers. The deviation auto-detect logic in RunExecution uses this to
  // classify on-completion timing.
  timer_tolerance_seconds?: number | null;
  requires_measurement?: boolean;
  measurement_parameters?: MeasurementParam[];
}

interface ExtractedChecklist {
  item_text?: string;
  category?: string;
  item_order?: number;
  // Procedure subsection this item belongs to, matching ExtractedStep's
  // section_title. null / absent = document-wide, which is what gets
  // mirrored into every protocol on the split-into-N path.
  section_title?: string | null;
  manufacturer?: string | null;
  catalogue_number?: string | null;
}

/** Map the checklist category enum onto the reagent category enum. Safety
 *  items collapse to 'other' because we don't surface them in the reagent
 *  library — they're pre-run checks, not physical materials. Keep in sync
 *  with the same helper in reagents.ts. */
function mapChecklistToReagentCategory(checklistCategory: string): string {
  const map: Record<string, string> = {
    chemical_reagent: 'chemical_reagent',
    biological: 'biological',
    standard: 'standard',
    solvent: 'solvent',
    gas: 'gas',
    equipment: 'equipment',
    consumable: 'consumable',
    safety: 'other',
    other: 'other',
  };
  return map[checklistCategory] ?? 'other';
}

// ---------------------------------------------------------------------------
// Auto-link imported checklist items to library reagents (Phase A).
//
// Deterministic, exact-match-only resolution. No fuzzy / similarity scoring.
// Per item, in priority order:
//   1) If the item has a non-empty catalogue_number → exact normalised match
//      on reagent_inventory.catalogue_number.
//   2) Else (no catalogue, or catalogue had no hits) → exact normalised match
//      on reagent_inventory.name.
// Multiple matches? Prefer the same mapped category; if that narrows to
// exactly 1 → link. Otherwise → leave reagent_id null AND do NOT create a
// duplicate (Phase B will surface ambiguous matches for user confirmation).
// Zero matches → create a new reagent (today's behaviour) and link to it.
// ---------------------------------------------------------------------------

/** Lowercased, trimmed catalogue number — empty string means "no catalogue". */
function normaliseCatNumber(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

/** Lowercased, trim/collapse-whitespace/strip-surrounding-punctuation name.
 *  Used both as the match key against existing rows AND as the within-batch
 *  dedup key for newly-created reagents — must be applied consistently. */
function normaliseName(s: string | null | undefined): string {
  return (s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

interface ExistingReagent {
  id: string;
  name: string;
  category: string | null;
  catalogue_number: string | null;
}

type ResolvedReagents = {
  /** Aligned 1:1 with the input items array. `null` for safety items, items
   *  with empty text, items with ambiguous matches, and items whose new
   *  reagent insert failed (non-fatal). */
  reagentIdByItem: Array<string | null>;
  /** New reagent rows actually inserted, in insertion order — used by the
   *  single-protocol response payload's `reagents_created` fields. */
  reagentsCreated: Array<{ id: string; name: string }>;
};

/**
 * Resolve a reagent_id for each non-safety checklist item, creating new
 * reagent_inventory rows for items that don't match an existing one.
 *
 * @param sb                       Per-user Supabase client (respects RLS).
 * @param userId                   The owner of these rows.
 * @param protocolIdForNewReagents Protocol id stamped onto newly-created
 *   reagents. NULL is valid and means "global / shared across protocols"
 *   per migration 008 — the split-protocol path uses NULL because the
 *   checklist is mirrored across N protocols.
 * @param items                    Extracted checklist items, in display order.
 */
async function resolveChecklistReagents(
  sb: ReturnType<typeof supabaseForUser>,
  userId: string,
  protocolIdForNewReagents: string | null,
  items: ExtractedChecklist[],
): Promise<ResolvedReagents> {
  if (items.length === 0) {
    return { reagentIdByItem: [], reagentsCreated: [] };
  }

  // Single query — pull just what we need for matching. Typical users have
  // tens to a few hundred reagents; we can match in memory cheaply.
  const { data: existingRows, error: fetchErr } = await sb
    .from('reagent_inventory')
    .select('id, name, category, catalogue_number')
    .eq('user_id', userId);
  if (fetchErr) {
    // Non-fatal — if we can't fetch existing reagents we just create new
    // ones (today's behaviour). Log so it shows up in Sentry.
    console.error('[import/ai] reagent match lookup failed', fetchErr);
  }
  const existing: ExistingReagent[] = (existingRows ?? []) as ExistingReagent[];

  // Build name + catalogue indices once.
  const byCat = new Map<string, ExistingReagent[]>();
  const byName = new Map<string, ExistingReagent[]>();
  for (const r of existing) {
    const c = normaliseCatNumber(r.catalogue_number);
    if (c) {
      const arr = byCat.get(c) ?? [];
      arr.push(r);
      byCat.set(c, arr);
    }
    const n = normaliseName(r.name);
    if (n) {
      const arr = byName.get(n) ?? [];
      arr.push(r);
      byName.set(n, arr);
    }
  }

  type Resolution =
    | { kind: 'link'; id: string }
    | { kind: 'create'; dedupKey: string }
    | { kind: 'skip' }; // safety / empty / ambiguous — leaves reagent_id null

  // newReagentRowsByKey preserves insertion order via Map semantics; that
  // order lines up 1:1 with the rows the INSERT returns.
  type NewReagentRow = {
    user_id: string;
    protocol_id: string | null;
    name: string;
    manufacturer: string | null;
    catalogue_number: string | null;
    category: string;
    source: 'imported';
    needs_details: boolean;
    status: 'active';
  };
  const newReagentRowsByKey = new Map<string, NewReagentRow>();
  const resolutions: Resolution[] = [];

  for (const c of items) {
    if (c.category === 'safety' || !c.item_text) {
      resolutions.push({ kind: 'skip' });
      continue;
    }
    const cleanName = sanitiseText(c.item_text ?? '');
    if (!cleanName) {
      resolutions.push({ kind: 'skip' });
      continue;
    }

    const mappedCategory = mapChecklistToReagentCategory(c.category ?? 'other');
    const itemCat = normaliseCatNumber(c.catalogue_number);
    const itemName = normaliseName(c.item_text);

    // Priority order: catalogue first if present, fall through to name.
    let candidates: ExistingReagent[] = [];
    if (itemCat) candidates = byCat.get(itemCat) ?? [];
    if (candidates.length === 0 && itemName) {
      candidates = byName.get(itemName) ?? [];
    }

    if (candidates.length === 0) {
      // No existing match → queue a new reagent (dedup within the batch).
      // Prefer name as the dedup key for stability across mixed
      // catalogue/no-catalogue items with the same name; fall back to
      // catalogue if name normalises to empty (rare but possible).
      const dedupKey = itemName || itemCat;
      if (!newReagentRowsByKey.has(dedupKey)) {
        newReagentRowsByKey.set(dedupKey, {
          user_id: userId,
          protocol_id: protocolIdForNewReagents,
          name: cleanName,
          manufacturer: c.manufacturer ? sanitiseText(c.manufacturer) : null,
          catalogue_number: c.catalogue_number ? sanitiseText(c.catalogue_number) : null,
          category: mappedCategory,
          source: 'imported',
          // Equipment items skip the "needs details" flag — machines don't
          // expire and don't have current-lot numbers, so flagging them
          // would just generate noise the user can't action.
          needs_details: mappedCategory !== 'equipment',
          status: 'active',
        });
      }
      resolutions.push({ kind: 'create', dedupKey });
    } else if (candidates.length === 1) {
      resolutions.push({ kind: 'link', id: candidates[0]!.id });
    } else {
      // Ambiguous — prefer the same mapped category to disambiguate.
      const sameCat = candidates.filter((m) => m.category === mappedCategory);
      if (sameCat.length === 1) {
        resolutions.push({ kind: 'link', id: sameCat[0]!.id });
      } else {
        // Still ambiguous (multiple matches even within category, OR matches
        // only in other categories). Don't link AND don't create a duplicate
        // — Phase B's suggest-and-confirm will surface these for the user.
        resolutions.push({ kind: 'skip' });
      }
    }
  }

  // Insert new reagents in one batch. Non-fatal on failure (today's policy).
  const newKeyToId = new Map<string, string>();
  const reagentsCreated: Array<{ id: string; name: string }> = [];
  const newRows = Array.from(newReagentRowsByKey.values());
  const newKeys = Array.from(newReagentRowsByKey.keys());
  if (newRows.length > 0) {
    const { data: inserted, error: rErr } = await sb
      .from('reagent_inventory')
      .insert(newRows)
      .select('id, name');
    if (rErr) {
      // Non-fatal — protocol + steps + checklist still save; the user can
      // run Detect Materials later. Log so Sentry sees it. Affected
      // checklist items just end up reagent_id=null.
      console.error('[import/ai] reagent auto-create failed', rErr);
    } else {
      const insertedRows = (inserted ?? []) as Array<{ id: string; name: string }>;
      // Postgres RETURNING preserves insertion order for a single INSERT
      // statement, which is what supabase-js issues here. Pair the i-th
      // inserted row with the i-th dedup key.
      for (let i = 0; i < insertedRows.length && i < newKeys.length; i++) {
        newKeyToId.set(newKeys[i]!, insertedRows[i]!.id);
      }
      for (const r of insertedRows) {
        reagentsCreated.push({ id: r.id, name: r.name });
      }
    }
  }

  const reagentIdByItem: Array<string | null> = resolutions.map((r) => {
    if (r.kind === 'link') return r.id;
    if (r.kind === 'create') return newKeyToId.get(r.dedupKey) ?? null;
    return null;
  });

  return { reagentIdByItem, reagentsCreated };
}

interface ExtractedProtocol {
  error?: string;
  protocol_name?: string;
  description?: string;
  classification?: string;
  estimated_duration_minutes?: number | null;
  steps?: ExtractedStep[];
  checklist_items?: ExtractedChecklist[];
}

/**
 * Detect Anthropic SDK / network failures that should surface as a friendly
 * "import timed out" message (503) rather than a generic 500. Checks the
 * SDK's connection error class names (more portable across SDK versions
 * than `instanceof Anthropic.APIConnectionError` direct refs) AND the
 * common underlying socket/fetch failure strings — "Premature close" was
 * the production symptom that motivated streaming, and ECONNRESET /
 * ETIMEDOUT / socket-hang-up show up in the same family of failures.
 *
 * Recurses into `Error.cause` to catch the wrapped fetch error the SDK
 * rethrows on connection failure.
 */
function isClaudeConnectionFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const name = err.constructor?.name ?? err.name ?? '';
  if (name === 'APIConnectionError' || name === 'APIConnectionTimeoutError') {
    return true;
  }
  const msg = (err.message ?? '').toLowerCase();
  if (
    msg.includes('premature close') ||
    msg.includes('socket hang up') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused')
  ) {
    return true;
  }
  const cause = (err as { cause?: unknown }).cause;
  if (cause && cause !== err) return isClaudeConnectionFailure(cause);
  return false;
}

async function extractTextFromUpload(file: Express.Multer.File): Promise<string> {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  }
  if (name.endsWith('.txt') || file.mimetype.startsWith('text/')) {
    return file.buffer.toString('utf8');
  }
  if (name.endsWith('.pdf') || file.mimetype === 'application/pdf') {
    // Page limit and the scanned-document check live in lib/pdfText.ts and
    // throw typed errors, mapped to 422s in this route's catch block.
    const { text, totalPages, charsPerPage } = await extractPdfText(file.buffer);
    console.log(
      `[import] pdf: ${totalPages} page(s), ${text.length} chars ` +
        `(${Math.round(charsPerPage)}/page)`,
    );
    return text;
  }
  throw new Error('Unsupported file type — upload .docx, .txt or .pdf');
}

/**
 * Strips boilerplate, repeated headers/footers, and pad whitespace before
 * sending the document to Claude. Large SOPs (28-page training manuals,
 * GMP-style binders) carry the same "DOCUMENT NUMBER: …", "Page X of Y",
 * and brand-header lines on every page; that's 20–40% wasted tokens and a
 * larger chance of the model losing the actual procedure thread.
 *
 * Does NOT truncate. It used to cut the text at 40,000 chars and only
 * console.log it, which meant a long document imported as a partial protocol
 * and reported success — steps past the cut simply didn't exist, with nothing
 * to tell the researcher. The output path already refuses to do that
 * (ImportTruncatedError saves nothing and says so); the input path now matches
 * it via MAX_INPUT_CHARS + DocumentTooLongError at the call site.
 */
function cleanExtractedText(text: string): string {
  const lines = text.split('\n');

  // First pass — count how often each non-trivial line appears verbatim.
  // Header/footer rows that repeat on every page bubble up cleanly.
  const lineCount: Record<string, number> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 10) {
      lineCount[trimmed] = (lineCount[trimmed] ?? 0) + 1;
    }
  }

  // Drop trivially short lines + anything repeating > 4 times. 4 is the
  // threshold that catches genuine repeats on 5+ page documents without
  // killing legitimate short repeats like "Step 1" headers.
  const filteredLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.length < 3) return false;
    if ((lineCount[trimmed] ?? 0) > 4) return false;
    return true;
  });

  // Common boilerplate patterns the frequency check doesn't catch (e.g.
  // "Page 3 of 28" — different every page so it won't repeat verbatim).
  const boilerplatePatterns: RegExp[] = [
    /page \d+ of \d+/i,
    /document number:/i,
    /^---+$/,
    /^\| --- \|$/,
    /^\|\s*\|$/,
  ];
  const cleanedLines = filteredLines.filter((line) => {
    const trimmed = line.trim();
    return !boilerplatePatterns.some((p) => p.test(trimmed));
  });

  return cleanedLines.join('\n').trim();
}

/**
 * Maximum cleaned-text length we'll send to Claude in one extraction.
 *
 * Deliberately left at the historical 40,000 for now rather than raised: the
 * largest document anyone has actually imported is ~21,000 chars (measured from
 * `ai_usage`), so this is already ~2x real-world usage, and raising it is gated
 * on timing a large import against the function's duration limit — not on
 * context window, which is nowhere near binding.
 */
const MAX_INPUT_CHARS = 40_000;

/**
 * Pick max_tokens for the Claude extraction call from the size of the
 * cleaned input text (the call site rejects anything over MAX_INPUT_CHARS).
 *
 * The strict schema makes every step emit every field (nulls included), so
 * output runs ~300–400 tokens per step regardless of document size. The old
 * 4k/8k tiers truncated ordinary 10–20 step SOPs and silently dropped their
 * checklist. We only bill for tokens actually emitted, so the ceiling is
 * generous; the call streams, so large values don't hit HTTP timeouts.
 *
 *   ≤ 15,000 chars → 16,000 tokens
 *   >  15,000 chars → 32,000 tokens
 *
 * A truncated response is retried once at double the cap (see callClaude).
 */
function pickMaxTokens(cleanedText: string): number {
  return cleanedText.length <= 15_000 ? 16_000 : 32_000;
}

// The /api/import/ai route times out at 240s (index.ts). Keep the whole
// extraction — including a truncation retry — inside this, with headroom for
// the DB writes that follow.
const IMPORT_DEADLINE_MS = 225_000;

/** Claude's output was still cut off at max_tokens after the retry (or there
 *  wasn't time to retry). Surfaced as a 422 — nothing is saved, because a
 *  partial protocol with missing steps/materials is worse than a clear error. */
class ImportTruncatedError extends Error {
  constructor() {
    super(
      'This document is too long to import completely in one go, so nothing was saved. ' +
        'Split it into smaller sections (for example one procedure per import) or paste ' +
        'just the procedure you need, then try again.',
    );
    this.name = 'ImportTruncatedError';
  }
}

/** The cleaned document exceeds MAX_INPUT_CHARS. Surfaced as a 422 — nothing is
 *  saved and no Claude call is made, because a protocol missing everything past
 *  the cut is worse than a clear error. Mirrors ImportTruncatedError, which does
 *  the same for output that came back cut off. */
class DocumentTooLongError extends Error {
  constructor(actualChars: number) {
    const over = Math.round((actualChars / MAX_INPUT_CHARS) * 10) / 10;
    super(
      `This document is too long to import in one go — it is about ${over}x the ` +
        'size we can process at once, so nothing was saved. Split it into ' +
        'smaller sections (for example one procedure per import), or paste just ' +
        'the procedure you need.',
    );
    this.name = 'DocumentTooLongError';
  }
}

// Bump when BASE_PROMPT / the extraction contract changes, so the content-hash
// cache below can't serve results shaped by the old prompt.
// v2: checklist_items moved ahead of steps + truncated results no longer
// cached — retires the v1 entries that were cut off before their checklist.
// v3: checklist_items carry section_title, so the split-into-N path can give
// each protocol only its own materials — v2 entries have no attribution.
const IMPORT_PROMPT_VERSION = 'v3';

/**
 * Content-hash cache for AI imports (ai_import_cache, migration 017). Both
 * sides are best-effort — a cache error must never fail an import, so
 * everything is wrapped and falls through to a live Claude call.
 */
async function readImportCache(inputHash: string): Promise<ExtractedProtocol | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_import_cache')
      .select('result, hits')
      .eq('input_hash', inputHash)
      .maybeSingle();
    if (error || !data) return null;
    void supabaseAdmin
      .from('ai_import_cache')
      .update({ hits: ((data.hits as number) ?? 0) + 1, last_used_at: new Date().toISOString() })
      .eq('input_hash', inputHash);
    return data.result as ExtractedProtocol;
  } catch {
    return null;
  }
}

function writeImportCache(inputHash: string, result: ExtractedProtocol): void {
  void supabaseAdmin
    .from('ai_import_cache')
    .upsert(
      { input_hash: inputHash, model: ANTHROPIC_MODEL, result },
      { onConflict: 'input_hash' },
    )
    .then(
      ({ error }) => {
        if (error) console.warn('[ai_import_cache] write failed:', error.message);
      },
      (err) => console.warn('[ai_import_cache] write threw:', err),
    );
}

/**
 * Structured outputs (constrained decoding) require Sonnet 5 / Opus / Haiku
 * 4.5 — NOT Sonnet 4.6 or older, which 400 on `output_config`. Gate on the
 * model so a prod ANTHROPIC_MODEL still pinned to an older model falls back to
 * the prompt-only extraction path instead of failing every import. Default is
 * Sonnet 5 (config.ts), so structured outputs are on unless deliberately
 * overridden.
 */
const STRUCTURED_OUTPUT_MODELS = new Set([
  'claude-sonnet-5',
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-haiku-4-5',
  'claude-fable-5',
]);
function supportsStructuredOutputs(model: string): boolean {
  return STRUCTURED_OUTPUT_MODELS.has(model);
}

/**
 * JSON Schema for the extraction, mirroring the shape BASE_PROMPT documents and
 * ExtractedProtocol declares. Passed via output_config.format so the model can
 * ONLY emit schema-valid JSON — no markdown fences, no truncated tail, no
 * missing fields. That removes the truncate → safeParseJSON-repair → dropped-
 * steps failure mode the free-form prompt occasionally hit on large SOPs.
 *
 * Strict-mode note: every property is listed in `required`; "optional" fields
 * are expressed as nullable unions (`["string", "null"]`) instead. The model
 * signals "no protocol here" by returning error != null with steps: [] — the
 * route already treats empty steps as a 422.
 */
const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'error',
    'protocol_name',
    'description',
    'classification',
    'estimated_duration_minutes',
    'checklist_items',
    'steps',
  ],
  properties: {
    error: { type: ['string', 'null'] },
    protocol_name: { type: ['string', 'null'] },
    description: { type: ['string', 'null'] },
    classification: { type: ['string', 'null'] },
    estimated_duration_minutes: { type: ['number', 'null'] },
    // checklist_items MUST stay ahead of steps: output is generated in schema
    // order, so if a response is ever cut off it loses the tail of the steps
    // rather than the whole materials list.
    checklist_items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'item_text',
          'category',
          'item_order',
          'section_title',
          'manufacturer',
          'catalogue_number',
        ],
        properties: {
          item_text: { type: 'string' },
          category: { type: 'string' },
          item_order: { type: 'number' },
          section_title: { type: ['string', 'null'] },
          manufacturer: { type: ['string', 'null'] },
          catalogue_number: { type: ['string', 'null'] },
        },
      },
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'step_order',
          'section_title',
          'title',
          'instruction',
          'is_critical',
          'timing_mode',
          'expected_duration_seconds',
          'timer_tolerance_seconds',
          'requires_measurement',
          'measurement_parameters',
        ],
        properties: {
          step_order: { type: 'number' },
          section_title: { type: ['string', 'null'] },
          title: { type: ['string', 'null'] },
          instruction: { type: 'string' },
          is_critical: { type: 'boolean' },
          timing_mode: { type: 'string', enum: ['strict', 'advisory', 'none'] },
          expected_duration_seconds: { type: ['number', 'null'] },
          timer_tolerance_seconds: { type: ['number', 'null'] },
          requires_measurement: { type: 'boolean' },
          measurement_parameters: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'name',
                'unit',
                'target_value',
                'tolerance',
                'min_value',
                'max_value',
                'required',
              ],
              properties: {
                name: { type: 'string' },
                unit: { type: 'string' },
                target_value: { type: ['number', 'null'] },
                tolerance: { type: ['number', 'null'] },
                min_value: { type: ['number', 'null'] },
                max_value: { type: ['number', 'null'] },
                required: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  },
};

async function callClaude(
  contextHints: string,
  cleanedText: string,
  userId: string | undefined,
): Promise<ExtractedProtocol> {
  // Content-hash cache: an identical re-import (a retry after a blip, or the
  // same SOP again) is served instantly with zero Claude spend. Key on
  // everything the model would see — prompt version, model, context, document.
  const inputHash = createHash('sha256')
    .update(`${IMPORT_PROMPT_VERSION}\n${ANTHROPIC_MODEL}\n${contextHints}\n${cleanedText}`)
    .digest('hex');
  const cached = await readImportCache(inputHash);
  if (cached) {
    console.log('[import] served from content-hash cache — no Claude call');
    logAiUsage({ userId, endpoint: 'import', model: ANTHROPIC_MODEL, cacheHit: true });
    return cached;
  }

  // Streamed (messages.stream + finalMessage) rather than the unary
  // messages.create. The unary path was causing "Premature close" errors in
  // prod when intermediaries closed the long-running connection mid-response.
  // Streaming keeps bytes flowing across the wire, so proxies don't decide the
  // connection is idle. finalMessage() resolves to the same Message shape as
  // messages.create, so downstream code (text extraction, usage/stop_reason
  // logging, safeParseJSON recovery) is unchanged.
  const userContent = `${contextHints}\n\nDocument:\n${cleanedText}`;

  // BASE_PROMPT (static extraction rules) → `system`; dynamic per-document
  // context + the document ride in the user message. On Sonnet 5+ we ALSO
  // constrain generation to EXTRACTION_SCHEMA via output_config, so the model
  // can only emit schema-valid JSON (no fences, no missing fields). Streaming
  // is retained regardless — output_config is just a request param — so the
  // "Premature close" protection on long imports is unaffected.
  const runExtraction = (
    structured: boolean,
    maxTokens: number,
    requestOptions?: { timeout: number; maxRetries: number },
  ) =>
    anthropic.messages
      .stream(
        {
          model: ANTHROPIC_MODEL,
          max_tokens: maxTokens,
          system: BASE_PROMPT,
          messages: [{ role: 'user', content: userContent }],
          ...(structured
            ? { output_config: { format: { type: 'json_schema' as const, schema: EXTRACTION_SCHEMA } } }
            : {}),
        },
        requestOptions,
      )
      .finalMessage();

  // Single compact log line per Claude call + usage row. The fields that
  // matter when an import misbehaves: in/out tokens, stop_reason (max_tokens
  // means truncation) and text_length (sanity check vs output_tokens).
  const logResponse = (
    r: Awaited<ReturnType<typeof runExtraction>>,
    text: string,
    maxTokens: number,
    attempt: string,
  ) => {
    console.log(
      `[import] ${attempt} tokens: ${r.usage?.input_tokens ?? '?'} in ` +
        `(cache_read ${r.usage?.cache_read_input_tokens ?? 0}), ` +
        `${r.usage?.output_tokens ?? '?'} out, ` +
        `stop: ${r.stop_reason}, structured: ${useStructured}, ` +
        `text_length: ${text.length}, max_tokens: ${maxTokens} (chars: ${cleanedText.length})`,
    );
    logAiUsage({ userId, endpoint: 'import', model: ANTHROPIC_MODEL, usage: r.usage });
  };
  const textOf = (r: Awaited<ReturnType<typeof runExtraction>>) =>
    r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');

  const startedAt = Date.now();
  let maxTokens = pickMaxTokens(cleanedText);

  // Self-healing: if output_config is rejected (a 400 — unsupported model
  // slipped past the allowlist, or a schema quirk this SDK/model combo dislikes)
  // retry once prompt-only rather than failing the import. safeParseJSON still
  // recovers the free-form JSON, exactly as it did before structured outputs.
  let useStructured = supportsStructuredOutputs(ANTHROPIC_MODEL);
  let response: Awaited<ReturnType<typeof runExtraction>>;
  try {
    response = await runExtraction(useStructured, maxTokens);
  } catch (err) {
    if (useStructured && (err as { status?: number })?.status === 400) {
      console.warn(
        '[import] output_config rejected (400) — retrying prompt-only:',
        (err as Error)?.message,
      );
      useStructured = false;
      response = await runExtraction(false, maxTokens);
    } else {
      throw err;
    }
  }
  let text = textOf(response);
  logResponse(response, text, maxTokens, 'attempt 1');

  // Truncation guard. A cut-off response used to be "repaired" by
  // safeParseJSON and saved (and cached) as if it were complete — losing the
  // checklist and/or the last steps. Instead: retry once at double the cap if
  // the retry can still finish before the route deadline, otherwise fail
  // clearly. A truncated result is never parsed, saved or cached.
  if (response.stop_reason === 'max_tokens') {
    const elapsed = Date.now() - startedAt;
    const remaining = IMPORT_DEADLINE_MS - elapsed;
    // The retry regenerates everything plus the missing tail, so it needs at
    // least as long again as the first attempt — budget 2x to be safe.
    if (remaining < elapsed * 2) {
      console.warn(
        `[import] Claude hit max_tokens (${maxTokens}) after ${elapsed}ms — ` +
          `no time left to retry (${remaining}ms remaining). Failing import.`,
      );
      throw new ImportTruncatedError();
    }
    maxTokens *= 2;
    console.warn(
      `[import] Claude hit max_tokens after ${elapsed}ms — retrying once with max_tokens ${maxTokens}`,
    );
    response = await runExtraction(useStructured, maxTokens, { timeout: remaining, maxRetries: 0 });
    text = textOf(response);
    logResponse(response, text, maxTokens, 'attempt 2');
    if (response.stop_reason === 'max_tokens') {
      console.warn('[import] retry also hit max_tokens — failing import.');
      throw new ImportTruncatedError();
    }
  }

  try {
    const parsed = safeParseJSON<ExtractedProtocol>(text);
    // Only cache a real, complete extraction (has steps) — never a transient
    // error shape. Truncated responses never reach this point (see above).
    const steps = (parsed as { steps?: unknown[] }).steps;
    if (Array.isArray(steps) && steps.length > 0) writeImportCache(inputHash, parsed);
    return parsed;
  } catch (err) {
    console.error(
      '[import] safeParseJSON failed. First 1000 chars of raw Claude text:',
    );
    console.error(text.slice(0, 1000));
    throw err;
  }
}

// Custom wrapper around multer to give the client a clean error shape instead
// of multer's bare Error thrown into the global error handler. We map the two
// common rejections (size + filter) to the right HTTP statuses; other multer
// errors collapse to 400.
function uploadOrError(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error:
            `File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB. ` +
            'Paste the procedure text instead, or split the document.',
          code: 'FILE_TOO_LARGE',
        });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : 'Upload failed',
      });
    }
    next();
  });
}

/**
 * Group steps by section_title in insertion order. A "section" is a run of
 * consecutive steps sharing the same non-empty section_title. Steps with no
 * section_title (or empty string) become their own untitled group, used for
 * the "one protocol" path but skipped when computing the >=3 trigger.
 */
interface StepSection {
  title: string;
  steps: ExtractedStep[];
}

/**
 * A "protocol group" is one or more sections destined for the same protocol.
 *   - 'separate' mode produces one ProtocolGroup per section (single-section).
 *   - 'custom' mode lets the user combine some sections and keep others alone.
 * Names are joined with " + " for multi-section groups; steps are concatenated
 * in the section order the caller supplied.
 */
interface ProtocolGroup {
  name: string;
  steps: ExtractedStep[];
  // Titles of the sections folded into this group, in the caller's order.
  // Used to pick which checklist items belong to this protocol.
  sectionTitles: string[];
}

/** Normalise a section title for comparison between a step's section_title
 *  and a checklist item's. The AI is asked to reuse the exact same strings,
 *  but case and whitespace drift is common enough to be worth absorbing. */
function normaliseSectionKey(title: string | null | undefined): string {
  return sanitiseText(title ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Cap the joined name so a pathological 10-section combine doesn't produce a
// 500-character protocol name. protocols.name is VARCHAR with no length limit
// at the DB level, but the UI doesn't render such a long name nicely.
const COMBINED_NAME_MAX = 120;

function buildProtocolGroup(
  sectionIndices: number[],
  sections: StepSection[],
): ProtocolGroup {
  if (sectionIndices.length === 1) {
    const s = sections[sectionIndices[0]!]!;
    return { name: s.title, steps: s.steps, sectionTitles: [s.title] };
  }
  const titles = sectionIndices.map((i) => sections[i]!.title);
  const joined = titles.join(' + ');
  const capped =
    joined.length > COMBINED_NAME_MAX
      ? joined.slice(0, COMBINED_NAME_MAX - 1).trimEnd() + '…'
      : joined;
  const name = sanitiseText(capped) || (sanitiseText(titles[0]!) || 'Imported protocol');
  const steps = sectionIndices.flatMap((i) => sections[i]!.steps);
  return { name, steps, sectionTitles: titles };
}

/**
 * Validate a custom-mode `groups` payload from the client. Must be a
 * non-empty array of non-empty integer arrays, with every section index
 * 0..sectionCount-1 appearing EXACTLY ONCE across all groups. Returning a
 * tagged result so the caller can surface a precise 400 reason.
 */
function validateCustomGroups(
  raw: unknown,
  sectionCount: number,
):
  | { ok: true; groups: number[][] }
  | { ok: false; reason: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, reason: 'groups must be a non-empty array' };
  }
  const seen = new Set<number>();
  for (const g of raw) {
    if (!Array.isArray(g) || g.length === 0) {
      return { ok: false, reason: 'each group must be a non-empty array of section indices' };
    }
    for (const idx of g) {
      if (
        typeof idx !== 'number' ||
        !Number.isInteger(idx) ||
        idx < 0 ||
        idx >= sectionCount
      ) {
        return {
          ok: false,
          reason: `section index ${String(idx)} is out of range (0..${sectionCount - 1})`,
        };
      }
      if (seen.has(idx)) {
        return {
          ok: false,
          reason: `section index ${idx} appears in more than one group`,
        };
      }
      seen.add(idx);
    }
  }
  if (seen.size !== sectionCount) {
    return {
      ok: false,
      reason: `expected every section 0..${sectionCount - 1} to appear exactly once; got ${seen.size} of ${sectionCount}`,
    };
  }
  return { ok: true, groups: raw as number[][] };
}

function computeSections(steps: ExtractedStep[]): StepSection[] {
  const map = new Map<string, StepSection>();
  const order: string[] = [];
  for (const s of steps) {
    const t = sanitiseText(s.section_title ?? '');
    if (!t) continue;
    let section = map.get(t);
    if (!section) {
      section = { title: t, steps: [] };
      map.set(t, section);
      order.push(t);
    }
    section.steps.push(s);
  }
  return order.map((t) => map.get(t)!);
}

/**
 * Build the protocol_steps row for a single extracted step. Pulled out so
 * the split-into-N path can re-use it per protocol with renumbered orders.
 */
function buildStepRow(
  s: ExtractedStep,
  index: number,
  userId: string,
  protocolId: string,
) {
  return {
    user_id: userId,
    protocol_id: protocolId,
    step_order: index + 1,
    section_title: sanitiseText(s.section_title ?? '') || null,
    title: sanitiseText(s.title) || null,
    // Step bodies use sanitiseRichText so the small allowlist
    // (b/i/em/strong/br) survives if the model emits it.
    instruction: sanitiseRichText(s.instruction),
    is_critical: !!s.is_critical,
    timing_mode: TIMING_MODES.has(s.timing_mode ?? '') ? s.timing_mode : 'none',
    expected_duration_seconds: s.expected_duration_seconds ?? null,
    // Tolerance only stored when paired with a non-zero duration;
    // otherwise a stray tolerance with no target has no semantic meaning.
    timer_tolerance_seconds:
      s.expected_duration_seconds && s.timer_tolerance_seconds
        ? s.timer_tolerance_seconds
        : null,
    requires_measurement: !!s.requires_measurement,
    measurement_parameters: s.measurement_parameters ?? [],
  };
}

// Middleware chain order matters: requireAuth populates req.userId, then
// aiLimiter keys on that userId (per-user 20/hour) instead of falling back
// to req.ip (which collapsed an institutional NAT into one bucket).
// requireVerifiedEmail runs right after auth (before the rate limiter) so an
// unverified account can't even consume a bucket. aiCostGuard (kill-switch +
// daily quota) runs before uploadOrError so a paused/over-quota request is
// rejected without buffering the file into memory.
importRouter.post(
  '/ai',
  requireAuth,
  requireVerifiedEmail,
  aiLimiter,
  aiCostGuard,
  uploadOrError,
  async (req, res) => {
  try {
    const sb = supabaseForUser(req.accessToken!);

    // ---- Resolve the extracted protocol -----------------------------------
    // Either echoed back from a prior preview (`extracted` in body) or
    // freshly extracted from the uploaded file/text via Claude.
    let extracted: ExtractedProtocol | null = null;
    const echoed = req.body?.extracted;
    if (echoed && typeof echoed === 'object' && !Array.isArray(echoed)) {
      extracted = echoed as ExtractedProtocol;
    } else {
      let sourceText: string | null = null;
      if (req.file) {
        sourceText = await extractTextFromUpload(req.file);
      } else if (typeof req.body?.text === 'string' && req.body.text.trim()) {
        sourceText = req.body.text;
      }
      if (!sourceText || sourceText.trim().length < 20) {
        return res.status(400).json({ error: 'Need at least 20 characters of protocol text' });
      }
      const cleanedText = cleanExtractedText(sourceText);
      // Before the rate limiter's work is wasted and before any Claude spend:
      // refuse an over-long document outright instead of quietly cutting it.
      if (cleanedText.length > MAX_INPUT_CHARS) {
        console.warn(
          `[import] rejected: ${cleanedText.length} cleaned chars exceeds ${MAX_INPUT_CHARS}`,
        );
        throw new DocumentTooLongError(cleanedText.length);
      }
      const analysis = detectDocumentSections(cleanedText);
      const detectedField = detectResearchField(cleanedText);
      const contextHints = buildContextHints(analysis, detectedField);
      extracted = await callClaude(contextHints, cleanedText, req.userId);
    }

    if (!extracted || extracted.error || !extracted.steps || extracted.steps.length === 0) {
      return res.status(422).json({
        error: extracted?.error ?? 'Could not identify protocol steps',
      });
    }

    // ---- Section detection + phase-1 preview ------------------------------
    const sections = computeSections(extracted.steps);
    const splitChoiceRaw = req.body?.split_choice;
    const splitChoice =
      splitChoiceRaw === 'separate' ||
      splitChoiceRaw === 'one' ||
      splitChoiceRaw === 'custom'
        ? (splitChoiceRaw as 'separate' | 'one' | 'custom')
        : null;

    // Preview mode: when the SOP has 3+ distinct sections AND the client
    // hasn't picked yet, return the extraction unsaved so the frontend can
    // show the choice modal. The client echoes `extracted` back on confirm.
    if (sections.length >= 3 && !splitChoice) {
      return res.status(200).json({
        requires_choice: true,
        protocol_name: sanitiseText(extracted.protocol_name) || 'Imported protocol',
        step_count: extracted.steps.length,
        sections: sections.map((s) => ({
          title: s.title,
          step_count: s.steps.length,
        })),
        // Echo the full extracted payload so the second POST doesn't need to
        // re-run Claude. Client treats this as opaque.
        extracted,
      });
    }

    // ---- Persist: multi-protocol path (separate or custom) ----------------
    //
    // 'separate'  → one protocol per section (today's behaviour exactly,
    //               produced by mapping each section index to its own group).
    // 'custom'    → groups come from the client request; validated below.
    //
    // The persistence loop is identical for both modes — only how `groups`
    // is built differs. 'one' / single-protocol mode falls through past
    // this block.
    let groups: number[][] | null = null;
    if (splitChoice === 'separate' && sections.length >= 2) {
      groups = sections.map((_, i) => [i]);
    } else if (splitChoice === 'custom') {
      const v = validateCustomGroups(req.body?.groups, sections.length);
      if (!v.ok) {
        return res.status(400).json({
          error: 'Invalid groups',
          message: v.reason,
        });
      }
      groups = v.groups;
    }

    if (groups !== null) {
      const classification =
        extracted.classification && CLASSIFICATIONS.has(extracted.classification)
          ? extracted.classification
          : 'Academic Research';
      const originalName =
        sanitiseText(extracted.protocol_name) || 'Imported protocol';

      // Build a ProtocolGroup per requested group of sections. Single-section
      // groups keep the section title verbatim (preserves 'separate' naming).
      // Multi-section groups get titles joined with " + " and capped.
      const protocolGroups = groups.map((g) => buildProtocolGroup(g, sections));

      // Resolve checklist→reagent links ONCE, before any protocol is created.
      // New reagents are stamped with protocol_id=NULL (global / shared)
      // because one item can legitimately land in several created protocols
      // — creating per-protocol duplicates would clutter the inventory.
      const splitItems = extracted.checklist_items ?? [];
      const { reagentIdByItem: splitReagentIdByItem, reagentsCreated: splitReagentsCreated } =
        await resolveChecklistReagents(sb, req.userId!, null, splitItems);

      // Attribute each checklist item to the protocol(s) that actually use it.
      // The AI tags items with the subsection they belong to; an item with no
      // section_title — or one naming a section we didn't detect — is treated
      // as document-wide and mirrored into every protocol. That fail-open is
      // deliberate: importing a protocol without a material it needs is worse
      // than importing one with a material it doesn't, and it keeps v2-shaped
      // cached extractions (no attribution at all) behaving exactly as before.
      const knownSectionKeys = new Set(
        sections.map((sec) => normaliseSectionKey(sec.title)),
      );
      function itemsForGroup(grp: ProtocolGroup) {
        const own = new Set(grp.sectionTitles.map((t) => normaliseSectionKey(t)));
        return splitItems
          .map((item, index) => ({ item, index }))
          .filter(({ item }) => {
            const key = normaliseSectionKey(item.section_title);
            if (!key || !knownSectionKeys.has(key)) return true;
            return own.has(key);
          });
      }

      const created: Array<{ id: string; name: string; step_count: number }> = [];
      try {
        for (const grp of protocolGroups) {
          const { data: p, error: pErr } = await sb
            .from('protocols')
            .insert({
              user_id: req.userId!,
              name: grp.name,
              description: `From "${originalName}"`,
              classification,
              estimated_duration_minutes: null,
              status: 'draft',
              step_count: grp.steps.length,
            })
            .select()
            .single();
          if (pErr || !p) throw new Error(pErr?.message ?? 'Could not create protocol');

          // Steps are concatenated in the group's section order and
          // renumbered sequentially via buildStepRow (which uses array
          // index + 1 as step_order). For multi-section combined groups,
          // section_title is preserved per step, so ProtocolDetail's
          // section dividers still render the original boundaries.
          const stepRows = grp.steps.map((s, i) =>
            buildStepRow(s, i, req.userId!, p.id),
          );
          const { error: sErr } = await sb.from('protocol_steps').insert(stepRows);
          if (sErr) throw new Error(sErr.message);

          // Only this protocol's own materials, plus the document-wide ones
          // (see itemsForGroup). item_order is renumbered from the filtered
          // position so the list has no gaps; reagent_id comes from the
          // pre-resolved mapping keyed on the ORIGINAL index, so every
          // protocol still points at the same shared reagent rows.
          const checklistRows = itemsForGroup(grp).map(({ item: c, index }, i) => ({
            user_id: req.userId!,
            protocol_id: p.id,
            item_order: i + 1,
            item_text: sanitiseText(c.item_text),
            category: normaliseCategory(c.category),
            reagent_id: splitReagentIdByItem[index] ?? null,
          }));
          if (checklistRows.length > 0) {
            const { error: cErr } = await sb
              .from('protocol_checklist_items')
              .insert(checklistRows);
            if (cErr) throw new Error(cErr.message);
          }

          created.push({ id: p.id, name: p.name, step_count: grp.steps.length });
        }
      } catch (err) {
        // Best-effort rollback: delete the protocols we created, plus the
        // newly-created reagents (they were stamped with protocol_id=NULL
        // so the protocol cascades wouldn't touch them, and we don't want
        // to leave orphaned imported reagents behind on a failed import).
        for (const c of created) {
          await sb.from('protocols').delete().eq('id', c.id);
        }
        const newReagentIds = splitReagentsCreated.map((r) => r.id);
        if (newReagentIds.length > 0) {
          await sb
            .from('reagent_inventory')
            .delete()
            .in('id', newReagentIds)
            .eq('user_id', req.userId!);
        }
        // Pass the original err to sendError — sanitiseError pattern-matches
        // the Postgres error in prod. Don't inline the message into a string;
        // that would re-leak the detail we're trying to suppress.
        return sendError(res, 500, err instanceof Error ? err : 'Failed saving split');
      }

      return res.status(201).json({
        split: true,
        protocols: created,
        protocols_created: created.length,
      });
    }

    // ---- Persist: single protocol (default + 'one' choice) ----------------
    const classification =
      extracted.classification && CLASSIFICATIONS.has(extracted.classification)
        ? extracted.classification
        : 'Academic Research';

    // Sanitise AI-extracted content before it lands in the DB. Claude is
    // instructed to return plain text, but defence-in-depth: the model is
    // ultimately user-influenced via the source SOP and we don't trust it.
    const safeName = sanitiseText(extracted.protocol_name) || 'Imported protocol';
    const safeDescription = sanitiseText(extracted.description) || null;

    const { data: protocol, error: pErr } = await sb
      .from('protocols')
      .insert({
        user_id: req.userId!,
        name: safeName,
        description: safeDescription,
        classification,
        estimated_duration_minutes: extracted.estimated_duration_minutes ?? null,
        status: 'draft',
        step_count: extracted.steps.length,
      })
      .select()
      .single();

    if (pErr || !protocol) {
      return sendError(res, 500, pErr ?? 'Could not create protocol');
    }

    const stepRows = extracted.steps.map((s, i) =>
      buildStepRow(s, i, req.userId!, protocol.id),
    );

    // Resolve checklist→reagent links BEFORE inserting the checklist so
    // each row can carry its reagent_id. Helper matches deterministically
    // against existing library reagents (catalogue first, then name); if no
    // match, a new reagent is created here with protocol_id=protocol.id
    // (today's single-protocol behaviour). Reagent failures stay non-fatal.
    const itemsForChecklist = extracted.checklist_items ?? [];
    const { reagentIdByItem, reagentsCreated } = await resolveChecklistReagents(
      sb,
      req.userId!,
      protocol.id,
      itemsForChecklist,
    );

    const checklistRows = itemsForChecklist.map((c, i) => ({
      user_id: req.userId!,
      protocol_id: protocol.id,
      item_order: typeof c.item_order === 'number' ? c.item_order : i + 1,
      item_text: sanitiseText(c.item_text),
      category: normaliseCategory(c.category),
      reagent_id: reagentIdByItem[i] ?? null,
    }));

    const childResults = await Promise.all([
      stepRows.length > 0 ? sb.from('protocol_steps').insert(stepRows) : Promise.resolve({ error: null }),
      checklistRows.length > 0
        ? sb.from('protocol_checklist_items').insert(checklistRows)
        : Promise.resolve({ error: null }),
    ]);
    const childErr = childResults.map((r) => r.error).find(Boolean);
    if (childErr) {
      // Best-effort rollback: delete the protocol AND the freshly-created
      // reagents (those new rows are tied to this protocol via protocol_id;
      // the FK has ON DELETE SET NULL, so without this delete they'd be
      // left behind as orphaned "global" reagents on a failed import).
      await sb.from('protocols').delete().eq('id', protocol.id);
      const newReagentIds = reagentsCreated.map((r) => r.id);
      if (newReagentIds.length > 0) {
        await sb
          .from('reagent_inventory')
          .delete()
          .in('id', newReagentIds)
          .eq('user_id', req.userId!);
      }
      // Same as the split-path catch above: don't inline childErr.message
      // into the response string; pass the Error to sendError so prod
      // sanitisation strips Postgres detail.
      return sendError(res, 500, childErr);
    }

    // resolveChecklistReagents already did the insert + within-batch dedup +
    // safety/equipment handling, so the legacy auto-detect block that used
    // to live here is gone. Surface the count + names on the response
    // exactly as before for the Import success card.
    return res.status(201).json({
      protocol,
      steps: stepRows,
      checklist_items: checklistRows,
      step_count: stepRows.length,
      reagents_created: reagentsCreated.length,
      reagents_created_names: reagentsCreated.map((r) => r.name),
    });
  } catch (err) {
    console.error('[import/ai]', err);
    if (err instanceof ImportTruncatedError) {
      return res.status(422).json({ error: err.message, code: 'IMPORT_TRUNCATED' });
    }
    if (err instanceof DocumentTooLongError) {
      return res.status(422).json({ error: err.message, code: 'DOCUMENT_TOO_LONG' });
    }
    // PDF problems are all "the user must change the file", and all are decided
    // before any Claude call. Returned explicitly rather than via sendError so
    // these app-authored messages reach the user verbatim in production.
    if (err instanceof PdfTooManyPagesError) {
      return res.status(422).json({
        error: err.message,
        code: 'PDF_TOO_MANY_PAGES',
        pages: err.pages,
        max_pages: MAX_PDF_PAGES,
      });
    }
    if (err instanceof PdfNoTextLayerError) {
      return res.status(422).json({ error: err.message, code: 'PDF_NO_TEXT_LAYER' });
    }
    if (err instanceof PdfEncryptedError) {
      return res.status(422).json({ error: err.message, code: 'PDF_ENCRYPTED' });
    }
    if (err instanceof PdfUnreadableError) {
      return res.status(422).json({ error: err.message, code: 'PDF_UNREADABLE' });
    }
    // Surface Anthropic connection failures (incl. "Premature close" from
    // the wrapped fetch error) as a 503 with actionable copy. The SDK
    // already retried up to maxRetries before this catch fires, so by
    // this point a real network problem has stuck through retries.
    if (isClaudeConnectionFailure(err)) {
      return res.status(503).json({
        error:
          'Import timed out — please try again. For large documents try the Paste text option instead.',
        code: 'IMPORT_CONNECTION_TIMEOUT',
      });
    }
    return sendError(res, 500, err instanceof Error ? err : 'Import failed');
  }
});
