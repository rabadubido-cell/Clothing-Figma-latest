'use client'

import { Camera, CheckCircle2, LoaderCircle, PackagePlus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { OperationsData } from '@/backend/operations/data'
import { parseInventoryQr } from '@/domain/inventory/qr-stock'

export type InventoryActionMode = 'delete-product' | 'qr-stock-in' | 'stock-in'

type Props = {
  data: OperationsData
  mode: InventoryActionMode
  onClose?: () => void
  onComplete: (message: string) => void
  productId?: string
  role: string
  variantId?: string
}

type OperationResult = {
  error?: string
  result?: { balance?: number; name?: string; product?: string; quantity?: number; sku?: string }
}

async function runOperation(body: Record<string, unknown>) {
  const response = await fetch('/api/app/operations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = (await response.json()) as OperationResult
  if (!response.ok) throw new Error(result.error ?? 'Unable to complete this inventory action.')
  return result.result
}

export function InventoryActionPanel({
  data,
  mode,
  onClose,
  onComplete,
  productId,
  role,
  variantId: requestedVariantId,
}: Props) {
  const router = useRouter()
  const initialProductId = productId ?? data.products[0]?.id ?? ''
  const [selectedProductId, setSelectedProductId] = useState(initialProductId)
  const variants = data.variants.filter((variant) => variant.productId === selectedProductId)
  const [variantId, setVariantId] = useState(requestedVariantId ?? variants[0]?.id ?? '')
  const [quantity, setQuantity] = useState(1)
  const [reference, setReference] = useState(`STOCK-${new Date().toISOString().slice(0, 10)}`)
  const [qrValue, setQrValue] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const requested = data.variants.find(
      (variant) => variant.id === requestedVariantId && variant.productId === selectedProductId,
    )
    const firstVariant = data.variants.find((variant) => variant.productId === selectedProductId)
    setVariantId(requested?.id ?? firstVariant?.id ?? '')
  }, [data.variants, requestedVariantId, selectedProductId])

  const selectedProduct = data.products.find((product) => product.id === selectedProductId)
  const selectedVariant = data.variants.find((variant) => variant.id === variantId)
  const qrPreview = useMemo(() => {
    if (!qrValue.trim()) return null
    try {
      return { data: parseInventoryQr(qrValue), error: '' }
    } catch (qrError) {
      return {
        data: null,
        error: qrError instanceof Error ? qrError.message : 'Unable to read this QR code.',
      }
    }
  }, [qrValue])

  async function complete(
    body: Record<string, unknown>,
    success: (result: OperationResult['result']) => string,
  ) {
    setPending(true)
    setError('')
    try {
      const result = await runOperation(body)
      onComplete(success(result))
      router.refresh()
      onClose?.()
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : 'Unable to continue.')
    } finally {
      setPending(false)
    }
  }

  async function readQrImage(file: File) {
    setError('')
    if (!('BarcodeDetector' in window)) {
      setError('Camera QR detection is not supported in this browser. Paste the QR text below.')
      return
    }
    try {
      const bitmap = await createImageBitmap(file)
      const Detector = window.BarcodeDetector as new (options: { formats: string[] }) => {
        detect: (image: ImageBitmap) => Promise<Array<{ rawValue: string }>>
      }
      const detector = new Detector({ formats: ['qr_code'] })
      const codes = await detector.detect(bitmap)
      bitmap.close()
      if (!codes[0]?.rawValue) throw new Error('No QR code was found in that image.')
      setQrValue(codes[0].rawValue)
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Unable to scan this QR image.')
    }
  }

  if (mode === 'delete-product') {
    const product = data.products.find((item) => item.id === productId)
    const productVariants = data.variants.filter(
      (variant) => variant.productId === product?.id,
    )
    if (!['administrator', 'manager'].includes(role)) {
      return (
        <div className="empty-state">
          <p className="font-semibold text-slate-900">Not permitted</p>
          <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
            Only administrators and managers can delete products.
          </p>
        </div>
      )
    }
    return (
      <div>
        <div className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <Trash2 className="mb-3" size={21} />
          <strong className="block">Delete {product?.name}?</strong>
          <p className="mt-1 text-amber-800">
            {productVariants.length
              ? `This product still has ${productVariants.length} variant(s). Delete its variants first — the operation will refuse while variants remain.`
              : 'This product has no variants, so it can be removed permanently. This cannot be undone.'}
          </p>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="drawer-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="primary-button text-red-700"
            disabled={pending || !product || productVariants.length > 0}
            onClick={() =>
              complete(
                { action: 'delete-product', productId: product?.id },
                (result) => `${result?.name ?? 'Product'} was permanently deleted.`,
              )
            }
            type="button"
          >
            {pending ? <LoaderCircle className="animate-spin" size={16} /> : <Trash2 size={16} />}
            Delete product
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'qr-stock-in') {
    return (
      <div className="mx-auto w-full max-w-md">
        <div className="scanner-viewfinder">
          <Camera size={48} />
          <p>Scan a product box QR</p>
          <small>QR must include product, variant, quantity, and size.</small>
        </div>
        <input
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void readQrImage(file)
          }}
          ref={fileInputRef}
          type="file"
        />
        <button
          className="secondary-button mt-4 w-full justify-center"
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          <Camera size={16} /> Open camera
        </button>
        <label className="form-label mt-5" htmlFor="qr-payload">
          QR contents
        </label>
        <textarea
          className="field min-h-28 py-3 font-mono text-xs"
          id="qr-payload"
          onChange={(event) => setQrValue(event.target.value)}
          placeholder='{"product":"Everyday Ribbed Tee","variant":"ERT-M-BLK","quantity":12,"size":"M"}'
          value={qrValue}
        />
        {qrPreview?.data && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 size={17} /> QR ready
            </div>
            <p className="mt-2">
              {qrPreview.data.product} · {qrPreview.data.variant} · {qrPreview.data.size} ·{' '}
              {qrPreview.data.quantity} units
            </p>
          </div>
        )}
        {(error || qrPreview?.error) && <p className="form-error">{error || qrPreview?.error}</p>}
        <div className="drawer-actions">
          {onClose && (
            <button className="secondary-button" onClick={onClose} type="button">
              Cancel
            </button>
          )}
          <button
            className="primary-button"
            disabled={pending || !qrPreview?.data}
            onClick={() =>
              complete(
                { action: 'qr-stock-in', qrPayload: qrValue, reference },
                (result) =>
                  `${result?.quantity} units added to ${result?.sku}. New balance: ${result?.balance}.`,
              )
            }
            type="button"
          >
            {pending ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <PackagePlus size={16} />
            )}
            Add scanned stock
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <label>
        <span className="form-label">Product</span>
        <select
          className="field"
          onChange={(event) => setSelectedProductId(event.target.value)}
          value={selectedProductId}
        >
          {data.products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} · {product.styleCode}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="form-label">Variant</span>
        <select
          className="field"
          onChange={(event) => setVariantId(event.target.value)}
          value={variantId}
        >
          {variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.sku} · {variant.color} / {variant.size}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="form-label">Quantity received</span>
          <input
            className="field"
            min={1}
            onChange={(event) => setQuantity(Number(event.target.value))}
            type="number"
            value={quantity}
          />
        </label>
        <label>
          <span className="form-label">Reference</span>
          <input
            className="field"
            onChange={(event) => setReference(event.target.value)}
            value={reference}
          />
        </label>
      </div>
      <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
        <strong className="block text-slate-900">{selectedProduct?.name}</strong>
        <span className="mt-1 block">
          {selectedVariant?.sku} · {selectedVariant?.color} / {selectedVariant?.size} · current
          stock {selectedVariant?.stock ?? 0}
        </span>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="drawer-actions">
        <button className="secondary-button" onClick={onClose} type="button">
          Cancel
        </button>
        <button
          className="primary-button"
          disabled={pending || !selectedVariant || quantity < 1 || !reference.trim()}
          onClick={() =>
            complete(
              {
                action: 'stock-in',
                productId: selectedProductId,
                quantity,
                reference,
                size: selectedVariant?.size,
                variantId,
              },
              (result) =>
                `${result?.quantity} units added to ${result?.sku}. New balance: ${result?.balance}.`,
            )
          }
          type="button"
        >
          {pending ? (
            <LoaderCircle className="animate-spin" size={16} />
          ) : (
            <PackagePlus size={16} />
          )}
          Add stock
        </button>
      </div>
    </div>
  )
}

declare global {
  interface Window {
    BarcodeDetector?: unknown
  }
}
