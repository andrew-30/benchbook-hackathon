import type { NextFunction, Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      accessToken?: string;
      // Whether the authenticated user's email is confirmed. Set by requireAuth
      // from the Supabase user's email_confirmed_at (OAuth + magic-link users
      // are auto-confirmed; only unconfirmed email/password signups are false).
      // Gated on by requireVerifiedEmail for the paid AI endpoints.
      emailVerified?: boolean;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  const token = header.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  req.userId = data.user.id;
  req.accessToken = token;
  req.emailVerified = Boolean(data.user.email_confirmed_at);
  next();
}

/**
 * Gate for the paid AI endpoints: require a confirmed email. Runs AFTER
 * requireAuth (which populates req.emailVerified) and before the rate limiter,
 * so an unverified user can't even consume a rate-limit bucket.
 *
 * Fail-closed by design — this is a verification gate, so an unknown state is
 * treated as unverified. Unconfirmed email/password signups (the only path that
 * can be unverified) are blocked from spending Claude credits until they prove a
 * working inbox; OAuth and magic-link users pass straight through.
 */
export function requireVerifiedEmail(req: Request, res: Response, next: NextFunction) {
  if (req.emailVerified) return next();
  return res.status(403).json({
    error:
      'Please verify your email address to use AI features. ' +
      'Check your inbox for the confirmation link.',
    code: 'EMAIL_UNVERIFIED',
  });
}
