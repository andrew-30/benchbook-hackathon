/**
 * Map an unknown error into a client-safe string.
 *
 * In development we return the raw message so the developer sees exactly
 * what went wrong. In production we map known Postgres / Supabase error
 * patterns to a small set of human-readable strings and collapse everything
 * else to a single generic message — preventing schema, column, constraint
 * and policy names from leaking through the API.
 *
 * Used by the top-level Express error handler. Per-route handlers that
 * deliberately return 500 with `res.status(500).json({ error: ... })` bypass
 * the global handler and need their own audit pass; see the audit note in
 * commit 5cfbd14.
 */
export function sanitiseError(error: unknown, isProd: boolean): string {
  if (!isProd) {
    return error instanceof Error ? error.message : String(error);
  }

  // App-controlled strings pass through. The leak source is Postgres /
  // Supabase Error objects — anything the developer typed as a literal
  // (fallback messages like 'Could not create protocol', business rules
  // like 'Free plan limit reached') is safe by construction.
  if (typeof error === 'string') return error;

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    // Postgres unique-constraint violation. Includes Supabase's friendlier
    // "duplicate key value violates unique constraint <name>" format.
    if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
      return 'This record already exists';
    }

    // FK violation, check constraint, or "violates row-level security".
    // The 'violates' check is broad enough to catch CHECK constraints,
    // exclusion constraints, and FK failures.
    if (msg.includes('foreign key') || msg.includes('violates')) {
      return 'Cannot complete this action — related data exists';
    }

    // NOT NULL violation — usually means a required field is missing.
    if (msg.includes('null value') || msg.includes('not null')) {
      return 'Required field is missing';
    }

    // RLS denial or explicit permission_denied.
    if (msg.includes('permission denied') || msg.includes('rls')) {
      return 'Access denied';
    }
  }

  return 'An unexpected error occurred';
}
