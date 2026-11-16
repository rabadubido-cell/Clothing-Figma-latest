'use client'

import { LoaderCircle, SlidersHorizontal } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { OperationsData } from '@/backend/operations/data'

type Props = {
  data: OperationsData
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
    result?: { balance?: number; variantId?: string }
  }
  if (!response.ok) throw new Error(result.error ?? 'Unable to adjust stock.')
  return result.result
}

export function AdjustStockPanel({ data, onClose, onComplete, role }: Props) {
  const router = useRouter()
  const [variantId, setVariantId] = useState(data.variants[0]?.id ?? '')
  const [change, setChange] = useState(0)
  const [reason, setReason] = useState('')
  const [reference, setReference] = useState(
    `ADJ-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`,
  )
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  const selectedVariant = data.variants.find((variant) => variant.id === variantId)
  const projected =
    selectedVariant !== undefined && Number.isInteger(change)
      ? Math.max(0, selectedVariant.stock + change)
      : null

  async function submit() {
    setPending(true)
    setError('')
    try {
      const result = await runOperation({
        action: 'adjust-stock',
        change,
        reason,
        reference,
        variantId,
      })
      onComplete(
        `Stock for ${selectedVariant?.sku} adjusted. New balance: ${result?.balance}.`,
      )
      router.refresh()
      onClose()
    } catch (adjustError) {
      setError(adjustError instanceof Error ? adjustError.message : 'Unable to continue.')
    } finally {
      setPending(false)
    }
  }

  if (!['inventory', 'manager'].includes(role)) {
    return (
      <div className="empty-state">
        <p className="font-semibold text-slate-900">Not permitted</p>
        <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
          Only inventory staff and managers can record stock adjustments.
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
        <span className="form-label">Variant</span>
        <select
          className="field"
          onChange={(event) => setVariantId(event.target.value)}
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
          <span className="form-label">Quantity change</span>
          <input
            className="field"
            inputMode="numeric"
            onChange={(event) => setChange(Number(event.target.value))}
            placeholder="-3 or 5"
            required
            type="number"
            value={change === 0 ? '' : change}
          />
        </label>
        <label>
          <span className="form-label">Audit reference</span>
          <input
            className="field"
            onChange={(event) => setReference(event.target.value)}
            required
            value={reference}
          />
        </label>
      </div>
      <label>
        <span className="form-label">Reason</span>
        <textarea
          className="field min-h-28 py-3"
          onChange={(event) => setReason(event.target.value)}
          placeholder="Damaged during cycle count, recount variance, shrinkage…"
          required
          value={reason}
        />
      </label>
      <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        <strong className="block text-slate-900">{selectedVariant?.sku}</strong>
        <span className="mt-1 block">
          Current stock {selectedVariant?.stock ?? 0}
          {projected !== null ? ` → ${projected} after this adjustment` : ''}
        </span>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="drawer-actions">
        <button className="secondary-button" onClick={onClose} type="button">
          Cancel
        </button>
        <button
          className="primary-button"
          disabled={
            pending ||
            !selectedVariant ||
            !Number.isInteger(change) ||
            change === 0 ||
            !reason.trim() ||
            !reference.trim()
          }
          type="submit"
        >
          {pending ? (
            <LoaderCircle className="animate-spin" size={16} />
          ) : (
            <SlidersHorizontal size={16} />
          )}
          Record adjustment
        </button>
      </div>
    </form>
  )
}
