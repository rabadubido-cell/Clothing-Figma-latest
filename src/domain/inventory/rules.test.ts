import { describe, expect, it } from 'vitest'
import {
  adjustStock,
  applySale,
  cancelSale,
  movementClass,
  receivePurchaseOrderItem,
  requireRole,
  returnSaleItem,
  suggestedOrderQuantity,
  transitionPurchaseOrder,
} from './rules'

describe('role permissions', () => {
  it('allows only managers to approve purchase orders', () => {
    expect(transitionPurchaseOrder('pending-approval', 'approve', 'manager')).toBe('approved')
    expect(() => transitionPurchaseOrder('pending-approval', 'approve', 'procurement')).toThrow(
      'not allowed',
    )
    expect(() => requireRole('sales', ['inventory'])).toThrow('not allowed')
  })
})

describe('sales and returns', () => {
  it('prevents insufficient-stock sales', () => {
    expect(applySale(8, 3)).toBe(5)
    expect(() => applySale(2, 3)).toThrow('Insufficient stock')
  })

  it('restores stock once when a sale is cancelled', () => {
    expect(cancelSale(7, 2, 'completed')).toEqual({ stock: 9, changed: true })
    expect(cancelSale(9, 2, 'cancelled')).toEqual({ stock: 9, changed: false })
  })

  it('records partial returns without exceeding the sold quantity', () => {
    expect(returnSaleItem(5, 3, 1, 1)).toEqual({ stock: 6, returnedQuantity: 2 })
    expect(() => returnSaleItem(5, 3, 2, 2)).toThrow('cannot exceed')
  })
})

describe('inventory adjustments', () => {
  it('requires a reason and prevents negative stock', () => {
    expect(adjustStock(10, -2, 'Damaged during count')).toBe(8)
    expect(() => adjustStock(10, 1, '  ')).toThrow('reason')
    expect(() => adjustStock(1, -2, 'Shrinkage')).toThrow('negative')
  })
})

describe('purchase-order workflow', () => {
  it('supports approval, rejection, and revision', () => {
    expect(transitionPurchaseOrder('pending-approval', 'reject', 'manager')).toBe('rejected')
    expect(transitionPurchaseOrder('rejected', 'revise', 'procurement')).toBe('draft')
  })

  it('tracks partial receipts and rejects over-receiving', () => {
    expect(receivePurchaseOrderItem(12, 0, 5)).toEqual({
      received: 5,
      outstanding: 7,
      status: 'partially-received',
    })
    expect(receivePurchaseOrderItem(12, 5, 7).status).toBe('received')
    expect(() => receivePurchaseOrderItem(12, 5, 8)).toThrow('outstanding')
  })
})

describe('explainable inventory analysis', () => {
  it('subtracts stock on hand and outstanding POs from a lead-time suggestion', () => {
    expect(
      suggestedOrderQuantity({
        unitsSold30Days: 30,
        leadTimeDays: 12,
        safetyStock: 4,
        stockOnHand: 3,
        outstandingPurchaseQuantity: 5,
      }),
    ).toBe(8)
  })

  it('uses documented 30-day movement thresholds', () => {
    expect(movementClass(10)).toBe('fast-moving')
    expect(movementClass(3)).toBe('normal')
    expect(movementClass(2)).toBe('slow-moving')
  })
})
