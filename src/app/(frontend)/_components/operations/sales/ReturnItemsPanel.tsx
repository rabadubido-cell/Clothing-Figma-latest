'use client'

import { LoaderCircle, Undo2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { OperationsData } from '@/backend/operations/data'

type Props = {
  data: OperationsData
  onClose: () => void
  onComplete: (message: string) => void
  reference: string
  role: string
}

type ReturnPlan = Record<string, number>

async function runOperation(body: Record<string, unknown>) {
  const response = await fetch('/api/app/operations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = (await response.json()) as {
    error?: string
    result?: { returnedQuantity?: number; stock?: number }
  }
  if (!response.ok) throw new Error(result.error ?? 'Unable to process this return.')
  return result.result
}

export function ReturnItemsPanel({ data, onClose, onComplete, reference, role }: Props) {
  const router = useRouter()
  const sale = data.sales.find((item) => item.reference === reference)
  const returnable = (sale?.items ?? []).map((item) => {
    const variant = data.variants.find((candidate) => candidate.sku === item.sku)
    return {
      ...item,
      variant,
      remaining: Math.max(0, item.quantity - item.returnedQuantity),
    }
  })
  const [plan, setPlan] = useState<ReturnPlan>({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const plannedUnits = Object.values(plan).reduce(
    (sum, quantity) => sum + (Number.isInteger(quantity) && quantity > 0 ? quantity : 0),
    0,
  )
  const openLines = returnable.filter((item) => item.remaining > 0)

  async function submit() {
    setPending(true)
    setError('')
    try {
      let restocked = 0
      for (const item of returnable) {
        const quantity = plan[item.id] ?? 0
        if (!Number.isInteger(quantity) || quantity <= 0) continue
        if (quantity > item.remaining) {
          throw new Error(`Only ${item.remaining} unit(s) can still be returned for ${item.sku}.`)
        }
        await runOperation({
          action: 'return-sale-item',
          quantity,
          saleItemId: item.id,
        })
        restocked += quantity
      }
      onComplete(
        `${restocked} unit(s) restocked for ${reference}. Balances updated in the inventory ledger.`,
      )
      router.refresh()
      onClose()
    } catch (returnError) {
      setError(returnError instanceof Error ? returnError.message : 'Unable to continue.')
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  if (!['inventory', 'manager'].includes(role)) {
    return (
      <div className="empty-state">
        <p className="font-semibold text-slate-900">Not permitted</p>
        <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
          Only inventory staff and managers can process returns.
        </p>
      </div>
    )
  }

  if (!sale) {
    return (
      <div className="empty-state">
        <p className="font-semibold text-slate-900">Sale not found</p>
        <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
          No sale with reference {reference} exists in the database.
        </p>
      </div>
    )
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        <strong className="block text-slate-900">
          {sale.reference} · {sale.channel}
        </strong>
        <span className="mt-1 block">
          {sale.items.reduce((sum, item) => sum + item.quantity, 0)} units sold · recorded{' '}
          {new Date(sale.date).toLocaleDateString()}
        </span>
      </div>

      {openLines.length ? (
        <div className="space-y-3">
          {returnable.map((item) => (
            <div className="rounded-xl border border-slate-200 p-3" key={item.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <strong className="block truncate text-sm text-slate-900">{item.sku}</strong>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {item.variant ? `${item.variant.color} / ${item.variant.size} · ` : ''}
                    sold {item.quantity} · already returned {item.returnedQuantity}
                  </span>
                </div>
                <input
                  aria-label={`Return quantity for ${item.sku}`}
                  className="field max-w-28 text-right"
                  max={item.remaining}
                  min={0}
                  onChange={(event) =>
                    setPlan((current) => ({ ...current, [item.id]: Number(event.target.value) }))
                  }
                  type="number"
                  value={plan[item.id] ?? ''}
                />
              </div>
              {item.remaining === 0 && (
                <p className="mt-2 text-xs text-slate-400">Fully returned.</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Undo2 size={22} />
          <p className="mt-3 font-semibold text-slate-900">Nothing left to return</p>
          <p className="mt-1 text-sm text-slate-500">
            Every line on this order has already been returned.
          </p>
        </div>
      )}

      <div className="rounded-xl bg-teal-50 p-4 text-sm text-teal-900">
        Returned units are written to the inventory ledger as RETURN events and increase the
        variant stock balance immediately.
      </div>
      {error && <p className="form-error">{error}</p>}
      {openLines.length > 0 && (
        <div className="drawer-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={pending || plannedUnits === 0}
            type="submit"
          >
            {pending ? <LoaderCircle className="animate-spin" size={16} /> : <Undo2 size={16} />}
            Restock {plannedUnits} unit{plannedUnits === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </form>
  )
}
