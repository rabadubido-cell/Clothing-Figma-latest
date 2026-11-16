'use client'

import { ClipboardList, LoaderCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { OperationsData } from '@/backend/operations/data'

type Props = {
  data: OperationsData
  initialSku?: string
  onClose: () => void
  onComplete: (message: string) => void
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
    result?: { number?: string; sku?: string }
  }
  if (!response.ok) throw new Error(result.error ?? 'Unable to create this purchase order.')
  return result.result
}

export function PurchaseOrderDraftPanel({
  data,
  initialSku,
  onClose,
  onComplete,
  role,
}: Props) {
  const router = useRouter()
  const initialVariant =
    data.variants.find((variant) => variant.sku === initialSku) ?? data.variants[0]
  const [supplierId, setSupplierId] = useState(data.suppliers[0]?.id ?? '')
  const [variantId, setVariantId] = useState(initialVariant?.id ?? '')
  const [quantity, setQuantity] = useState(() => {
    const variant = initialVariant
    if (!variant) return 1
    const suggested = Math.max(
      0,
      variant.reorderPoint + variant.safetyStock + variant.recentSales - variant.stock - variant.inbound,
    )
    return suggested > 0 ? suggested : 1
  })
  const [unitCost, setUnitCost] = useState(initialVariant?.cost ?? 0)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const selectedVariant = data.variants.find((variant) => variant.id === variantId)

  async function submit() {
    setPending(true)
    setError('')
    try {
      const result = await runOperation({
        action: 'create-purchase-order',
        quantity,
        supplierId,
        unitCost,
        variantId,
      })
      onComplete(
        `Draft ${result?.number} created for ${result?.sku} (${quantity} units). It stays in Draft until submitted for approval.`,
      )
      router.refresh()
      onClose()
    } catch (poError) {
      setError(poError instanceof Error ? poError.message : 'Unable to continue.')
    } finally {
      setPending(false)
    }
  }

  if (!['procurement', 'manager'].includes(role)) {
    return (
      <div className="empty-state">
        <p className="font-semibold text-slate-900">Not permitted</p>
        <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
          Only procurement staff and managers can draft purchase orders.
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
      <label>
        <span className="form-label">Supplier</span>
        <select
          className="field"
          onChange={(event) => setSupplierId(event.target.value)}
          value={supplierId}
        >
          {data.suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name} · lead time {supplier.leadTime} days
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="form-label">Variant</span>
        <select
          className="field"
          onChange={(event) => {
            setVariantId(event.target.value)
            const next = data.variants.find((variant) => variant.id === event.target.value)
            if (next) setUnitCost(next.cost)
          }}
          value={variantId}
        >
          {data.variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.sku} · {variant.product} · {variant.color} / {variant.size}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="form-label">Quantity</span>
          <input
            className="field"
            min={1}
            onChange={(event) => setQuantity(Number(event.target.value))}
            required
            type="number"
            value={quantity}
          />
        </label>
        <label>
          <span className="form-label">Unit cost</span>
          <input
            className="field"
            min={0}
            onChange={(event) => setUnitCost(Number(event.target.value))}
            required
            step="0.01"
            type="number"
            value={unitCost}
          />
        </label>
      </div>
      <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        <strong className="block text-slate-900">{selectedVariant?.sku}</strong>
        <span className="mt-1 block">
          On hand {selectedVariant?.stock ?? 0} · inbound {selectedVariant?.inbound ?? 0} · 30-day
          sales {selectedVariant?.recentSales ?? 0} · reorder at {selectedVariant?.reorderPoint ?? 0}
        </span>
      </div>
      <div className="rounded-xl bg-teal-50 p-4 text-sm text-teal-900">
        The draft is saved with status <strong>Draft</strong>. Use "Submit for approval" on the
        purchase-order page to move it into manager review — no order is sent automatically.
      </div>
      {!data.suppliers.length && <p className="form-error">Add a supplier before drafting orders.</p>}
      {error && <p className="form-error">{error}</p>}
      <div className="drawer-actions">
        <button className="secondary-button" onClick={onClose} type="button">
          Cancel
        </button>
        <button
          className="primary-button"
          disabled={pending || !supplierId || !selectedVariant || quantity < 1 || unitCost < 0}
          type="submit"
        >
          {pending ? (
            <LoaderCircle className="animate-spin" size={16} />
          ) : (
            <ClipboardList size={16} />
          )}
          Create draft
        </button>
      </div>
    </form>
  )
}
