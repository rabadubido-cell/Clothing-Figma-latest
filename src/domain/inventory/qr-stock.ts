import { BusinessRuleError } from './rules'

export type InventoryQrPayload = {
  product: string
  variant: string
  quantity: number
  size: string
}

const requiredText = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BusinessRuleError(`QR code is missing ${label}.`)
  }
  return value.trim()
}

export function parseInventoryQr(value: string): InventoryQrPayload {
  let input: Record<string, unknown>
  try {
    input = JSON.parse(value) as Record<string, unknown>
  } catch {
    throw new BusinessRuleError('QR code must contain valid inventory JSON.')
  }

  const quantity = Number(input.quantity)
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new BusinessRuleError('QR quantity must be a positive whole number.')
  }

  return {
    product: requiredText(
      input.product ?? input.productId ?? input.productName ?? input.styleCode,
      'a product',
    ),
    variant: requiredText(
      input.variant ?? input.variantId ?? input.sku ?? input.barcode,
      'a variant',
    ),
    quantity,
    size: requiredText(input.size, 'a size'),
  }
}
