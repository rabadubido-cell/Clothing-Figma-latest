'use client'

import { LoaderCircle, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { OperationsData } from '@/backend/operations/data'

type Target = OperationsData['users'][number]

type Props = {
  mode: 'create' | 'edit'
  onClose: () => void
  onComplete: (message: string) => void
  target?: Target
}

/** Roles allowed by the public.users CHECK constraint, with friendly labels. */
const ROLE_OPTIONS: Array<[string, string]> = [
  ['Administrator', 'Administrator'],
  ['Inventory Staff', 'Inventory Staff'],
  ['Sales Staff', 'Sales Staff'],
  ['Procurement Staff', 'Procurement Staff'],
  ['Manager', 'Manager / Owner'],
]

export function UserAccountPanel({ mode, onClose, onComplete, target }: Props) {
  const router = useRouter()
  const [name, setName] = useState(target?.name ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState(target?.role ?? 'Inventory Staff')
  const [active, setActive] = useState(target?.status !== 'Inactive')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit() {
    setPending(true)
    setError('')
    try {
      const body =
        mode === 'create'
          ? { action: 'create-user', email, name, password, role, status: active ? 'Active' : 'Inactive' }
          : {
              action: 'update-user',
              name,
              role,
              status: active ? 'Active' : 'Inactive',
              userId: target?.id,
            }
      const response = await fetch('/api/app/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(
          result.error ?? (mode === 'create' ? 'Unable to create the account.' : 'Unable to update the account.'),
        )
      }
      onComplete(
        mode === 'create'
          ? `Account created for ${name.trim()}. They can sign in with the email and password you set.`
          : `Account updated for ${name.trim()}.`,
      )
      router.refresh()
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to continue.')
    } finally {
      setPending(false)
    }
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const canSubmit = name.trim() && (mode === 'edit' || (emailValid && password.length >= 6))

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <label>
        <span className="form-label">Full name</span>
        <input
          className="field"
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Ana Reyes"
          required
          value={name}
        />
      </label>

      {mode === 'create' ? (
        <>
          <label>
            <span className="form-label">Email (used to sign in)</span>
            <input
              className="field"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            <span className="form-label">Password</span>
            <input
              className="field"
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              required
              type="password"
              value={password}
            />
          </label>
        </>
      ) : (
        target && (
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <strong className="block text-slate-900">{target.email}</strong>
            <span className="mt-1 block">
              Sign-in emails cannot be changed. Reset the password from Supabase Auth if needed.
            </span>
          </div>
        )
      )}

      <label>
        <span className="form-label">Role</span>
        <select className="field" onChange={(event) => setRole(event.target.value)} value={role}>
          {ROLE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <div>
        <span className="form-label">Access</span>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
          <button
            aria-label={active ? 'Deactivate access' : 'Activate access'}
            aria-pressed={active}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              active ? 'bg-teal-600' : 'bg-slate-300'
            }`}
            onClick={(event) => {
              event.preventDefault()
              setActive(!active)
            }}
            type="button"
          >
            <span
              className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
                active ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
          <div className="min-w-0 text-sm">
            <strong className="block text-slate-900">{active ? 'Active' : 'Inactive'}</strong>
            <span className="block text-slate-500">
              {active
                ? 'The account can sign in and use the app.'
                : 'The account cannot sign in until reactivated.'}
            </span>
          </div>
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}
      <div className="drawer-actions">
        <button className="secondary-button" onClick={onClose} type="button">
          Cancel
        </button>
        <button className="primary-button" disabled={pending || !canSubmit} type="submit">
          {pending ? (
            <LoaderCircle className="animate-spin" size={16} />
          ) : (
            <Users size={16} />
          )}
          {mode === 'create' ? 'Create account' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}
