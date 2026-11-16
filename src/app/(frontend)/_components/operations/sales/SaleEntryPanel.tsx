'use client'

import { LoaderCircle, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { OperationsData } from '@/backend/operations/data'

type SaleItem = { key: number; variantId: string; quantity: number; unitPrice: number }

type Props = {
  data: OperationsData
  onClose: () => void
  onComplete: (message: string) => void
  role: string
}

const channels = ['In-store', 'Online', 'Wholesale', 'Marketplace', 'Consignment']

async function runOperation(body: Record<string, unknown>) {
  const response = await fetch('/api/app/operations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = (await response.json()) as {
    error?: string
    result?: { orderReference?: string; total?: number }
  }
  if (!response.ok) throw new Error(result.error ?? 'Unable to record this sale.')
  return result.result
}

export function SaleEntryPanel({ data, onClose, onComplete, role }: Props) {
  const router = useRouter()
  const [orderReference, setOrderReference] = useState(
    `ORD-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(Date.now()).slice(-4)}`,
  )
  const [channel, setChannel] = useState(channels[0])
  const [items, setItems] = useState<SaleItem[]>([])
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const validItems = items.filter(
    (item) =>
      item.variantId &&
      Number.isInteger(item.quantity) &&
      item.quantity > 0 &&
      Number.isFinite(item.unitPrice) &&
      item.unitPrice >= 0,
  )
  const total = validItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const variant = (id: string) => data.variants.find((item) => item.id === id)

  function updateItem(key: number, patch: Partial<SaleItem>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    )
  }

  function addLine() {
    const firstVariant = data.variants[0]
    setItems((current) => [
      ...current,
      {
        key: Date.now() + current.length,
        variantId: firstVariant?.id ?? '',
        quantity: 1,
        unitPrice: firstVariant?.price ?? 0,
      },
    ])
  }

  async function submit() {
    setPending(true)
    setError('')
    try {
      const result = await runOperation({
        action: 'record-sale',
        channel,
        items: validItems.map((item) => ({
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          variantId: item.variantId,
        })),
        orderReference,
      })
      onComplete(
        `Sale ${result?.orderReference ?? orderReference} recorded · ${validItems.reduce(
          (sum, item) => sum + item.quantity,
          0,
        )} units · ${result?.total?.toFixed(2) ?? total.toFixed(2)} total.`,
      )
      router.refresh()
      onClose()
    } catch (saleError) {
      setError(saleError instanceof Error ? saleError.message : 'Unable to continue.')
    } finally {
      setPending(false)
    }
  }

  if (!['sales', 'manager'].includes(role)) {
    return (
      <div className="empty-state">
        <p className="font-semibold text-slate-900">Not permitted</p>
        <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
          Only sales staff and managers can record sales.
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
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="form-label">Order reference</span>
          <input
            className="field"
            onChange={(event) => setOrderReference(event.target.value)}
            required
            value={orderReference}
          />
        </label>
        <label>
          <span className="form-label">Channel</span>
          <select
            className="field"
            onChange={(event) => setChannel(event.target.value)}
            value={channel}
          >
            {channels.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="form-label">Items</span>
          <button className="text-action" onClick={addLine} type="button">
            <Plus size={13} /> Add item
          </button>
        </div>
        {items.length ? (
          <div className="space-y-3">
            {items.map((item) => {
              const selected = variant(item.variantId)
              const available = selected?.stock ?? 0
              return (
                <div className="rounded-xl border border-slate-200 p-3" key={item.key}>
                  <div className="flex items-center justify-between gap-3">
                    <select
                      aria-label="Variant"
                      className="field"
                      onChange={(event) => {
                        const next = variant(event.target.value)
                        updateItem(item.key, {
                          variantId: event.target.value,
                          unitPrice: next?.price ?? item.unitPrice,
                        })
                      }}
                      value={item.variantId}
                    >
                      {data.variants.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.sku} · {option.color} / {option.size} (stock {option.stock})
                        </option>
                      ))}
                    </select>
                    <button
                      aria-label="Remove item"
                      className="icon-button text-red-700"
                      onClick={() =>
                        setItems((current) => current.filter((line) => line.key !== item.key))
                      }
                      type="button"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <label>
                      <span className="form-label">Qty</span>
                      <input
                        className="field"
                        min={1}
                        onChange={(event) => updateItem(item.key, { quantity: Number(event.target.value) })}
                        type="number"
                        value={item.quantity}
                      />
                    </label>
                    <label>
                      <span className="form-label">Unit price</span>
                      <input
                        className="field"
                        min={0}
                        onChange={(event) => updateItem(item.key, { unitPrice: Number(event.target.value) })}
                        step="0.01"
                        type="number"
                        value={item.unitPrice}
                      />
                    </label>
                    <div className="self-end pb-1 text-sm text-slate-500">
                      Line: <strong className="tabular text-slate-900">{(item.quantity * item.unitPrice).toFixed(2)}</strong>
                    </div>
                  </div>
                  {selected && item.quantity > available && (
                    <p className="mt-2 text-xs font-medium text-amber-700">
                      Only {available} units in stock for this variant.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
            Add at least one item. Each sale deducts stock from the exact variant.
          </div>
        )}
      </div>

      <div className="rounded-xl bg-slate-950 p-4 text-white">
        <p className="text-xs text-slate-400">Order total</p>
        <p className="mt-1 text-2xl font-semibold tabular">{total.toFixed(2)}</p>
        <p className="mt-2 text-xs text-slate-400">
          {validItems.reduce((sum, item) => sum + item.quantity, 0)} units · {channel}
        </p>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="drawer-actions">
        <button className="secondary-button" onClick={onClose} type="button">
          Cancel
        </button>
        <button
          className="primary-button"
          disabled={pending || !validItems.length || !orderReference.trim()}
          type="submit"
        >
          {pending ? (
            <LoaderCircle className="animate-spin" size={16} />
          ) : (
            <ShoppingBag size={16} />
          )}
          Record sale
        </button>
      </div>
    </form>
  )
}
