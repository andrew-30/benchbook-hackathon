import { supabaseAdmin } from './supabase.js';

/**
 * Claude cost accounting. Every AI call logs its token usage + an estimated USD
 * cost to `ai_usage` (migration 017) so per-user and global spend are visible —
 * the foundation for quotas, a global kill-switch, and alerting later.
 *
 * Pricing is per 1M tokens (Anthropic first-party rates). Cache reads bill at
 * ~0.1× the input rate and cache writes at ~1.25×. Keep this map in sync with
 * whatever `ANTHROPIC_MODEL` is set to.
 */
const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
};

interface UsageParts {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** Estimated USD cost for one call, given the response `usage` block. */
export function estimateCostUsd(model: string, u: UsageParts): number {
  const p = PRICING_PER_MTOK[model] ?? { input: 3, output: 15 };
  const input = u.input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const output = u.output_tokens ?? 0;
  const usd =
    (input * p.input +
      cacheRead * p.input * 0.1 +
      cacheWrite * p.input * 1.25 +
      output * p.output) /
    1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/**
 * Persist one AI call's usage. Fire-and-forget by design: logging must never
 * slow down or break the request, so we don't await it and swallow errors.
 * Pass `cacheHit: true` (and no `usage`) when the call was served from the
 * content-hash cache — a $0 row that still records the demand.
 */
export function logAiUsage(params: {
  userId: string | null | undefined;
  endpoint: string;
  model: string;
  usage?: UsageParts | null;
  cacheHit?: boolean;
}): void {
  const u = params.usage ?? {};
  const row = {
    user_id: params.userId ?? null,
    endpoint: params.endpoint,
    model: params.model,
    input_tokens: u.input_tokens ?? 0,
    cache_read_tokens: u.cache_read_input_tokens ?? 0,
    cache_creation_tokens: u.cache_creation_input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    est_cost_usd: estimateCostUsd(params.model, u),
    cache_hit: params.cacheHit ?? false,
  };
  void supabaseAdmin
    .from('ai_usage')
    .insert(row)
    .then(
      ({ error }) => {
        if (error) console.warn('[ai_usage] log failed:', error.message);
      },
      (err) => console.warn('[ai_usage] log threw:', err),
    );
}
