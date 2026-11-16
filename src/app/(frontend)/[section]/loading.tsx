export default function SectionLoading() {
  return (
    <main
      className="min-h-screen bg-[#f4f5f4] px-5 py-8 lg:pl-[284px]"
      aria-label="Loading operations"
    >
      <div className="mx-auto max-w-[1500px] animate-pulse">
        <div className="h-3 w-32 rounded bg-slate-200" />
        <div className="mt-4 h-9 w-72 rounded bg-slate-200" />
        <div className="mt-3 h-4 w-96 max-w-full rounded bg-slate-200" />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div className="h-28 rounded-xl bg-slate-200" key={item} />
          ))}
        </div>
        <div className="mt-6 h-96 rounded-xl bg-white shadow-[0_0_0_1px_rgba(15,23,42,.07)]" />
      </div>
      <span className="sr-only">Loading inventory and operations data…</span>
    </main>
  )
}
