'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function SectionError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f5f4] px-5">
      <section className="w-full max-w-md rounded-xl bg-white p-7 text-center shadow-[0_0_0_1px_rgba(15,23,42,.08),0_8px_28px_rgba(15,23,42,.08)]">
        <span className="mx-auto grid size-11 place-items-center rounded-xl bg-amber-50 text-amber-700">
          <AlertTriangle size={21} />
        </span>
        <h1 className="mt-5 text-xl font-semibold tracking-[-0.02em] text-slate-950">
          Unable to load operations
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Check your connection and try again. No inventory changes were made.
        </p>
        <button className="primary-button mt-6 justify-center" onClick={reset}>
          <RefreshCw size={16} /> Try again
        </button>
      </section>
    </main>
  )
}
