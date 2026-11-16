import 'server-only'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY

function requireSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set in .env for Supabase Auth.',
    )
  }
  return { url: SUPABASE_URL, key: SUPABASE_KEY }
}

type CookiesAdapter = {
  getAll: () => { name: string; value: string }[]
  setAll: (cookies: { name: string; value: string; options?: CookieOptions }[]) => void
}

/**
 * Supabase client bound to the request cookies so Supabase Auth session
 * tokens are stored in httpOnly cookies and refreshed by the middleware.
 */
export function createSupabaseAuthClient(cookies: CookiesAdapter) {
  const { url, key } = requireSupabaseConfig()
  return createServerClient(url, key, { cookies })
}

/**
 * Stateless Supabase client (no cookie persistence) for route handlers that
 * manage auth manually, e.g. issuing or revoking a session.
 */
export function createSupabaseAuthStatelessClient() {
  const { url, key } = requireSupabaseConfig()
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * Supabase client with the service-role key. Server-only — used by
 * administrator actions that must create or remove Supabase Auth accounts
 * (e.g. staff account management on the Users page).
 */
export function createSupabaseAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !serviceKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY must be set in .env to manage staff accounts. Add it from your Supabase project settings (API keys).',
    )
  }
  return createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
