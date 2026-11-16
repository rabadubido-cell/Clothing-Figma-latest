import { cookies } from 'next/headers'
import { sql } from '@/lib/db'
import { createSupabaseAuthClient } from '@/lib/supabase'
import { roleToStaffRole } from '@/backend/access/staff'

export async function POST(request: Request) {
  const input = (await request.json().catch(() => null)) as {
    email?: string
    password?: string
  } | null
  if (!input?.email || !input.password) {
    return Response.json({ error: 'Enter your email and password.' }, { status: 400 })
  }

  const email = input.email.trim().toLowerCase()

  try {
    const cookieStore = await cookies()
    const supabase = createSupabaseAuthClient({
      getAll: () => cookieStore.getAll(),
      setAll: (cookies) => {
        cookies.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        )
      },
    })

    const { error } = await supabase.auth.signInWithPassword({ email, password: input.password })
    if (error) {
      return Response.json({ error: 'Email or password is incorrect.' }, { status: 401 })
    }

    const rows = await sql<{ status: string; role: string }[]>`
      select status, role
      from public.users
      where lower(email) = ${email}
      limit 1
    `
    const staff = rows[0]
    if (!staff || staff.status !== 'Active' || !roleToStaffRole[staff.role]) {
      await supabase.auth.signOut()
      return Response.json({ error: 'This account is not active.' }, { status: 403 })
    }

    return Response.json({ ok: true })
  } catch {
    return Response.json(
      { error: 'Unable to sign in right now. Try again shortly.' },
      { status: 500 },
    )
  }
}
