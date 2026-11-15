import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { computeExpiryStatus, sortByExpiryThenName } from '../lib/reagents.js';
import { sanitiseText } from '../lib/sanitise.js';
import { sendError } from '../lib/errorResponse.js';

export const reagentsRouter = Router();

// Universal material categories. The old biology-flavoured set was confusing
// for researchers in chemistry, physics, clinical, food science, etc. The
// 004_universal_categories migration remaps existing rows
// (enzyme/antibody/primer/buffer/reagent → chemical_reagent).
const CATEGORIES = [
  'chemical_reagent',
  'biological',
  'standard',
  'solvent',
  'gas',
  'equipment',
  'consumable',
  'other',
] as const;

const SOURCES = ['manual', 'imported', 'checklist'] as const;

const ReagentInput = z.object({
  name: z.string().min(1).max(200),
  manufacturer: z.string().max(200).nullable().optional(),
  catalogue_number: z.string().max(120).nullable().optional(),
  current_lot_number: z.string().max(120).nullable().optional(),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  storage_conditions: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  category: z.enum(CATEGORIES).optional(),
  // Protocol-organised reagent fields. All optional — when omitted the
  // reagent lands in the "General / Unassigned" bucket with source='manual'
  // and needs_details derived from whether lot/expiry are set.
  protocol_id: z.string().uuid().nullable().optional(),
  source: z.enum(SOURCES).optional(),
  needs_details: z.boolean().optional(),
});

// Quick-fill schema — only lot + expiry. Used by the Needs Details tab to
// finish populating an auto-detected reagent without making the user open
// the full edit modal.
const FillDetailsInput = z.object({
  current_lot_number: z.string().max(120).nullable().optional(),
  expiry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

interface ReagentRow {
  id: string;
  user_id: string;
  name: string;
  manufacturer: string | null;
  catalogue_number: string | null;
  current_lot_number: string | null;
  expiry_date: string | null;
  storage_conditions: string | null;
  notes: string | null;
  category: string;
  status: string;
  // Migration 008 columns. May be absent on legacy rows surfaced before the
  // migration has run; downstream code null-coalesces.
  protocol_id: string | null;
  source: 'manual' | 'imported' | 'checklist' | null;
  needs_details: boolean | null;
  created_at: string;
  updated_at: string;
}

interface ReagentRowWithProtocol extends ReagentRow {
  protocols?: { id: string; name: string } | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Within one protocol the same material can exist as two rows — e.g. the
 * shared reagent a split import created plus a per-protocol copy that Detect
 * Materials made before it honoured checklist links. Show one row per name:
 * prefer the row with a lot/expiry filled in, then the row the checklist
 * actually links to (what pre-run and run records use).
 */
export function dedupeByName<
  T extends { id: string; name: string; current_lot_number: string | null; expiry_date: string | null },
>(rows: T[], linkedIds: Set<string>): T[] {
  const score = (r: T) => (r.current_lot_number || r.expiry_date ? 2 : 0) + (linkedIds.has(r.id) ? 1 : 0);
  const best = new Map<string, T>();
  for (const r of rows) {
    const key = r.name.trim().toLowerCase().replace(/\s+/g, ' ');
    const current = best.get(key);
    if (!current || score(r) > score(current)) best.set(key, r);
  }
  return Array.from(best.values());
}

function enrich(row: ReagentRow) {
  const { status: expiry_status, days_until_expiry } = computeExpiryStatus(row.expiry_date);
  return { ...row, expiry_status, days_until_expiry };
}

/**
 * needs_details is true when the user still has work to do on the reagent —
 * lot number AND expiry date both unset. Used to auto-flip the flag during
 * create + fill-details so it doesn't drift.
 *
 * Equipment is the exception: machines (e.g. a ChemiDoc imager) don't
 * expire and don't have a "current lot" the way reagents do, so they are
 * always treated as complete regardless of lot/expiry presence. All other
 * categories keep the original lot-AND-expiry-both-missing rule.
 */
function computeNeedsDetails(
  lot: string | null | undefined,
  expiry: string | null | undefined,
  category: string | null | undefined,
): boolean {
  if (category === 'equipment') return false;
  const hasLot = !!(lot && lot.trim());
  const hasExpiry = !!(expiry && expiry.trim());
  return !hasLot && !hasExpiry;
}

// ---------------------------------------------------------------------------
// GET /api/reagents
// ---------------------------------------------------------------------------

reagentsRouter.get('/', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const userId = req.userId!;
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : null;
  const categoryFilter = typeof req.query.category === 'string' ? req.query.category : null;
  const protocolId = typeof req.query.protocol_id === 'string' ? req.query.protocol_id : null;
  const needsDetails = req.query.needs_details === 'true';
  const grouped = req.query.grouped === 'true';
  const expiringSoon = req.query.expiring_soon === 'true';

  // For the grouped view we need to JOIN the protocol name. Supabase's
  // PostgREST syntax `protocols(id, name)` does that in a single round-trip.
  const selectClause = grouped ? '*, protocols(id, name)' : '*';

  let q = sb.from('reagent_inventory').select(selectClause).eq('user_id', userId);
  if (statusFilter) q = q.eq('status', statusFilter);
  if (categoryFilter) q = q.eq('category', categoryFilter);
  let linkedForProtocol: Set<string> | null = null;
  if (protocolId === 'null') {
    // Allow explicit ?protocol_id=null to fetch only unassigned reagents.
    q = q.is('protocol_id', null);
  } else if (protocolId) {
    if (!UUID_RE.test(protocolId)) {
      return res.status(400).json({ error: 'Invalid protocol_id' });
    }
    // A protocol's materials are the reagents stamped with its protocol_id
    // PLUS any library reagent its checklist links to. Split imports create
    // shared reagents with protocol_id=NULL, and imports also link to reagents
    // the user already had — filtering on protocol_id alone hid both.
    const { data: links, error: linkErr } = await sb
      .from('protocol_checklist_items')
      .select('reagent_id')
      .eq('user_id', userId)
      .eq('protocol_id', protocolId)
      .not('reagent_id', 'is', null);
    if (linkErr) return sendError(res, 500, linkErr);
    const linkedIds = [
      ...new Set((links ?? []).map((l) => l.reagent_id as string)),
    ].filter((id) => UUID_RE.test(id));
    linkedForProtocol = new Set(linkedIds);
    q =
      linkedIds.length > 0
        ? q.or(`protocol_id.eq.${protocolId},id.in.(${linkedIds.join(',')})`)
        : q.eq('protocol_id', protocolId);
  }
  if (needsDetails) q = q.eq('needs_details', true);

  const { data, error } = await q;
  if (error) return sendError(res, 500, error);

  // PostgREST returns a JOIN'd shape that Supabase's generated types model as
  // a parser-error union when the select string is built dynamically. Cast
  // via `unknown` — the runtime shape is exactly ReagentRowWithProtocol[].
  const rows = ((data as unknown) as ReagentRowWithProtocol[]) ?? [];

  // Strip the joined `protocols` object out of the base reagent record and
  // hoist `protocols.name` onto each row as a flat `protocol_name` field —
  // simpler for the frontend than dealing with a nested object on every row.
  let enriched = rows.map((row) => {
    const { protocols, ...base } = row;
    return {
      ...enrich(base as ReagentRow),
      protocol_name: protocols?.name ?? null,
    };
  });

  if (expiringSoon) {
    enriched = enriched.filter(
      (r) => r.expiry_status === 'expiring_soon' || r.expiry_status === 'expired',
    );
  }

  if (linkedForProtocol) enriched = dedupeByName(enriched, linkedForProtocol);

  if (grouped) {
    // One section per protocol. A reagent belongs to a protocol when it is
    // stamped with that protocol_id OR the protocol's checklist links to it —
    // so a shared reagent (split import, or reused across protocols) shows
    // under every protocol that uses it. Reagents in no protocol land in a
    // single "General / Unassigned" bucket (protocol_id null; the frontend
    // renders the label).
    const [protocolsRes, linksRes] = await Promise.all([
      sb.from('protocols').select('id, name, status').eq('user_id', userId),
      sb.from('protocol_checklist_items').select('protocol_id, reagent_id').eq('user_id', userId),
    ]);
    if (protocolsRes.error) return sendError(res, 500, protocolsRes.error);
    if (linksRes.error) return sendError(res, 500, linksRes.error);

    type Group = {
      protocol_id: string | null;
      protocol_name: string | null;
      protocol_status: string | null;
      checklist_count: number;
      reagents: typeof enriched;
    };
    const groupsById = new Map<string, Group>();
    for (const p of (protocolsRes.data ?? []) as Array<{ id: string; name: string; status: string }>) {
      groupsById.set(p.id, {
        protocol_id: p.id,
        protocol_name: p.name,
        protocol_status: p.status,
        checklist_count: 0,
        reagents: [],
      });
    }

    const reagentById = new Map(enriched.map((r) => [r.id, r]));
    const placed = new Set<string>(); // `${protocolId}:${reagentId}` — no dupes within a group
    const inSomeProtocol = new Set<string>();
    const linkedByProtocol = new Map<string, Set<string>>();
    const place = (pid: string, r: (typeof enriched)[number]) => {
      const g = groupsById.get(pid);
      if (!g || placed.has(`${pid}:${r.id}`)) return;
      placed.add(`${pid}:${r.id}`);
      g.reagents.push(r);
      inSomeProtocol.add(r.id);
    };
    for (const r of enriched) {
      if (r.protocol_id) place(r.protocol_id, r);
    }
    for (const link of (linksRes.data ?? []) as Array<{ protocol_id: string; reagent_id: string | null }>) {
      const g = groupsById.get(link.protocol_id);
      if (!g) continue;
      g.checklist_count++;
      const r = link.reagent_id ? reagentById.get(link.reagent_id) : undefined;
      if (r) {
        place(link.protocol_id, r);
        if (!linkedByProtocol.has(link.protocol_id)) linkedByProtocol.set(link.protocol_id, new Set());
        linkedByProtocol.get(link.protocol_id)!.add(r.id);
      }
    }

    // Keep protocols that have materials, plus non-archived protocols with a
    // checklist but nothing linked yet (so an import that found no materials
    // is visible rather than silently missing). Active/draft before archived,
    // then alphabetical; Unassigned last.
    const groups = Array.from(groupsById.values())
      .filter((g) => g.reagents.length > 0 || (g.checklist_count > 0 && g.protocol_status !== 'archived'))
      .map((g) => ({
        ...g,
        reagents: sortByExpiryThenName(
          dedupeByName(g.reagents, linkedByProtocol.get(g.protocol_id!) ?? new Set()),
        ),
      }))
      .sort((a, b) => {
        const archivedDiff =
          Number(a.protocol_status === 'archived') - Number(b.protocol_status === 'archived');
        if (archivedDiff !== 0) return archivedDiff;
        return (a.protocol_name ?? '').localeCompare(b.protocol_name ?? '');
      });
    const unassigned = enriched.filter((r) => !inSomeProtocol.has(r.id));
    if (unassigned.length > 0) {
      groups.push({
        protocol_id: null,
        protocol_name: null,
        protocol_status: null,
        checklist_count: 0,
        reagents: sortByExpiryThenName(unassigned),
      });
    }

    const needs_details_count = enriched.filter((r) => r.needs_details === true).length;
    return res.json({ by_protocol: groups, needs_details_count });
  }

  return res.json(sortByExpiryThenName(enriched));
});

// ---------------------------------------------------------------------------
// GET /api/reagents/expiring
// ---------------------------------------------------------------------------

reagentsRouter.get('/expiring', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const { data, error } = await sb
    .from('reagent_inventory')
    .select('*')
    .eq('user_id', req.userId!);
  if (error) return sendError(res, 500, error);
  const enriched = (data as ReagentRow[]).map(enrich);
  return res.json({
    expired: sortByExpiryThenName(enriched.filter((r) => r.expiry_status === 'expired')),
    expiring_soon: sortByExpiryThenName(
      enriched.filter((r) => r.expiry_status === 'expiring_soon'),
    ),
  });
});

// ---------------------------------------------------------------------------
// POST /api/reagents
// ---------------------------------------------------------------------------

reagentsRouter.post('/', requireAuth, async (req, res) => {
  const parsed = ReagentInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const sb = supabaseForUser(req.accessToken!);
  const lot = parsed.data.current_lot_number ?? null;
  const expiry = parsed.data.expiry_date ?? null;
  const category = parsed.data.category ?? 'chemical_reagent';
  // Honour the caller's explicit needs_details if set; otherwise derive from
  // lot + expiry presence. Equipment short-circuits to false inside
  // computeNeedsDetails — see its doc.
  const needs_details =
    parsed.data.needs_details ?? computeNeedsDetails(lot, expiry, category);
  const { data, error } = await sb
    .from('reagent_inventory')
    .insert({
      user_id: req.userId!,
      name: sanitiseText(parsed.data.name),
      manufacturer: parsed.data.manufacturer ? sanitiseText(parsed.data.manufacturer) : null,
      catalogue_number: parsed.data.catalogue_number ?? null,
      current_lot_number: lot,
      expiry_date: expiry,
      storage_conditions: parsed.data.storage_conditions
        ? sanitiseText(parsed.data.storage_conditions)
        : null,
      notes: parsed.data.notes ? sanitiseText(parsed.data.notes) : null,
      category,
      protocol_id: parsed.data.protocol_id ?? null,
      source: parsed.data.source ?? 'manual',
      needs_details,
    })
    .select()
    .single();
  if (error) return sendError(res, 500, error);
  return res.status(201).json(enrich(data as ReagentRow));
});

// ---------------------------------------------------------------------------
// PUT /api/reagents/:id
// ---------------------------------------------------------------------------

reagentsRouter.put('/:id', requireAuth, async (req, res) => {
  const parsed = ReagentInput.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const sb = supabaseForUser(req.accessToken!);
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  // Fields that need HTML stripping before they hit the DB.
  const SANITISED_TEXT_FIELDS = new Set<string>([
    'name',
    'manufacturer',
    'storage_conditions',
    'notes',
  ]);
  for (const key of [
    'name',
    'manufacturer',
    'catalogue_number',
    'current_lot_number',
    'expiry_date',
    'storage_conditions',
    'notes',
    'category',
    'protocol_id',
    'source',
    'needs_details',
  ] as const) {
    const raw = parsed.data[key];
    if (raw === undefined) continue;
    if (SANITISED_TEXT_FIELDS.has(key) && typeof raw === 'string') {
      update[key] = sanitiseText(raw) || null;
    } else {
      update[key] = raw ?? null;
    }
  }
  // If either lot, expiry, or category was touched but the caller didn't
  // explicitly set needs_details, re-derive it from the resulting values
  // so the flag doesn't drift out of sync with the data. Category is
  // included because flipping a row to/from 'equipment' changes whether
  // lot/expiry are even required.
  if (
    parsed.data.needs_details === undefined &&
    (parsed.data.current_lot_number !== undefined ||
      parsed.data.expiry_date !== undefined ||
      parsed.data.category !== undefined)
  ) {
    // We don't have the old values handy without a refetch; load them.
    const { data: prev } = await sb
      .from('reagent_inventory')
      .select('current_lot_number, expiry_date, category')
      .eq('id', req.params.id)
      .eq('user_id', req.userId!)
      .maybeSingle();
    const nextLot =
      parsed.data.current_lot_number !== undefined
        ? parsed.data.current_lot_number
        : (prev?.current_lot_number ?? null);
    const nextExp =
      parsed.data.expiry_date !== undefined
        ? parsed.data.expiry_date
        : (prev?.expiry_date ?? null);
    const nextCat =
      parsed.data.category !== undefined
        ? parsed.data.category
        : (prev?.category ?? null);
    update.needs_details = computeNeedsDetails(nextLot, nextExp, nextCat);
  }
  const { data, error } = await sb
    .from('reagent_inventory')
    .update(update)
    .eq('id', req.params.id)
    .eq('user_id', req.userId!)
    .select()
    .single();
  if (error) return sendError(res, 500, error);
  if (!data) return res.status(404).json({ error: 'Not found' });
  return res.json(enrich(data as ReagentRow));
});

// ---------------------------------------------------------------------------
// PUT /api/reagents/:id/fill-details — quick-fill lot + expiry only.
// ---------------------------------------------------------------------------

reagentsRouter.put('/:id/fill-details', requireAuth, async (req, res) => {
  const parsed = FillDetailsInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const sb = supabaseForUser(req.accessToken!);
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.current_lot_number !== undefined) {
    update.current_lot_number = parsed.data.current_lot_number ?? null;
  }
  if (parsed.data.expiry_date !== undefined) {
    update.expiry_date = parsed.data.expiry_date ?? null;
  }
  // Re-derive needs_details based on the merged lot + expiry + category —
  // load whatever we didn't touch so the derivation is correct. Category
  // matters because equipment items short-circuit to needs_details=false
  // regardless of lot/expiry.
  const { data: prev } = await sb
    .from('reagent_inventory')
    .select('current_lot_number, expiry_date, category')
    .eq('id', req.params.id)
    .eq('user_id', req.userId!)
    .maybeSingle();
  const nextLot =
    parsed.data.current_lot_number !== undefined
      ? parsed.data.current_lot_number
      : (prev?.current_lot_number ?? null);
  const nextExp =
    parsed.data.expiry_date !== undefined
      ? parsed.data.expiry_date
      : (prev?.expiry_date ?? null);
  update.needs_details = computeNeedsDetails(nextLot, nextExp, prev?.category);

  const { data, error } = await sb
    .from('reagent_inventory')
    .update(update)
    .eq('id', req.params.id)
    .eq('user_id', req.userId!)
    .select()
    .single();
  if (error) return sendError(res, 500, error);
  if (!data) return res.status(404).json({ error: 'Not found' });
  return res.json(enrich(data as ReagentRow));
});

// ---------------------------------------------------------------------------
// DELETE /api/reagents/:id
// ---------------------------------------------------------------------------

reagentsRouter.delete('/:id', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  // Count active checklist links before deleting — surface a 409 so the UI can
  // explain why the delete failed instead of silently nulling FKs.
  const { data: links, error: linkErr } = await sb
    .from('protocol_checklist_items')
    .select('protocol_id', { count: 'exact' })
    .eq('reagent_id', req.params.id)
    .eq('user_id', req.userId!);
  if (linkErr) return sendError(res, 500, linkErr);
  const protocolCount = new Set((links ?? []).map((l) => l.protocol_id)).size;
  if (protocolCount > 0) {
    return res.status(409).json({
      error: 'Reagent is used in protocols',
      protocol_count: protocolCount,
    });
  }
  const { error } = await sb
    .from('reagent_inventory')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId!);
  if (error) return sendError(res, 500, error);
  return res.status(204).send();
});

// ---------------------------------------------------------------------------
// POST /api/protocols/:id/detect-reagents — scan checklist items and
// auto-create reagent_inventory entries for material categories the user
// doesn't already have for this protocol. Idempotent — re-running just
// reports `existing` for already-present rows.
// ---------------------------------------------------------------------------

/** Maps the broader checklist category enum to the reagent category enum.
 *  'safety' items aren't tracked as reagents — they collapse to 'other'. */
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

/**
 * Exported so index.ts can mount it under /api/protocols/:id/detect-reagents
 * (the spec's chosen path). Kept here next to the rest of the reagent code so
 * the detection logic, category mapping, and reagent_inventory schema stay
 * co-located.
 */
export async function detectProtocolReagents(
  req: import('express').Request,
  res: import('express').Response,
) {
  const sb = supabaseForUser(req.accessToken!);
  const userId = req.userId!;
  const protocolId = String(req.params.id);

  // Verify the user owns the protocol — RLS would already block reads on
  // someone else's, but we want a clean 404 not a silent zero-rows response.
  const { data: proto, error: pErr } = await sb
    .from('protocols')
    .select('id')
    .eq('id', protocolId)
    .eq('user_id', userId)
    .maybeSingle();
  if (pErr) return sendError(res, 500, pErr);
  if (!proto) return res.status(404).json({ error: 'Protocol not found' });

  const { data: items, error: iErr } = await sb
    .from('protocol_checklist_items')
    .select('item_text, category, reagent_id')
    .eq('protocol_id', protocolId)
    .eq('user_id', userId);
  if (iErr) return sendError(res, 500, iErr);

  // Existing reagents for this protocol — used to skip duplicates by name
  // (case-insensitive comparison). The unique key is (user, protocol, name).
  const { data: existingRows, error: eErr } = await sb
    .from('reagent_inventory')
    .select('name')
    .eq('user_id', userId)
    .eq('protocol_id', protocolId);
  if (eErr) return sendError(res, 500, eErr);
  const existingNames = new Set(
    (existingRows ?? []).map((r) => r.name.trim().toLowerCase()),
  );

  let created = 0;
  let existing = 0;
  for (const item of items ?? []) {
    const name = item.item_text?.trim();
    if (!name) continue;
    // Safety items are pre-run checks — they aren't physical materials and
    // shouldn't pollute the reagent library.
    if (item.category === 'safety') continue;
    // Already linked to a library reagent (e.g. a shared reagent from a split
    // import) — it shows on this protocol's Materials tab, so don't create a
    // per-protocol duplicate.
    if (item.reagent_id || existingNames.has(name.toLowerCase())) {
      existing++;
      continue;
    }
    const reagentCategory = mapChecklistToReagentCategory(item.category ?? 'other');
    const { error: insErr } = await sb.from('reagent_inventory').insert({
      user_id: userId,
      protocol_id: protocolId,
      name: sanitiseText(name),
      category: reagentCategory,
      source: 'checklist',
      // Equipment items don't expire and don't have lot numbers in the
      // same way reagents do; create them already complete so the user
      // isn't nagged to fill in fields that don't apply.
      needs_details: computeNeedsDetails(null, null, reagentCategory),
      status: 'active',
    });
    if (insErr) {
      // Don't fail the whole batch — log and keep going so the user still
      // gets the partial result.
      console.error('[detect-reagents] insert failed', insErr);
      continue;
    }
    existingNames.add(name.toLowerCase());
    created++;
  }
  return res.json({ created, existing });
}

