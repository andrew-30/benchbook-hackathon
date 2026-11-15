import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { sanitiseText } from '../lib/sanitise.js';
import { sendError } from '../lib/errorResponse.js';

export const checklistRouter = Router();

// Same universal material set as reagent inventory, plus 'safety' for
// non-material checklist steps (PPE, fume-hood check, etc.) which don't fit
// a material taxonomy. Migration 004 remaps existing 'reagent' rows to
// 'chemical_reagent'; safety/equipment/other already valid under the new set.
const CATEGORIES = [
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

const ItemCreate = z.object({
  item_text: z.string().min(1).max(300),
  category: z.enum(CATEGORIES).optional(),
  reagent_id: z.string().uuid().nullable().optional(),
  is_critical_reagent: z.boolean().optional(),
});

const ItemUpdate = z.object({
  item_text: z.string().min(1).max(300).optional(),
  category: z.enum(CATEGORIES).optional(),
  item_order: z.number().int().nonnegative().optional(),
  reagent_id: z.string().uuid().nullable().optional(),
  is_critical_reagent: z.boolean().optional(),
});

checklistRouter.get('/protocols/:id/checklist', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const { data, error } = await sb
    .from('protocol_checklist_items')
    .select('*')
    .eq('protocol_id', req.params.id)
    .eq('user_id', req.userId!)
    .order('item_order', { ascending: true });
  if (error) return sendError(res, 500, error);
  return res.json(data ?? []);
});

checklistRouter.post('/protocols/:id/checklist', requireAuth, async (req, res) => {
  const parsed = ItemCreate.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const sb = supabaseForUser(req.accessToken!);
  const protocolId = req.params.id;

  const { data: owns } = await sb
    .from('protocols')
    .select('id')
    .eq('id', protocolId)
    .eq('user_id', req.userId!)
    .maybeSingle();
  if (!owns) return res.status(404).json({ error: 'Protocol not found' });

  const { data: maxRow } = await sb
    .from('protocol_checklist_items')
    .select('item_order')
    .eq('protocol_id', protocolId)
    .order('item_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.item_order ?? 0) + 1;

  const { data, error } = await sb
    .from('protocol_checklist_items')
    .insert({
      user_id: req.userId!,
      protocol_id: protocolId,
      item_order: nextOrder,
      item_text: sanitiseText(parsed.data.item_text),
      category: parsed.data.category ?? 'other',
      reagent_id: parsed.data.reagent_id ?? null,
      is_critical_reagent: parsed.data.is_critical_reagent ?? false,
    })
    .select()
    .single();
  if (error) return sendError(res, 500, error);
  return res.status(201).json(data);
});

checklistRouter.put('/checklist/:id', requireAuth, async (req, res) => {
  const parsed = ItemUpdate.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }
  const sb = supabaseForUser(req.accessToken!);
  const patch: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.item_text !== undefined) {
    patch.item_text = sanitiseText(parsed.data.item_text);
  }
  const { data, error } = await sb
    .from('protocol_checklist_items')
    .update(patch)
    .eq('id', req.params.id)
    .eq('user_id', req.userId!)
    .select()
    .single();
  if (error) return sendError(res, 500, error);
  if (!data) return res.status(404).json({ error: 'Not found' });
  return res.json(data);
});

checklistRouter.delete('/checklist/:id', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const { data, error } = await sb
    .from('protocol_checklist_items')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.userId!)
    .select()
    .maybeSingle();
  if (error) return sendError(res, 500, error);
  if (!data) return res.status(404).json({ error: 'Not found' });
  return res.json({ ok: true });
});
