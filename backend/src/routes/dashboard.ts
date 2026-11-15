import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { supabaseForUser } from '../lib/supabase.js';
import { sendError } from '../lib/errorResponse.js';

export const dashboardRouter = Router();

dashboardRouter.get('/', requireAuth, async (req, res) => {
  const sb = supabaseForUser(req.accessToken!);
  const userId = req.userId!;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const [protocolsCount, totalRuns, monthRuns, recentRuns] = await Promise.all([
    sb.from('protocols').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    sb.from('runs').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    sb
      .from('runs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', monthStart),
    sb
      .from('runs')
      .select('id, protocol_id, protocol_name, run_state, run_started_at, run_ended_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const firstError =
    protocolsCount.error || totalRuns.error || monthRuns.error || recentRuns.error;
  if (firstError) {
    return sendError(res, 500, firstError);
  }

  return res.json({
    protocols_count: protocolsCount.count ?? 0,
    runs_this_month: monthRuns.count ?? 0,
    total_runs: totalRuns.count ?? 0,
    recent_runs: recentRuns.data ?? [],
  });
});
