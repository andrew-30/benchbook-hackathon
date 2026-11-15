// Vercel serverless entry point.
//
// Re-exports the fully-wired Express app from src/index.ts as this function's
// request handler. A catch-all rewrite in backend/vercel.json routes every
// incoming request to this function, and Express does the internal routing.
// `app.listen(...)` in src/index.ts is skipped when process.env.VERCEL is set,
// so importing the module here has no side effect beyond building the app.
export { default } from '../src/index.js';
