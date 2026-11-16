import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/backend/auth/session'
import { LoginForm } from './_components/LoginForm'

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/dashboard')
  return (
    <main className="grid min-h-screen bg-[#f7f6f2] lg:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden overflow-hidden bg-[#172b26] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="soft-grid absolute inset-0 opacity-20" />
        <div className="relative flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#d9f99d] text-lg font-bold text-[#173d32]">
            T
          </span>
          <span className="text-lg font-semibold">Threadline Operations</span>
        </div>
        <div className="relative max-w-xl">
          <p className="mb-4 text-sm font-medium text-[#d9f99d]">One location. One stock truth.</p>
          <h1 className="text-balance text-5xl font-semibold leading-[1.08] tracking-[-0.04em]">
            Keep every size, color, and order moving.
          </h1>
          <p className="mt-6 max-w-lg text-pretty text-lg leading-8 text-white/65">
            A focused workspace for sales, stock control, supplier orders, and receiving—built for a
            growing online clothing business.
          </p>
        </div>
        <div className="relative flex gap-8 text-sm text-white/55">
          <span>Auditable inventory</span>
          <span>Manager approvals</span>
          <span>Clear reorder logic</span>
        </div>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[430px]">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-[#173d32] text-lg font-bold text-white">
              T
            </span>
            <span className="font-semibold text-stone-900">Threadline Operations</span>
          </div>
          <p className="text-sm font-medium text-[#2d6a56]">Staff access</p>
          <h2 className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-stone-950">
            Welcome back
          </h2>
          <p className="mt-3 text-pretty leading-7 text-stone-600">
            Sign in with the account created for your role.
          </p>
          <LoginForm />
          <p className="mt-8 text-center text-xs leading-5 text-stone-500">
            Access is logged and limited by role. Suppliers do not sign in.
          </p>
        </div>
      </section>
    </main>
  )
}
