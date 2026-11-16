import 'server-only'
import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Add the Supabase pooler connection string to .env.')
}

// The pooler URL may carry options meant for other Postgres clients; strip the
// ones postgres.js does not understand before connecting.
const cleanedUrl = (() => {
  try {
    const url = new URL(connectionString)
    url.searchParams.delete('uselibpqcompat')
    return url.toString()
  } catch {
    return connectionString
  }
})()

declare global {
  // eslint-disable-next-line no-var
  var __operationsSql: postgres.Sql | undefined
}

const client =
  globalThis.__operationsSql ??
  postgres(cleanedUrl, {
    // The Supabase session pooler reuses server processes; prepared statement
    // caching across pooled connections can fail, so keep statements unprepared.
    prepare: false,
    max: 10,
  })

globalThis.__operationsSql = client

/**
 * Shared server-side Postgres client for the Supabase `public` schema.
 * Use inside server components and route handlers only.
 */
export const sql = client

export type DbRow = Record<string, unknown>
