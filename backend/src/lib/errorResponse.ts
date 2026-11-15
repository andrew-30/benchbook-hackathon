import type { Response } from 'express';
import { config } from '../config.js';
import { sanitiseError } from './errorHandler.js';

/**
 * Helper for per-route error responses that bypass the global Express error
 * handler (i.e. anywhere we deliberately `res.status(...).json({ error: ... })`
 * instead of throwing).
 *
 * Pipes the error through sanitiseError so Postgres / Supabase error
 * messages get mapped to safe human strings in production. App-controlled
 * strings pass through unchanged — see sanitiseError for the contract.
 *
 * Typical replacements:
 *   res.status(500).json({ error: pgErr.message })           // before
 *   sendError(res, 500, pgErr)                               // after
 *
 *   res.status(500).json({ error: e?.message ?? 'Boom' })    // before
 *   sendError(res, 500, e ?? 'Boom')                         // after
 */
const isProd = config.nodeEnv === 'production';

export function sendError(res: Response, status: number, err: unknown): Response {
  return res.status(status).json({ error: sanitiseError(err, isProd) });
}
