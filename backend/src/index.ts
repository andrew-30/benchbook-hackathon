// Sentry must be imported FIRST so its OpenTelemetry instrumentation wraps
// http/express/pg before any of those modules load. The Sentry.init() call
// lives in instrument.ts; this side-effect import runs it.
import './instrument.js';
import * as Sentry from '@sentry/node';

// Type-only imports — erased at runtime, used by the error middleware below.
import type { NextFunction, Request, Response } from 'express';

// First thing on the boot path — a heartbeat so we can tell from the logs that
// the process started at all, separately from any module-load failures below.
console.log('[startup] benchbook-backend booting…', {
  node: process.version,
  env: process.env.NODE_ENV ?? 'development',
  PORT_env: process.env.PORT ?? '(not set, will default to 3000)',
});

// Catch crashes that happen during the async import chain below so they land
// in the logs instead of a silent container exit.
process.on('uncaughtException', (err) => {
  console.error('[startup] uncaught exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('[startup] unhandled rejection:', err);
});

// We use sequential dynamic imports so a crash inside a single module surfaces
// with a clean `[startup] importing X…` breadcrumb pointing at the culprit.
// Static `import` would hoist everything and the trace alone wouldn't tell us
// which module failed first.

console.log('[startup] importing express + middleware…');
const { default: express } = await import('express');
const { default: cors } = await import('cors');
const { default: helmet } = await import('helmet');
const { default: rateLimit } = await import('express-rate-limit');
const { PgRateLimitStore } = await import('./lib/pgRateLimitStore.js');

console.log('[startup] loading config…');
const { config } = await import('./config.js');
console.log('[startup] config loaded', {
  nodeEnv: config.nodeEnv,
  port: config.port,
  portSource: config.portSource,
  hasFrontendUrl: !!config.frontendUrl,
});

console.log('[startup] importing routes…');
const { healthRouter } = await import('./routes/health.js');
const { usersRouter } = await import('./routes/users.js');
const { dashboardRouter } = await import('./routes/dashboard.js');
const { protocolsRouter } = await import('./routes/protocols.js');
const { importRouter } = await import('./routes/import.js');
const { stepsRouter } = await import('./routes/steps.js');
const { checklistRouter } = await import('./routes/checklist.js');
const { runsRouter } = await import('./routes/runs.js');
const { stepRunsRouter } = await import('./routes/stepRuns.js');
const { statisticsRouter } = await import('./routes/statistics.js');
const { sharedRouter } = await import('./routes/shared.js');
const { reagentsRouter, detectProtocolReagents } = await import('./routes/reagents.js');
const { feedbackRouter } = await import('./routes/feedback.js');
const { requireAuth } = await import('./middleware/auth.js');
console.log('[startup] all routes loaded');

const app = express();

// Trust the platform's reverse proxy (Railway / Render / Fly) so that
// req.ip and `req.secure` resolve correctly behind the load balancer. This is
// also required for express-rate-limit's IP-based keying to work right behind
// a proxy — otherwise every request looks like it came from the LB's IP.
app.set('trust proxy', 1);

// Strip Express's own X-Powered-By fingerprint. Helmet also handles this, but
// belt-and-braces in case the helmet config changes later.
app.disable('x-powered-by');

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

// Helmet, tuned. The CSP allows Supabase + Anthropic since the frontend (when
// served from the same origin) and the backend both call them. The hardcoded
// project URL is fine — Supabase project URLs are public by design (they're
// embedded in the built frontend bundle) — and the wildcard catches any
// future project rename.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: [
          "'self'",
          'https://uaqcysigukgjzzjajcpw.supabase.co',
          'https://*.supabase.co',
          'https://api.anthropic.com',
        ],
        fontSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    // The API serves JSON to the Vercel-hosted frontend on a different origin,
    // so cross-origin embedding must be allowed for resources but blocked for
    // documents. CORP=cross-origin handles that.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    xssFilter: true,
    hidePoweredBy: true,
  }),
);

// Headers helmet doesn't set by default.
app.use((_req, res, next) => {
  // Hard-DENY framing — we render no embed-friendly UI.
  res.setHeader('X-Frame-Options', 'DENY');
  // Re-assert nosniff alongside helmet's noSniff so a future helmet config
  // change can't silently drop it.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Lock down browser features the backend has no business asking for.
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  next();
});

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

// CORS — explicitly compare against an allowlist in production so a stray env
// value doesn't accidentally open the API up to the world. In development we
// trust whatever CORS_ORIGIN is set to (typically http://localhost:5173).
const isProd = config.nodeEnv === 'production';
// CORS_ORIGIN and FRONTEND_URL may EACH be a comma-separated list, so one
// backend can serve several front-ends (prod apex + www + staging) — the app
// migrated off Railway to a single Vercel backend that all of them call.
const allowedOrigins = new Set(
  [config.corsOrigin, config.frontendUrl]
    .flatMap((v) => (v ? v.split(',') : []))
    .map((s) => s.trim())
    .filter(Boolean),
);
app.use(
  cors({
    origin(origin, cb) {
      // No origin = same-origin / curl / server-to-server. Allow.
      if (!origin) return cb(null, true);
      if (!isProd) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      return cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  }),
);

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------

// 10MB only for the AI import endpoint, which receives docx/pdf files inside
// multipart payloads (multer handles the file itself, but the surrounding
// form body still flows through express.json equivalents for some clients).
// Everything else is locked to a strict 1MB ceiling.
app.use('/api/import', express.json({ limit: '10mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ---------------------------------------------------------------------------
// Request timeouts
// ---------------------------------------------------------------------------

// Per-route timeouts. AI calls and PDF rendering both routinely exceed the
// default 30s; we extend just those paths instead of bumping the global
// ceiling. The per-path mounts further down in the rate-limiter block re-call
// res.setTimeout() — the last call wins, so any path that needs more than 30s
// gets explicitly bumped after this default middleware runs.
function withTimeout(ms: number) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setTimeout(ms, () => {
      if (!res.headersSent) {
        res.status(408).json({ error: 'Request timeout' });
      }
    });
    next();
  };
}
app.use(withTimeout(30_000));

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------

// General API limiter — 100 requests per 15 min per IP. The /health endpoint
// is excluded so Railway's healthcheck doesn't burn the user's bucket.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PgRateLimitStore('general'),
  message: { error: 'Too many requests. Please slow down.' },
  skip: (req) => req.path === '/health',
});

// The AI rate limiter (aiLimiter in lib/rateLimiters) is intentionally NOT
// applied at the app.use layer — it's keyed on req.userId and must run
// AFTER requireAuth. The two consumers (POST /api/import/ai, POST
// /api/runs/:id/generate-methods) apply it inside their router definitions
// in the correct order: requireAuth → aiLimiter → handler.

// Strict limiter for sensitive mutation endpoints — 10 per 15 min. Used on
// profile POST/PUT only (a GET-only limiter here would break normal navigation
// since useProfile() refetches on every focus + mount).
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PgRateLimitStore('strict'),
  message: { error: 'Too many attempts. Please wait 15 minutes.' },
});

// GDPR data export — 3 per 24 hours. The endpoint reads everything the user
// owns, so it's expensive to run frequently; this cap also discourages
// scraping if a token ever leaks.
const exportLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PgRateLimitStore('export'),
  message: { error: 'Export rate limit exceeded. Try again tomorrow.' },
});

// Apply general limiter to everything under /api. Specific limiters layer on
// top — they're hit FIRST because they're declared with more specific paths.
// /api/import/ai gets a dedicated 240s timeout (vs the generic 60s) AND a
// purpose-built timeout payload that tells the user what to try next. The
// Anthropic client (lib/anthropic.ts) is configured for a 180s per-attempt
// timeout with up to 2 retries; the route ceiling at 240s gives one full
// attempt + headroom for a retry-then-fail to surface as our friendly
// IMPORT_CONNECTION_TIMEOUT 503 (see import.ts) instead of this 408.
// Bumped 180s → 240s when the import call moved from unary to streaming.
app.use(
  '/api/import/ai',
  // aiLimiter applied at the route level (see lib/rateLimiters.ts) so it
  // can key on req.userId. We keep only the per-route timeout here.
  (_req, res, next) => {
    res.setTimeout(240_000, () => {
      if (res.headersSent) return;
      res.status(408).json({
        error:
          "This document is taking longer than expected to process. " +
          "Try one of these: " +
          "1) Use the 'Paste text' option and paste just the procedure " +
          "steps section. " +
          "2) Split the document into smaller sections. " +
          "3) Try again — large documents sometimes succeed on retry.",
        code: 'IMPORT_TIMEOUT',
      });
    });
    next();
  },
);
app.use('/api/runs/:id/generate-methods', withTimeout(45_000));
app.use('/api/users/export', exportLimiter, withTimeout(60_000));

// Statistics + CSV export run unbounded `step_runs IN (...)` scans for the
// selected protocol — at ~500+ runs in one protocol they can approach the
// 30s default. Bump to 60s to give the JS aggregation room before the
// timeout fires. Mounted before the generic /api/ generalLimiter so the
// path-specific match wins.
app.use('/api/protocols/:id/statistics', withTimeout(60_000));
app.use('/api/protocols/:id/export/csv', withTimeout(60_000));

// Profile mutations only — GET stays on the general bucket so refetch-on-focus
// from TanStack Query doesn't lock users out of their own profile.
app.use('/api/users/profile', (req, res, next) => {
  if (req.method === 'GET') return next();
  return strictLimiter(req, res, next);
});

app.use('/api/', generalLimiter);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use(healthRouter);
app.use('/api/users', usersRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/protocols', protocolsRouter);
// Statistics + CSV export sit under /api/protocols/:id/... — mount before
// the catch-all /api 404 below.
app.use('/api/protocols', statisticsRouter);
app.use('/api/import', importRouter);
app.use('/api/runs', runsRouter);
app.use('/api/step-runs', stepRunsRouter);
app.use('/api/reagents', reagentsRouter);
// Mounted on the /api/protocols namespace so the URL reads as
// "POST /api/protocols/:id/detect-reagents" (the spec's preferred path).
// Sits between the protocols/statistics routes and the catch-all 404.
app.post('/api/protocols/:id/detect-reagents', requireAuth, detectProtocolReagents);
// Public, no auth — must be mounted before the catch-all /api 404.
app.use('/api/shared', sharedRouter);
// Public feedback form (rate-limited + honeypot inside the router).
app.use('/api/feedback', feedbackRouter);
// Steps and checklist routers use mixed paths (/protocols/:id/steps, /steps/:id, etc.),
// so they're mounted at /api directly.
app.use('/api', stepsRouter);
app.use('/api', checklistRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---------------------------------------------------------------------------
// Error handlers
//
// Sentry's express error handler MUST come before any other custom error
// middleware so it sees the original exception. It calls next(err) internally,
// so our handler still runs and produces the user-facing JSON response.
// No-op when SENTRY_DSN is unset (init was skipped in instrument.ts).
// ---------------------------------------------------------------------------

Sentry.setupExpressErrorHandler(app);

const { sanitiseError } = await import('./lib/errorHandler.js');

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Belt-and-braces: setupExpressErrorHandler already captured this, but
  // calling captureException again is idempotent for the same error event
  // and ensures coverage if Sentry's middleware ordering ever changes.
  Sentry.captureException(err);

  console.error('[error]', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  });

  // If a downstream handler already set a non-200 status (e.g. 400 from a
  // multer filter, 413 from a body parser), preserve it. Otherwise this is an
  // unhandled crash → 500.
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  // sanitiseError maps known Postgres / Supabase error patterns to a small
  // set of human-readable strings in production, preventing schema /
  // constraint / column names from leaking through the API. In development
  // it passes the raw message through unchanged.
  res.status(statusCode).json({ error: sanitiseError(err, isProd) });
});

// On Vercel (serverless) the platform imports the exported `app` (via
// backend/api/index.ts) and invokes it per request — we must NOT bind a socket
// there. On a long-running host (local dev, Railway/Fly/Render/Cloud Run) we
// listen. Those platforms route to the container's public IP, so bind '0.0.0.0'
// explicitly — loopback would fail their healthcheck.
if (!process.env.VERCEL) {
  const HOST = '0.0.0.0';
  console.log(
    `[startup] binding to ${HOST}:${config.port} (PORT env var = ${process.env.PORT ?? '(unset)'} → ${config.portSource})`,
  );
  const server = app.listen(config.port, HOST, () => {
    console.log(`[startup] ✓ listening on ${HOST}:${config.port} (env=${config.nodeEnv})`);
  });
  server.on('error', (err) => {
    console.error('[startup] failed to bind:', err);
    process.exit(1);
  });
}

// Exported so the Vercel serverless entry (backend/api/index.ts) can use the
// fully-wired Express app as its request handler.
export default app;
