import { cookies } from 'next/headers'
import { createSupabaseAuthClient } from '@/lib/supabase'

export async function POST() {
  const cookieStore = await cookies()
  const supabase = createSupabaseAuthClient({
    getAll: () => cookieStore.getAll(),
    setAll: (sessionCookies) => {
      sessionCookies.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
    },
  })

  // Revokes the Supabase session and clears the auth cookies.
  await supabase.auth.signOut()
  return Response.json({ ok: true })
}
