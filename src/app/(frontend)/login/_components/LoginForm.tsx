'use client'

import { useState } from 'react'
import { ArrowRight, LockKeyhole } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function LoginForm() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(formData: FormData) {
    setPending(true)
    setError('')
    const response = await fetch('/api/app/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: formData.get('email'),
        password: formData.get('password'),
      }),
    })
    const result = (await response.json()) as { error?: string }
    if (!response.ok) {
      setError(result.error ?? 'Unable to sign in. Try again.')
      setPending(false)
      return
    }
    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <form action={submit} className="mt-9 space-y-5">
      <div>
        <label className="mb-2 block text-sm font-medium text-stone-800" htmlFor="email">
          Work email
        </label>
        <input
          autoComplete="email"
          className="field"
          id="email"
          name="email"
          placeholder="you@company.com"
          required
          type="email"
        />
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-stone-800" htmlFor="password">
            Password
          </label>
          <span className="text-xs text-stone-500">Contact an administrator to reset</span>
        </div>
        <input
          autoComplete="current-password"
          className="field"
          id="password"
          minLength={8}
          name="password"
          required
          type="password"
        />
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button w-full justify-center" disabled={pending} type="submit">
        <LockKeyhole aria-hidden="true" size={17} strokeWidth={2} />
        {pending ? 'Signing in…' : 'Sign in securely'}
        {!pending && <ArrowRight aria-hidden="true" size={17} strokeWidth={2} />}
      </button>
    </form>
  )
}
