import { describe, expect, it } from 'vitest'
import { BusinessRuleError } from './rules'
import { parseInventoryQr } from './qr-stock'

describe('parseInventoryQr', () => {
  it('normalizes product and variant aliases', () => {
    expect(
      parseInventoryQr(
        JSON.stringify({
          productName: 'Everyday Ribbed Tee',
          sku: 'ERT-M-BLK',
          quantity: 12,
          size: 'M',
        }),
      ),
    ).toEqual({
      product: 'Everyday Ribbed Tee',
      variant: 'ERT-M-BLK',
      quantity: 12,
      size: 'M',
    })
  })

  it('rejects incomplete or invalid quantities', () => {
    expect(() =>
      parseInventoryQr(
        JSON.stringify({ product: 'Everyday Ribbed Tee', variant: 'ERT-M-BLK', quantity: 0 }),
      ),
    ).toThrow(BusinessRuleError)
  })
})
