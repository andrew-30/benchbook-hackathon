import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import { PgRateLimitStore } from './pgRateLimitStore.js';

/**
 * AI-endpoint rate limit — 20 calls per hour per AUTHENTICATED USER.
 *
 * Keyed by req.userId when present, falling back to req.ip for the rare
 * unauthenticated paths. Per-user keying matters at institutional scale:
 * a class of 30 students importing protocols from a shared NAT used to
 * collapse to a single 20/hour bucket under the previous per-IP key.
 *
 * Pre-requisite: this limiter must run AFTER requireAuth in the middleware
 * chain (so req.userId is populated). Applying it via app.use BEFORE the
 * router would silently fall back to per-IP keying. The two consumers
 * (POST /api/import/ai, POST /api/runs/:id/generate-methods) apply this
 * limiter inside the router definition, after requireAuth.
 */
export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PgRateLimitStore('ai'),
  // Authenticated callers key on userId. The IP fallback is currently
  // unreachable — aiLimiter is mounted after requireAuth on both consumers —
  // but it goes through ipKeyGenerator so that it stays correct if a public AI
  // route is ever added. A raw IPv6 address is a per-ADDRESS key, and a single
  // customer is typically handed a whole /64, so rotating within it would reset
  // the bucket at will; ipKeyGenerator collapses that to a /56.
  keyGenerator: (req: Request) => {
    const userId = (req as Request & { userId?: string }).userId;
    return userId ?? ipKeyGenerator(req.ip ?? 'unknown');
  },
  message: {
    error: 'AI rate limit exceeded. Try again in an hour.',
    code: 'AI_RATE_LIMIT',
  },
});

/**
 * Feedback-form rate limit — 5 submissions per hour per IP.
 *
 * The feedback endpoint is public (the widget is on public pages too), so it's
 * keyed by IP. Paired with a honeypot + length validation in the route, this
 * keeps the form from being turned into a spam relay. Fails open like all the
 * PgRateLimitStore limiters.
 */
export const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PgRateLimitStore('feedback'),
  // Public endpoint, so the IP IS the key — it must be subnet-normalised or a
  // single IPv6 /64 holder can bypass the 5/hour cap entirely and flood the
  // support inbox (every accepted submission sends an email). See aiLimiter.
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? 'unknown'),
  message: {
    error: 'Too many feedback submissions. Please try again in an hour.',
    code: 'FEEDBACK_RATE_LIMIT',
  },
});
