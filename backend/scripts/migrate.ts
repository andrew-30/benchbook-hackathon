import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config as loadEnv } from 'dotenv';
loadEnv({ override: true });

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'supabase', 'migrations');

function buildConnectionStrings(): string[] {
  const url = process.env.SUPABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!url || !password) {
    throw new Error('SUPABASE_URL and SUPABASE_DB_PASSWORD must be set');
  }
  const ref = new URL(url).hostname.split('.')[0];
  const pw = encodeURIComponent(password);
  const regions = ['eu-west-1', 'eu-central-1', 'us-east-1', 'us-west-1', 'eu-west-2', 'ap-southeast-1'];
  const pooled = regions.map(
    (r) => `postgresql://postgres.${ref}:${pw}@aws-0-${r}.pooler.supabase.com:5432/postgres`,
  );
  const direct = `postgresql://postgres:${pw}@db.${ref}.supabase.co:5432/postgres`;
  return [direct, ...pooled];
}

async function ensureMigrationsTable(client: pg.Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedSet(client: pg.Client): Promise<Set<string>> {
  const r = await client.query<{ filename: string }>('SELECT filename FROM schema_migrations');
  return new Set(r.rows.map((row) => row.filename));
}

async function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migrations found.');
    return;
  }

  const candidates = buildConnectionStrings();
  let client: pg.Client | null = null;
  for (const conn of candidates) {
    const masked = conn.replace(/:[^:@]+@/, ':***@');
    try {
      const c = new Client({ connectionString: conn, connectionTimeoutMillis: 5000 });
      await c.connect();
      console.log(`Connected via ${masked}`);
      client = c;
      break;
    } catch (err) {
      console.log(`  skip ${masked}: ${(err as Error).message}`);
    }
  }
  if (!client) throw new Error('Could not connect to Supabase Postgres on any candidate endpoint.');

  try {
    await ensureMigrationsTable(client);
    const applied = await appliedSet(client);

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`✓ ${file} (already applied)`);
        continue;
      }
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`→ ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        appliedCount++;
        console.log(`  done`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
    console.log(`Applied ${appliedCount} new migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
