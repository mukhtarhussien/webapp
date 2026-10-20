import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL

export const db = connectionString ? drizzle(neon(connectionString), { schema }) : null

export function requireDb() {
  if (!db) throw new Error('DATABASE_URL is not configured. Add your Neon connection string to .env.local.')
  return db
}
