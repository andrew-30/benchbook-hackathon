import type { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from './supabase.js';

/**
 * AI cost fence — the two enforcement layers added in workstream #5, sitting on
 * top of the per-user rate limiter (aiLimiter, 016):
 *
 *   1. Global kill-switch — one app_flags row (key='ai', migration 018) gates
 *      every AI endpoint. Flip it in the Supabase dashboard and AI stops within
 *      seconds, no redeploy.
 *   2. Per-user daily quota — at most DAILY_AI_QUOTA real Claude calls per user
 *      per rolling 24h, counted from ai_usage (017). Where the rate limiter caps
 *      velocity (bursts), this caps volume (slow drain).
 *
 * BOTH fail OPEN: if Supabase is unreachable or a table/row is missing, we allow
 * the call. A monitoring blip must never take AI down for real users — the same
 * philosophy as pgRateLimitStore.
 */

// --- Global kill-switch ----------------------------------------------------
// Checked per request but cached in-process so we don't add a round-trip to
// every call. A flip propagates in ≤ KILL_SWITCH_TTL_MS per warm instance.
const KILL_SWITCH_TTL_MS = 5_000;
let flagCache: { enabled: boolean; message: string | null; expires: number } | null = null;

async function readAiFlag(): Promise<{ enabled: boolean; message: string | null }> {
  const now = Date.now();
  if (flagCache && now < flagCache.expires) {
    return { enabled: flagCache.enabled, message: flagCache.message };
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('app_flags')
      .select('enabled, message')
      .eq('key', 'ai')
      .maybeSingle();
    // Missing row or query error → fail open (enabled).
    const enabled = error || !data ? true : Boolean(data.enabled);
    const message = (data?.message as string | null) ?? null;
    flagCache = { enabled, message, expires: now + KILL_SWITCH_TTL_MS };
    return { enabled, message };
  } catch {
    flagCache = { enabled: true, message: null, expires: now + KILL_SWITCH_TTL_MS };
    return { enabled: true, message: null };
  }
}

// --- Per-user daily quota --------------------------------------------------
// Rolling 24h (not calendar-day) to avoid a midnight reset stampede. Cache
// hits are excluded — a $0 dedup hit shouldn't consume the user's budget.
/**
 * Real Claude calls per user per rolling 24h.
 *
 * Lowered 50 -> 10 (2026-10-13) because the app is free and every call is spend
 * we absorb. Sized from measured behaviour, not caution: across all usage to
 * date the busiest any single user has been in one day is 4 calls, and lifetime
 * spend across every user is ~$1. 10 is 2.5x the heaviest real day.
 *
 * What it bounds: a single import at the input caps (40k chars in, 32k output
 * tokens) costs at most ~$0.34, so 10/day caps one user at ~$3.40/day instead
 * of ~$17/day. Cache hits don't count, so re-importing the same document is
 * free and doesn't consume the budget.
 *
 * Raise it if a real researcher ever hits it — the 429 carries AI_DAILY_QUOTA
 * so it's visible in logs.
 */
const DAILY_AI_QUOTA = 10;

async function callsInLastDay(userId: string): Promise<number | null> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error } = await supabaseAdmin
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('cache_hit', false)
      .gte('created_at', since);
    if (error) return null; // fail open
    return count ?? 0;
  } catch {
    return null; // fail open
  }
}

/**
 * Combined AI cost guard. Apply AFTER requireAuth (needs req.userId) and BEFORE
 * any body/file parsing (multer) so a paused or over-quota request is rejected
 * without buffering the upload.
 *
 * Responses:
 *   503 AI_DISABLED     — global kill-switch is off
 *   429 AI_DAILY_QUOTA  — user hit DAILY_AI_QUOTA real calls in the last 24h
 */
export async function aiCostGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const flag = await readAiFlag();
  if (!flag.enabled) {
    res.status(503).json({
      error: flag.message ?? 'AI features are temporarily paused. Please try again shortly.',
      code: 'AI_DISABLED',
    });
    return;
  }

  const userId = (req as Request & { userId?: string }).userId;
  if (userId) {
    const used = await callsInLastDay(userId);
    if (used !== null && used >= DAILY_AI_QUOTA) {
      res.status(429).json({
        error:
          `Daily AI limit reached (${DAILY_AI_QUOTA} actions per day). ` +
          `This resets on a rolling 24-hour basis — please try again later.`,
        code: 'AI_DAILY_QUOTA',
      });
      return;
    }
  }

  next();
}
