// Sentry initialisation MUST run before any other module is imported so that
// the OpenTelemetry instrumentation can wrap http / express / pg / fetch and
// catch requests + spans from the very first one. That's why this file exists
// as a dedicated entry point — `index.ts` imports it as its first statement
// (`import './instrument.js';`), which ESM evaluates before anything else.
//
// Sentry SDK v10 removed the v7-era `Sentry.Handlers.requestHandler` /
// `errorHandler` middleware; request data capture is automatic, and the error
// handler is wired up via `setupExpressErrorHandler(app)` after routes mount.
//
// All Sentry capture is no-op unless SENTRY_DSN is set AND NODE_ENV is
// 'production'. Dev runs never ship telemetry off-box.

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const dsn = process.env.SENTRY_DSN;
const isProd = (process.env.NODE_ENV ?? 'development') === 'production';

if (dsn && isProd) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // 10% of requests get a full trace. Plenty for surfacing slow endpoints
    // without blowing through the free tier's event quota.
    tracesSampleRate: 0.1,
    // Profile the same 10% of sampled transactions.
    profilesSampleRate: 1.0,
    integrations: [nodeProfilingIntegration()],
    // Belt-and-braces — `enabled: false` short-circuits any capture call even
    // if a developer manually calls Sentry.captureException somewhere.
    enabled: true,
  });
  // eslint-disable-next-line no-console
  console.log('[startup] Sentry initialised (production)');
} else {
  // eslint-disable-next-line no-console
  console.log(
    `[startup] Sentry disabled (dsn=${dsn ? 'set' : 'unset'}, NODE_ENV=${
      process.env.NODE_ENV ?? 'development'
    })`,
  );
}
