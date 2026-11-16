'use client'

import { LoaderCircle, PackagePlus, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { OperationsData } from '@/backend/operations/data'

type Props = {
  data: OperationsData
  mode: 'product' | 'variant'
  onClose: () => void
  onComplete: (message: string) => void
  productId?: string
}

async function runOperation(body: Record<string, unknown>) {
  const response = await fetch('/api/app/operations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = (await response.json()) as {
    error?: string
    result?: { name?: string; sku?: string; openingStock?: number }
  }
  if (!response.ok) throw new Error(result.error ?? 'Unable to save this catalog item.')
  return result.result
}

export function ProductCatalogPanel({ data, mode, onClose, onComplete, productId }: Props) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const product = data.products.find((item) => item.id === productId)

  async function submit(formData: FormData) {
    setPending(true)
    setError('')
    try {
      const result =
        mode === 'product'
          ? await runOperation({
              action: 'create-product',
              categoryId: formData.get('categoryId'),
              description: formData.get('description'),
              name: formData.get('name'),
            }) : await runOperation({
              action: 'create-variant',
              color: formData.get('color'),
              cost: Number(formData.get('cost')),
              openingStock: Number(formData.get('openingStock')),
              price: Number(formData.get('price')),
              productId,
              reorderPoint: Number(formData.get('reorderPoint')),
              safetyStock: Number(formData.get('safetyStock')),
              size: formData.get('size'),
              sku: formData.get('sku'),
            })
      onComplete(
        mode === 'product'
          ? `${result?.name ?? 'Product'} was added.`
          : `${result?.sku ?? 'Variant'} was added with ${result?.openingStock ?? 0} opening units.`,
      )
      router.refresh()
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save this item.')
    } finally {
      setPending(false)
    }
  }

  if (mode === 'product' && !data.categories.length) {
    return (
      <div className="empty-state">
        <p className="font-semibold text-slate-900">Add a category first</p>
        <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
          Products require an existing category. Add one to the categories table in your database,
          then return here.
        </p>
      </div>
    )
  }

  return (
    <form action={submit} className="space-y-5">
      {mode === 'product' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name" name="name" placeholder="Everyday Ribbed Tee" required />
            <Select
              label="Category"
              name="categoryId"
              options={data.categories.map((category) => ({
                label: category.name,
                value: category.id,
              }))}
            />
          </div>
          <label>
            <span className="form-label">Description</span>
            <textarea
              className="field min-h-28 py-3"
              name="description"
              placeholder="Fabric, fit, and product notes"
            />
          </label>
          <div className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            After saving the product, select its card and use <strong>Add variant</strong> to create
            each size and color SKU.
          </div>
        </>
      ) : (
        <>
          <div className="rounded-xl bg-teal-50 p-4 text-sm text-teal-900">
            <strong className="block">{product?.name}</strong>
            <span className="mt-1 block text-teal-800">
              This size/color gets its own independent stock balance.
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Variant SKU" name="sku" placeholder="ERT-M-BLK" required />
            <Field label="Size" name="size" placeholder="M" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Color" name="color" placeholder="Black" required />
            <Field
              defaultValue="0"
              label="Opening stock"
              min="0"
              name="openingStock"
              required
              type="number"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              defaultValue="0"
              label="Price"
              min="0"
              name="price"
              required
              step="0.01"
              type="number"
            />
            <Field
              defaultValue="0"
              label="Cost"
              min="0"
              name="cost"
              required
              step="0.01"
              type="number"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              defaultValue="5"
              label="Reorder point"
              min="0"
              name="reorderPoint"
              required
              type="number"
            />
            <Field
              defaultValue="3"
              label="Safety stock"
              min="0"
              name="safetyStock"
              required
              type="number"
            />
          </div>
        </>
      )}

      {error && <p className="form-error">{error}</p>}
      <div className="drawer-actions">
        <button className="secondary-button" onClick={onClose} type="button">
          Cancel
        </button>
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? (
            <LoaderCircle className="animate-spin" size={16} />
          ) : mode === 'product' ? (
            <Plus size={16} />
          ) : (
            <PackagePlus size={16} />
          )}
          {mode === 'product' ? 'Add product' : 'Add variant'}
        </button>
      </div>
    </form>
  )
}

function Field({
  label,
  name,
  type = 'text',
  ...inputProps
}: {
  label: string
  name: string
  type?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      <span className="form-label">{label}</span>
      <input className="field" name={name} type={type} {...inputProps} />
    </label>
  )
}

function Select({
  includeBlank,
  label,
  name,
  options,
}: {
  includeBlank?: string
  label: string
  name: string
  options: Array<{ label: string; value: string }>
}) {
  return (
    <label>
      <span className="form-label">{label}</span>
      <select className="field" name={name} required={!includeBlank}>
        {includeBlank && <option value="">{includeBlank}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
