import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to apply the production database migrations before building.')
}

const sql = neon(databaseUrl)
const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const migrationFiles = (await readdir(migrationsDir))
  .filter((file) => file.endsWith('.sql'))
  .sort()

await sql.query(`
  CREATE TABLE IF NOT EXISTS public.school_pulse_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`)

for (const name of migrationFiles) {
  const applied = await sql.query(
    'SELECT 1 FROM public.school_pulse_migrations WHERE name = $1 LIMIT 1',
    [name],
  )
  if (applied.length > 0) continue

  const contents = await readFile(path.join(migrationsDir, name), 'utf8')
  const statements = contents.split(';').map((statement) => statement.trim()).filter(Boolean)
  for (const statement of statements) {
    await sql.query(statement)
  }
  await sql.query(
    'INSERT INTO public.school_pulse_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
    [name],
  )
  console.log(`Applied database migration: ${name}`)
}
