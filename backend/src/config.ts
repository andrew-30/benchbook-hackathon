import { config as loadEnv } from 'dotenv';
// In production we trust whatever the platform injected — overriding would
// clobber values Railway/Vercel set. In dev we let .env override the parent
// shell so stale exports don't poison configuration.
const isProd = (process.env.NODE_ENV ?? 'development') === 'production';
loadEnv({ override: !isProd });

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    // Crash with a clear, single-line message — easier to spot in Railway logs
    // than a stack trace from deep inside Supabase or Anthropic.
    throw new Error(
      `[benchbook-backend] Missing required env var: ${name}. Set it in your hosting provider's environment configuration.`,
    );
  }
  return v;
}

// Railway, Heroku, Cloud Run and most container platforms inject `PORT` into
// the environment. Honour it exactly — overriding with our own port is the
// #1 cause of "Application failed to respond" routing failures, where the
// container's healthcheck passes (because Railway probes from inside) but the
// edge router can't reach the listening socket.
const rawPort = process.env.PORT;
const parsedPort = rawPort ? parseInt(rawPort, 10) : NaN;
const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;

export const config = {
  port: PORT,
  portSource: rawPort ? 'env' : 'default',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  supabase: {
    url: required('SUPABASE_URL'),
    publishableKey: required('SUPABASE_PUBLISHABLE_KEY'),
    secretKey: required('SUPABASE_SECRET_KEY'),
    dbPassword: process.env.SUPABASE_DB_PASSWORD ?? '',
  },
  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
    // Sonnet 5 is the default: it supports structured outputs (constrained
    // decoding) which the import extraction relies on, and its cache floor is
    // 1024 tokens. Override with ANTHROPIC_MODEL. NOTE: pinning this to an
    // older model (e.g. claude-sonnet-4-6) transparently disables structured
    // outputs on import — see supportsStructuredOutputs() in routes/import.ts.
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
  },
  // Transactional email via Resend (feedback form). All optional — the
  // feedback route returns a clean 503 when RESEND_API_KEY is unset rather than
  // crashing the app at boot. `from` must be on a Resend-verified domain
  // (benchbook.app is verified); `to` is where feedback lands.
  resend: {
    apiKey: process.env.RESEND_API_KEY ?? '',
    feedbackTo: process.env.FEEDBACK_TO ?? 'support@benchbook.app',
    feedbackFrom: process.env.FEEDBACK_FROM ?? 'Benchbook Feedback <feedback@benchbook.app>',
  },
  // Optional. Sentry only initialises when this is set AND NODE_ENV is
  // 'production' — see instrument.ts.
  sentryDsn: process.env.SENTRY_DSN ?? '',
};
