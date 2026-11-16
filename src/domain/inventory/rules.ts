import type { StaffRole } from '@/backend/access/staff'

export class BusinessRuleError extends Error {}

export function requireRole(role: StaffRole, allowed: StaffRole[]) {
  if (!allowed.includes(role)) {
    throw new BusinessRuleError('Your role is not allowed to perform this action.')
  }
}

export function applySale(stock: number, quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new BusinessRuleError('Sale quantity must be a positive whole number.')
  }
  if (stock - quantity < 0) {
    throw new BusinessRuleError(
      'Insufficient stock. Reduce the quantity before recording the sale.',
    )
  }
  return stock - quantity
}

export function cancelSale(stock: number, quantity: number, status: string) {
  if (status === 'cancelled') return { stock, changed: false }
  if (status !== 'completed' && status !== 'partially-returned') {
    throw new BusinessRuleError('Only a completed sale can be cancelled.')
  }
  return { stock: stock + quantity, changed: true }
}

export function returnSaleItem(
  stock: number,
  sold: number,
  alreadyReturned: number,
  returning: number,
) {
  if (!Number.isInteger(returning) || returning <= 0) {
    throw new BusinessRuleError('Return quantity must be a positive whole number.')
  }
  if (alreadyReturned + returning > sold) {
    throw new BusinessRuleError('Return quantity cannot exceed the quantity sold.')
  }
  return { stock: stock + returning, returnedQuantity: alreadyReturned + returning }
}

export function adjustStock(stock: number, change: number, reason: string) {
  if (!reason.trim()) throw new BusinessRuleError('Enter a reason for this adjustment.')
  if (!Number.isInteger(change) || change === 0) {
    throw new BusinessRuleError('Adjustment must be a non-zero whole number.')
  }
  if (stock + change < 0) {
    throw new BusinessRuleError('This adjustment would make stock negative.')
  }
  return stock + change
}

type POStatus =
  | 'draft'
  | 'pending-approval'
  | 'approved'
  | 'rejected'
  | 'ordered'
  | 'sent'
  | 'partially-received'
  | 'received'

export function transitionPurchaseOrder(
  status: POStatus,
  action: string,
  role: StaffRole,
): POStatus {
  const transitions: Record<string, { from: POStatus[]; to: POStatus; roles: StaffRole[] }> = {
    submit: {
      from: ['draft', 'rejected'],
      to: 'pending-approval',
      roles: ['procurement', 'manager'],
    },
    approve: { from: ['pending-approval'], to: 'approved', roles: ['manager'] },
    reject: { from: ['pending-approval'], to: 'rejected', roles: ['manager'] },
    revise: { from: ['rejected'], to: 'draft', roles: ['procurement', 'manager'] },
    order: { from: ['approved'], to: 'ordered', roles: ['procurement', 'manager'] },
    send: { from: ['approved', 'ordered'], to: 'sent', roles: ['procurement', 'manager'] },
  }
  const transition = transitions[action]
  if (!transition) throw new BusinessRuleError('Unknown purchase-order action.')
  requireRole(role, transition.roles)
  if (!transition.from.includes(status)) {
    throw new BusinessRuleError(`A ${status.replaceAll('-', ' ')} order cannot be ${action}ed.`)
  }
  return transition.to
}

export function receivePurchaseOrderItem(ordered: number, received: number, incoming: number) {
  if (!Number.isInteger(incoming) || incoming <= 0) {
    throw new BusinessRuleError('Received quantity must be a positive whole number.')
  }
  if (received + incoming > ordered) {
    throw new BusinessRuleError('Received quantity cannot exceed the outstanding order quantity.')
  }
  const next = received + incoming
  return {
    received: next,
    outstanding: ordered - next,
    status: next === ordered ? ('received' as const) : ('partially-received' as const),
  }
}

export function suggestedOrderQuantity({
  unitsSold30Days,
  leadTimeDays,
  safetyStock,
  stockOnHand,
  outstandingPurchaseQuantity,
}: {
  unitsSold30Days: number
  leadTimeDays: number
  safetyStock: number
  stockOnHand: number
  outstandingPurchaseQuantity: number
}) {
  const averageDailySales = unitsSold30Days / 30
  return Math.max(
    0,
    Math.ceil(
      averageDailySales * leadTimeDays + safetyStock - stockOnHand - outstandingPurchaseQuantity,
    ),
  )
}

export function movementClass(unitsSold30Days: number) {
  if (unitsSold30Days >= 10) return 'fast-moving'
  if (unitsSold30Days >= 3) return 'normal'
  return 'slow-moving'
}
