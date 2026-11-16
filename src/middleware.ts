import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseAuthClient } from '@/lib/supabase'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createSupabaseAuthClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookies) => {
      cookies.forEach(({ name, value }) => request.cookies.set(name, value))
      response = NextResponse.next({ request })
      cookies.forEach(({ name, value, options }) =>
        response.cookies.set(name, value, options),
      )
    },
  })

  // getUser() validates the access token and, when it has expired, exchanges
  // the refresh token and writes the rotated session cookies to the response.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    // Run the session refresh on app pages and app API routes only.
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
