import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

/**
 * Shared Anthropic client.
 *
 * Explicit `maxRetries` and `timeout` rather than the SDK defaults so that
 * retry + timeout behaviour is visible at this layer and consistent across
 * every Claude call we make.
 *
 *   - maxRetries: 2 — automatic retry on the SDK's retriable error set
 *     (network failures, 408, 429, 5xx). Keeps transient "Premature close"
 *     hiccups from surfacing to the user.
 *   - timeout: 180_000ms (3 min) — generous per-attempt ceiling sized for
 *     long streamed imports of large SOPs. Methods generation and other
 *     short calls finish well inside this; the ceiling only kicks in for
 *     stuck connections.
 *
 * Per-call SDK options can still override these (e.g. for short calls that
 * want a tighter ceiling) but no caller does today.
 */
export const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
  maxRetries: 2,
  timeout: 3 * 60 * 1000,
});

export const ANTHROPIC_MODEL = config.anthropic.model;
