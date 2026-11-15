// Read-only migration status check.
//
// `npm run migrate` APPLIES migrations; this only reports. Use it to answer
// "is prod actually up to date?" without touching anything — it runs a single
// SELECT and never creates, writes or alters. Worth checking before trusting
// any behaviour that a migration gates, e.g.:
//   016_rate_limits   — unapplied ⇒ the rate limiter fails open (no limiting)
//   018_ai_controls   — unapplied ⇒ no app_flags row ⇒ AI kill-switch is a no-op
//
// Connection strategy mirrors scripts/migrate.ts: try the direct host, then
// each regional pooler, and use the first that answers.
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config as loadEnv } from 'dotenv';

loadEnv({ override: true });

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations');

function buildConnectionStrings() {
  const url = process.env.SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!url || !password) {
    throw new Error('SUPABASE_URL and SUPABASE_DB_PASSWORD must be set');
  }
  const ref = new URL(url).hostname.split('.')[0];
  const pw = encodeURIComponent(password);
  const regions = ['eu-west-1', 'eu-central-1', 'us-east-1', 'us-west-1', 'eu-west-2', 'ap-southeast-1'];
  return [
    `postgresql://postgres:${pw}@db.${ref}.supabase.co:5432/postgres`,
    ...regions.map(
      (r) => `postgresql://postgres.${ref}:${pw}@aws-0-${r}.pooler.supabase.com:5432/postgres`,
    ),
  ];
}

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

let client = null;
for (const conn of buildConnectionStrings()) {
  try {
    const c = new Client({ connectionString: conn, connectionTimeoutMillis: 5000 });
    await c.connect();
    client = c;
    console.log(`connected via ${conn.replace(/:[^:@]+@/, ':***@').replace(/\/\/[^@]+@/, '//***@')}\n`);
    break;
  } catch {
    /* try the next candidate */
  }
}
if (!client) throw new Error('Could not connect to the database with any candidate host.');

try {
  const exists = await client.query(
    `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present`,
  );
  if (!exists.rows[0]?.present) {
    console.log('schema_migrations does not exist — no migrations have ever been applied here.');
    for (const f of files) console.log(`  PENDING  ${f}`);
    process.exit(0);
  }

  const { rows } = await client.query(
    'SELECT filename, applied_at FROM schema_migrations ORDER BY filename',
  );
  const appliedAt = new Map(rows.map((r) => [r.filename, r.applied_at]));

  let pending = 0;
  for (const f of files) {
    if (appliedAt.has(f)) {
      console.log(`  applied  ${f}  (${new Date(appliedAt.get(f)).toISOString().slice(0, 10)})`);
    } else {
      pending++;
      console.log(`  PENDING  ${f}`);
    }
  }

  // Rows present in the table but with no matching file — a migration that was
  // renamed or deleted after being applied. Worth surfacing, never fatal.
  const orphans = [...appliedAt.keys()].filter((f) => !files.includes(f));
  if (orphans.length) {
    console.log(`\nRecorded but no longer on disk: ${orphans.join(', ')}`);
  }

  console.log(`\n${files.length - pending}/${files.length} applied, ${pending} pending.`);
} finally {
  await client.end();
}
