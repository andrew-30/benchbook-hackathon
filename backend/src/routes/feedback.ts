import { Router, type Request, type Response } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { feedbackLimiter } from '../lib/rateLimiters.js';
import { sendFeedbackEmail } from '../lib/feedbackEmail.js';

export const feedbackRouter = Router();

const MIN_MESSAGE = 10;
const MAX_MESSAGE = 4000;
const MAX_FIELD = 200;
const MAX_PAGE = 500;

const EMAILISH = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/feedback — public feedback form.
 *
 * Intentionally NOT behind requireAuth (the widget renders on public pages
 * too), but hardened as a public write endpoint:
 *   - feedbackLimiter: 5/hour/IP (Postgres-backed, fails open)
 *   - honeypot: a hidden `company` field bots fill → silently accepted, no send
 *   - length + shape validation on every field
 *   - soft auth: if a valid bearer token is attached we record the signed-in
 *     identity, but never require it
 */
feedbackRouter.post('/', feedbackLimiter, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  // Honeypot — real users never see or fill `company`. Pretend success so a bot
  // gets no signal, but send nothing.
  const honeypot = typeof body.company === 'string' ? body.company.trim() : '';
  if (honeypot) return res.status(200).json({ ok: true });

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length < MIN_MESSAGE || message.length > MAX_MESSAGE) {
    return res.status(400).json({
      error: `Please write between ${MIN_MESSAGE} and ${MAX_MESSAGE} characters.`,
      code: 'FEEDBACK_INVALID',
    });
  }

  const emailRaw = typeof body.email === 'string' ? body.email.trim().slice(0, MAX_FIELD) : '';
  const email = emailRaw && EMAILISH.test(emailRaw) ? emailRaw : null;
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, MAX_FIELD) || null : null;
  const page = typeof body.page === 'string' ? body.page.trim().slice(0, MAX_PAGE) || null : null;

  // Soft auth — attach the signed-in identity if a valid token is present, but
  // never require it. Best-effort: a bad/absent token just means "anonymous".
  let accountId: string | null = null;
  let accountEmail: string | null = null;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const { data } = await supabaseAdmin.auth.getUser(header.slice(7));
      if (data.user) {
        accountId = data.user.id;
        accountEmail = data.user.email ?? null;
      }
    } catch {
      /* best-effort identity — ignore */
    }
  }

  const result = await sendFeedbackEmail({
    message,
    // Prefer the form email; fall back to the verified account email so the
    // team always has a way to reply when the sender is signed in.
    email: email ?? accountEmail,
    name,
    page,
    accountId,
    accountEmail,
    userAgent: (req.headers['user-agent'] as string | undefined) ?? null,
    submittedAt: new Date().toISOString(),
  });

  if (!result.ok) {
    return res.status(result.status).json({ error: result.error, code: 'FEEDBACK_SEND_FAILED' });
  }
  return res.status(200).json({ ok: true });
});
