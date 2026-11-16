import 'server-only'
import { cookies } from 'next/headers'
import { sql } from '@/lib/db'
import { createSupabaseAuthClient } from '@/lib/supabase'
import { roleToStaffRole, type AppUser } from '@/backend/access/staff'

/**
 * Resolve the signed-in app user.
 *
 * Supabase Auth owns the credential (auth.users); the middleware keeps the
 * session cookies fresh. This maps the authenticated identity to its
 * `public.users` staff record via auth_id and returns null when the account
 * is missing, inactive, or has no recognizable role.
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  const cookieStore = await cookies()
  const supabase = createSupabaseAuthClient({
    getAll: () => cookieStore.getAll(),
    // Server components cannot mutate cookies; the middleware owns refreshes.
    setAll: () => {},
  })

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) return null

  const rows = await sql<{ user_id: string; name: string; email: string; role: string }[]>`
    select user_id, name, email, role
    from public.users
    where auth_id = ${authUser.id} and status = 'Active'
    limit 1
  `

  const staff = rows[0]
  if (!staff) return null

  const role = roleToStaffRole[staff.role]
  if (!role) return null

  return {
    id: String(staff.user_id),
    authId: authUser.id,
    name: staff.name,
    email: staff.email,
    role,
    status: 'active',
  }
}
