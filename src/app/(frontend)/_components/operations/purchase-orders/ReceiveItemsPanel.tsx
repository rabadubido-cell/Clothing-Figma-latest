'use client'

import { LoaderCircle, PackageCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { OperationsData } from '@/backend/operations/data'

type PoItem = OperationsData['purchaseOrders'][number]['items'][number]

type Props = {
  onClose: () => void
  onComplete: (message: string) => void
  po: OperationsData['purchaseOrders'][number]
  role: string
}

async function runOperation(body: Record<string, unknown>) {
  const response = await fetch('/api/app/operations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = (await response.json()) as {
    error?: string
    result?: { poStatus?: string; stock?: number }
  }
  if (!response.ok) throw new Error(result.error ?? 'Unable to receive this line.')
  return result.result
}

export function ReceiveItemsPanel({ onClose, onComplete, po, role }: Props) {
  const router = useRouter()
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(po.items.map((item) => [item.id, item.outstanding])),
  )
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const planned = po.items.filter(
    (item) =>
      Number.isInteger(quantities[item.id]) &&
      quantities[item.id] > 0 &&
      quantities[item.id] <= item.outstanding,
  )
  const plannedUnits = planned.reduce((sum, item) => sum + quantities[item.id], 0)

  async function submit() {
    setPending(true)
    setError('')
    try {
      let poStatus = ''
      for (const item of planned) {
        const result = await runOperation({
          action: 'receive-purchase-order-item',
          purchaseOrderItemId: item.id,
          quantity: quantities[item.id],
        })
        poStatus = result?.poStatus ?? poStatus
      }
      onComplete(
        `${plannedUnits} unit(s) received against ${po.number}. Order status: ${poStatus}.`,
      )
      router.refresh()
      onClose()
    } catch (receiveError) {
      setError(receiveError instanceof Error ? receiveError.message : 'Unable to continue.')
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
          Only inventory staff and managers can receive purchase-order stock.
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
          {po.number} · {po.supplier}
        </strong>
        <span className="mt-1 block">
          Status {po.status} · {po.items.reduce((sum, item) => sum + item.outstanding, 0)} units
          outstanding
        </span>
      </div>

      {po.items.length ? (
        <div className="space-y-3">
          {po.items.map((item) => {
            const poItem = item as PoItem
            return (
              <div className="rounded-xl border border-slate-200 p-3" key={poItem.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm text-slate-900">
                      {poItem.variant}
                    </strong>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      ordered {poItem.ordered} · received {poItem.received} · outstanding{' '}
                      {poItem.outstanding} · unit cost {poItem.unitCost.toFixed(2)}
                    </span>
                  </div>
                  {poItem.outstanding > 0 ? (
                    <input
                      aria-label={`Receive quantity for ${poItem.variant}`}
                      className="field max-w-28 text-right"
                      max={poItem.outstanding}
                      min={0}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [poItem.id]: Number(event.target.value),
                        }))
                      }
                      type="number"
                      value={quantities[poItem.id] ?? ''}
                    />
                  ) : (
                    <span className="text-xs font-medium text-emerald-700">Complete</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="empty-state">
          <PackageCheck size={22} />
          <p className="mt-3 font-semibold text-slate-900">No line items</p>
          <p className="mt-1 text-sm text-slate-500">This purchase order has no items attached.</p>
        </div>
      )}

      <div className="rounded-xl bg-teal-50 p-4 text-sm text-teal-900">
        Received quantities are recorded as accepted goods receipts and written to the inventory
        ledger as RECEIPT events. The order becomes Partially Received or Received automatically.
      </div>
      {error && <p className="form-error">{error}</p>}
      {planned.length >= 0 && po.items.length > 0 && (
        <div className="drawer-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={pending || plannedUnits === 0}
            type="submit"
          >
            {pending ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <PackageCheck size={16} />
            )}
            Receive {plannedUnits} unit{plannedUnits === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </form>
  )
}
