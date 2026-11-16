import type { TransactionSql } from 'postgres'
import { sql } from '@/lib/db'
import { getCurrentUser } from '@/backend/auth/session'
import type { StaffRole } from '@/backend/access/staff'
import {
  applySale,
  BusinessRuleError,
  cancelSale,
  receivePurchaseOrderItem,
  requireRole,
  returnSaleItem,
  adjustStock,
} from '@/domain/inventory/rules'
import { parseInventoryQr } from '@/domain/inventory/qr-stock'
import { createSupabaseAdminClient } from '@/lib/supabase'

type Input = Record<string, unknown>

type Tx = TransactionSql

const text = (input: Input, field: string) => {
  const value = input[field]
  if (typeof value !== 'string' || !value.trim()) {
    throw new BusinessRuleError(`Enter ${field.replaceAll(/([A-Z])/g, ' $1').toLowerCase()}.`)
  }
  return value.trim()
}

const optionalText = (input: Input, field: string) => {
  const value = input[field]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

const integer = (input: Input, field: string) => {
  const value = input[field]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new BusinessRuleError(`${field} must be a whole number.`)
  }
  return value
}

const nonnegativeNumber = (input: Input, field: string) => {
  const value = input[field]
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BusinessRuleError(`${field} must be zero or greater.`)
  }
  return value
}

const nonnegativeInteger = (input: Input, field: string) => {
  const value = integer(input, field)
  if (value < 0) throw new BusinessRuleError(`${field} cannot be negative.`)
  return value
}

const remark = (reason: string, reference: string) => `${reason} :: ${reference}`

export async function handleOperation(request: Request) {
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'Sign in to continue.' }, { status: 401 })

  const input = (await request.json().catch(() => null)) as Input | null
  if (!input || typeof input.action !== 'string') {
    return Response.json({ error: 'Choose a valid operation.' }, { status: 400 })
  }

  try {
    const result = await sql.begin(async (tx) => {
      switch (input.action) {
        case 'adjust-stock':
          return adjustInventory(input, user, tx)
        case 'record-sale':
          return recordSale(input, user, tx)
        case 'cancel-sale':
          return cancelRecordedSale(input, user, tx)
        case 'return-sale-item':
          return returnRecordedItem(input, user, tx)
        case 'purchase-order-decision':
          return decidePurchaseOrder(input, user, tx)
        case 'receive-purchase-order-item':
          return receiveItem(input, user, tx)
        case 'create-purchase-order':
          return createPurchaseOrder(input, user, tx)
        case 'stock-in':
          return stockIn(input, user, tx)
        case 'qr-stock-in':
          return stockInFromQr(input, user, tx)
        case 'create-product':
          return createProduct(input, user, tx)
        case 'create-variant':
          return createVariant(input, user, tx)
        case 'delete-product':
          return deleteProduct(input, user, tx)
        case 'create-user':
          return createUserAccount(input, user, tx)
        case 'update-user':
          return updateUserAccount(input, user, tx)
        case 'delete-user':
          return deleteUserAccount(input, user, tx)
        default:
          throw new BusinessRuleError('Unknown operation.')
      }
    })
    return Response.json({ ok: true, result })
  } catch (error) {
    if (error instanceof BusinessRuleError) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    console.error('Operation failed:', error)
    return Response.json(
      { error: 'Unable to complete the operation. No changes were saved.' },
      { status: 500 },
    )
  }
}

type VariantRow = {
  variant_id: number
  product_id: number
  product_name: string
  sku: string
  size: string
  color: string
  stock: number
  reorder_point: number
  safety_stock: number
}

async function loadVariant(tx: Tx, key: string): Promise<VariantRow> {
  const trimmed = key.trim()
  const numeric = Number(trimmed)
  const byId = Number.isInteger(numeric) && String(numeric) === trimmed
  const condition = byId ? sql`v.variant_id = ${numeric}` : sql`v.sku = ${trimmed}`
  const rows = await tx<VariantRow[]>`
    select
      v.variant_id,
      v.product_id,
      p.product_name,
      v.sku,
      v.size,
      v.color,
      coalesce(i.quantity_on_hand, 0) as stock,
      coalesce(i.reorder_point, 10) as reorder_point,
      coalesce(i.safety_stock, 5) as safety_stock
    from public.product_variants v
    join public.products p on p.product_id = v.product_id
    left join public.inventory i on i.variant_id = v.variant_id
    where ${condition}
    limit 1
  `
  const variant = rows[0]
  if (!variant) throw new BusinessRuleError('That variant was not found.')
  return variant
}

/** Locks (or creates) the inventory row for a variant inside the transaction. */
async function lockStock(tx: Tx, variantId: number): Promise<number> {
  const updated = await tx<{ quantity_on_hand: number }[]>`
    insert into public.inventory (variant_id, quantity_on_hand)
    values (${variantId}, 0)
    on conflict (variant_id) do nothing
  `
  void updated
  const rows = await tx<{ quantity_on_hand: number }[]>`
    select quantity_on_hand from public.inventory
    where variant_id = ${variantId}
    for update
  `
  return Number(rows[0].quantity_on_hand)
}

async function saveStock(
  tx: Tx,
  variantId: number,
  balance: number,
  type: 'SALE' | 'CANCELLATION' | 'RETURN' | 'RECEIPT' | 'ADJUSTMENT',
  quantity: number,
  remarks: string,
  userId: string,
) {
  await tx`
    update public.inventory
    set quantity_on_hand = ${balance}, updated_at = now()
    where variant_id = ${variantId}
  `
  await tx`
    insert into public.inventory_transactions
      (variant_id, user_id, transaction_type, quantity, remarks)
    values (${variantId}, ${userId}::uuid, ${type}, ${quantity}, ${remarks})
  `
}

async function adjustInventory(input: Input, user: Awaited<ReturnType<typeof getCurrentUser>>, tx: Tx) {
  requireRole(user!.role as StaffRole, ['inventory', 'manager'])
  const variantId = text(input, 'variantId')
  const change = integer(input, 'change')
  const reason = text(input, 'reason')
  const reference = text(input, 'reference')

  const variant = await loadVariant(tx, variantId)
  const current = await lockStock(tx, variant.variant_id)
  const balance = adjustStock(current, change, reason)
  await saveStock(
    tx,
    variant.variant_id,
    balance,
    'ADJUSTMENT',
    change,
    remark(reason, reference),
    user!.id,
  )
  return { variantId, balance }
}

async function recordSale(input: Input, user: Awaited<ReturnType<typeof getCurrentUser>>, tx: Tx) {
  requireRole(user!.role as StaffRole, ['sales', 'manager'])
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new BusinessRuleError('Add at least one sale item.')
  }
  const items = input.items.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new BusinessRuleError('Sale item is invalid.')
    const item = raw as Input
    const parsed = {
      variantId: text(item, 'variantId'),
      quantity: integer(item, 'quantity'),
      unitPrice: Number(item.unitPrice),
    }
    if (!Number.isFinite(parsed.unitPrice) || parsed.unitPrice < 0) {
      throw new BusinessRuleError('Unit price must be zero or greater.')
    }
    return parsed
  })

  const orderReference = text(input, 'orderReference')
  const channel = text(input, 'channel')
  const soldAt = typeof input.soldAt === 'string' && input.soldAt ? input.soldAt : new Date().toISOString()

  const existing = await tx`
    select 1 from public.sales where order_reference = ${orderReference}
  `
  if (existing.length) throw new BusinessRuleError('That order reference is already recorded.')

  const variants = await Promise.all(items.map((item) => loadVariant(tx, item.variantId)))
  const balances = variants.map((variant, index) =>
    applySale(variant.stock, items[index].quantity),
  )
  const total = items.reduce((sum, item, index) => sum + item.quantity * item.unitPrice, 0)

  const saleRows = await tx<{ sale_id: number }[]>`
    insert into public.sales (order_reference, channel, user_id, sale_date, total_amount, status)
    values (${orderReference}, ${channel}, ${user!.id}::uuid, ${soldAt}, ${total}, 'Completed')
    returning sale_id
  `
  const saleId = saleRows[0].sale_id

  for (const [index, item] of items.entries()) {
    await tx`
      insert into public.sale_items (sale_id, variant_id, quantity, unit_price)
      values (${saleId}, ${variants[index].variant_id}, ${item.quantity}, ${item.unitPrice})
    `
    await saveStock(
      tx,
      variants[index].variant_id,
      balances[index],
      'SALE',
      -item.quantity,
      remark(`Sold via ${channel}`, orderReference),
      user!.id,
    )
  }
  return { saleId: String(saleId), orderReference, total }
}

async function cancelRecordedSale(
  input: Input,
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  tx: Tx,
) {
  requireRole(user!.role as StaffRole, ['sales', 'manager'])
  const saleId = Number(text(input, 'saleId'))
  if (!Number.isInteger(saleId)) throw new BusinessRuleError('Choose a valid sale.')

  const sales = await tx<{
    sale_id: number
    order_reference: string
    status: string
  }[]>`
    select sale_id, order_reference, status
    from public.sales
    where sale_id = ${saleId}
    for update
  `
  const sale = sales[0]
  if (!sale) throw new BusinessRuleError('That sale was not found.')
  if (sale.status === 'Cancelled') return { saleId, changed: false }
  if (sale.status !== 'Completed') {
    throw new BusinessRuleError('Only a completed sale can be cancelled.')
  }

  const lines = await tx<{ sale_item_id: number; variant_id: number; quantity: number }[]>`
    select sale_item_id, variant_id, quantity
    from public.sale_items
    where sale_id = ${saleId}
  `
  for (const line of lines) {
    const returned = await returnedQuantityForLine(tx, line.sale_item_id)
    const restore = line.quantity - returned
    if (restore <= 0) continue
    const variant = await loadVariant(tx, String(line.variant_id))
    const current = await lockStock(tx, variant.variant_id)
    const next = cancelSale(current, restore, 'completed')
    await saveStock(
      tx,
      variant.variant_id,
      next.stock,
      'CANCELLATION',
      restore,
      remark('Sale cancelled', sale.order_reference),
      user!.id,
    )
  }
  await tx`
    update public.sales set status = 'Cancelled' where sale_id = ${saleId}
  `
  return { saleId: String(saleId), changed: true }
}

async function returnedQuantityForLine(tx: Tx, saleItemId: number) {
  const rows = await tx<{ returned: string | number }[]>`
    select coalesce(sum(t.quantity), 0) as returned
    from public.inventory_transactions t
    where t.transaction_type = 'RETURN'
      and t.remarks like ${'%SALE_ITEM:' + saleItemId + ' ::%'}
  `
  return Number(rows[0]?.returned ?? 0)
}

async function returnRecordedItem(
  input: Input,
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  tx: Tx,
) {
  requireRole(user!.role as StaffRole, ['inventory', 'manager'])
  const saleItemId = Number(text(input, 'saleItemId'))
  if (!Number.isInteger(saleItemId)) throw new BusinessRuleError('Choose a valid sale line.')

  const lines = await tx<{ sale_id: number; variant_id: number; quantity: number }[]>`
    select sale_id, variant_id, quantity
    from public.sale_items
    where sale_item_id = ${saleItemId}
  `
  const line = lines[0]
  if (!line) throw new BusinessRuleError('That sale line was not found.')

  const sales = await tx<{ order_reference: string; status: string }[]>`
    select order_reference, status from public.sales where sale_id = ${line.sale_id}
  `
  const sale = sales[0]
  if (!sale) throw new BusinessRuleError('That sale was not found.')
  if (sale.status === 'Cancelled') {
    throw new BusinessRuleError('A cancelled sale cannot receive returns.')
  }

  const quantity = integer(input, 'quantity')
  const reason = optionalText(input, 'reason') ?? 'Product return'
  const returned = await returnedQuantityForLine(tx, saleItemId)
  const variant = await loadVariant(tx, String(line.variant_id))
  const current = await lockStock(tx, variant.variant_id)
  const next = returnSaleItem(current, line.quantity, returned, quantity)
  await saveStock(
    tx,
    variant.variant_id,
    next.stock,
    'RETURN',
    quantity,
    remark(reason, `SALE_ITEM:${saleItemId}`),
    user!.id,
  )
  return {
    saleItemId: String(saleItemId),
    stock: next.stock,
    returnedQuantity: next.returnedQuantity,
  }
}

const PO_TRANSITIONS: Record<
  string,
  { from: string[]; to: string; roles: StaffRole[]; setsApprover?: boolean }
> = {
  submit: { from: ['Draft'], to: 'Pending Approval', roles: ['procurement', 'manager'] },
  approve: {
    from: ['Pending Approval'],
    to: 'Approved',
    roles: ['manager'],
    setsApprover: true,
  },
  reject: { from: ['Pending Approval'], to: 'Draft', roles: ['manager'] },
  order: { from: ['Approved'], to: 'Ordered', roles: ['procurement', 'manager'] },
}

async function decidePurchaseOrder(
  input: Input,
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  tx: Tx,
) {
  const purchaseOrderId = Number(text(input, 'purchaseOrderId'))
  const action = text(input, 'decision')
  if (!Number.isInteger(purchaseOrderId)) {
    throw new BusinessRuleError('Choose a valid purchase order.')
  }

  const transition = PO_TRANSITIONS[action]
  if (!transition) throw new BusinessRuleError('Unknown purchase-order action.')
  requireRole(user!.role as StaffRole, transition.roles)

  const orders = await tx<{ purchase_order_id: number; status: string; po_number: string }[]>`
    select purchase_order_id, status, po_number
    from public.purchase_orders
    where purchase_order_id = ${purchaseOrderId}
    for update
  `
  const po = orders[0]
  if (!po) throw new BusinessRuleError('That purchase order was not found.')
  if (!transition.from.includes(po.status)) {
    throw new BusinessRuleError(
      `A ${po.status.toLowerCase()} order cannot be ${action}d.`,
    )
  }

  if (transition.setsApprover) {
    await tx`
      update public.purchase_orders
      set status = ${transition.to}, approved_by = ${user!.id}::uuid
      where purchase_order_id = ${purchaseOrderId}
    `
  } else {
    await tx`
      update public.purchase_orders
      set status = ${transition.to}
      where purchase_order_id = ${purchaseOrderId}
    `
  }
  return { purchaseOrderId: String(purchaseOrderId), status: transition.to, number: po.po_number }
}

async function createPurchaseOrder(
  input: Input,
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  tx: Tx,
) {
  requireRole(user!.role as StaffRole, ['procurement', 'manager'])
  const supplierId = Number(text(input, 'supplierId'))
  const variantId = text(input, 'variantId')
  const quantityOrdered = integer(input, 'quantity')
  const unitCost = nonnegativeNumber(input, 'unitCost')
  const poNumber =
    optionalText(input, 'poNumber') ??
    `PO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(Date.now()).slice(-4)}`

  if (!Number.isInteger(supplierId)) throw new BusinessRuleError('Choose a supplier.')
  const suppliers = await tx`
    select 1 from public.suppliers where supplier_id = ${supplierId}
  `
  if (!suppliers.length) throw new BusinessRuleError('That supplier was not found.')

  const variant = await loadVariant(tx, variantId)

  const existing = await tx`
    select 1 from public.purchase_orders where po_number = ${poNumber}
  `
  if (existing.length) throw new BusinessRuleError('That PO number is already in use.')

  const orderRows = await tx<{ purchase_order_id: number }[]>`
    insert into public.purchase_orders (po_number, supplier_id, created_by, status)
    values (${poNumber}, ${supplierId}, ${user!.id}::uuid, 'Draft')
    returning purchase_order_id
  `
  const purchaseOrderId = orderRows[0].purchase_order_id
  await tx`
    insert into public.purchase_order_items
      (purchase_order_id, variant_id, quantity_ordered, unit_cost)
    values (${purchaseOrderId}, ${variant.variant_id}, ${quantityOrdered}, ${unitCost})
  `
  return { purchaseOrderId: String(purchaseOrderId), number: poNumber, sku: variant.sku }
}

async function receiveItem(input: Input, user: Awaited<ReturnType<typeof getCurrentUser>>, tx: Tx) {
  requireRole(user!.role as StaffRole, ['inventory', 'manager'])
  const poItemId = Number(text(input, 'purchaseOrderItemId'))
  const quantity = integer(input, 'quantity')
  const receiptNumber = optionalText(input, 'receiptNumber') ?? `RCPT-${Date.now()}`
  if (!Number.isInteger(poItemId)) {
    throw new BusinessRuleError('Choose a valid purchase-order line.')
  }

  const items = await tx<{
    po_item_id: number
    purchase_order_id: number
    variant_id: number
    quantity_ordered: number
  }[]>`
    select po_item_id, purchase_order_id, variant_id, quantity_ordered
    from public.purchase_order_items
    where po_item_id = ${poItemId}
  `
  const item = items[0]
  if (!item) throw new BusinessRuleError('That purchase-order line was not found.')

  const orders = await tx<{ status: string }[]>`
    select status from public.purchase_orders
    where purchase_order_id = ${item.purchase_order_id}
    for update
  `
  const poStatus = orders[0]?.status ?? 'Ordered'
  if (['Draft', 'Pending Approval'].includes(poStatus)) {
    throw new BusinessRuleError('Approve this order before receiving stock against it.')
  }

  const receivedRows = await tx<{ received: string | number }[]>`
    select coalesce(sum(quantity_received), 0) as received
    from public.po_receipts
    where po_item_id = ${poItemId} and status = 'Accepted'
  `
  const alreadyReceived = Number(receivedRows[0].received)
  const next = receivePurchaseOrderItem(Number(item.quantity_ordered), alreadyReceived, quantity)
  const variant = await loadVariant(tx, String(item.variant_id))
  const current = await lockStock(tx, variant.variant_id)
  const stock = current + quantity

  await tx`
    insert into public.po_receipts (po_item_id, received_by, quantity_received, status)
    values (${poItemId}, ${user!.id}::uuid, ${quantity}, 'Accepted')
  `
  await saveStock(
    tx,
    variant.variant_id,
    stock,
    'RECEIPT',
    quantity,
    remark('Goods received against purchase order', receiptNumber),
    user!.id,
  )

  const siblings = await tx<{ quantity_ordered: number; received: string | number }[]>`
    select
      poi.quantity_ordered,
      coalesce((
        select sum(r.quantity_received)
        from public.po_receipts r
        where r.po_item_id = poi.po_item_id and r.status = 'Accepted'
      ), 0) as received
    from public.purchase_order_items poi
    where poi.purchase_order_id = ${item.purchase_order_id}
  `
  const complete = siblings.every((line) => Number(line.received) >= Number(line.quantity_ordered))
  await tx`
    update public.purchase_orders
    set status = ${complete ? 'Received' : 'Partially Received'}
    where purchase_order_id = ${item.purchase_order_id}
  `
  return {
    purchaseOrderItemId: String(poItemId),
    receiptNumber,
    stock,
    received: next.received,
    outstanding: next.outstanding,
    poStatus: complete ? 'Received' : 'Partially Received',
  }
}

async function stockIn(input: Input, user: Awaited<ReturnType<typeof getCurrentUser>>, tx: Tx) {
  requireRole(user!.role as StaffRole, ['administrator', 'inventory', 'manager', 'production'])
  const quantity = integer(input, 'quantity')
  const reference = text(input, 'reference')
  const variant = await verifyStockInTargets(input, tx, text(input, 'productId'), text(input, 'size'))
  return recordStockIn(tx, user, variant, quantity, reference)
}

async function stockInFromQr(
  input: Input,
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  tx: Tx,
) {
  requireRole(user!.role as StaffRole, ['administrator', 'inventory', 'manager', 'production'])
  const parsed = parseInventoryQr(text(input, 'qrPayload'))
  const variant = await verifyStockInTargets(
    { productId: parsed.product, size: parsed.size },
    tx,
    parsed.product,
    parsed.size,
  )
  const reference =
    typeof input.reference === 'string' && input.reference.trim()
      ? input.reference.trim()
      : `QR-${Date.now()}`
  return recordStockIn(tx, user, variant, parsed.quantity, reference)
}

async function verifyStockInTargets(
  input: Input,
  tx: Tx,
  productReference: string,
  size: string,
) {
  const variantIdInput = typeof input.variantId === 'string' ? input.variantId.trim() : ''
  if (!variantIdInput) throw new BusinessRuleError('Choose the variant to receive stock for.')
  const variant = await loadVariant(tx, variantIdInput)
  const keys = [String(variant.product_id), variant.product_name.toLowerCase()].map((value) =>
    value.toLowerCase(),
  )
  if (!keys.includes(productReference.toLowerCase())) {
    throw new BusinessRuleError('The product does not match the selected variant.')
  }
  if (variant.size.toLowerCase() !== size.toLowerCase()) {
    throw new BusinessRuleError('The size does not match the selected variant.')
  }
  return variant
}

async function recordStockIn(
  tx: Tx,
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  variant: VariantRow,
  quantity: number,
  reference: string,
) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new BusinessRuleError('Stock-in quantity must be a positive whole number.')
  }
  const current = await lockStock(tx, variant.variant_id)
  const balance = current + quantity
  await saveStock(
    tx,
    variant.variant_id,
    balance,
    'RECEIPT',
    quantity,
    remark('Stock received into inventory', reference),
    user!.id,
  )
  return {
    balance,
    product: variant.product_name,
    quantity,
    size: variant.size,
    sku: variant.sku,
  }
}

async function createProduct(
  input: Input,
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  tx: Tx,
) {
  requireRole(user!.role as StaffRole, ['administrator', 'inventory', 'manager'])
  const name = text(input, 'name')
  const categoryId = Number(text(input, 'categoryId'))
  const description = optionalText(input, 'description')

  if (!Number.isInteger(categoryId)) throw new BusinessRuleError('Choose a valid category.')
  const categories = await tx`
    select 1 from public.categories where category_id = ${categoryId}
  `
  if (!categories.length) throw new BusinessRuleError('That category was not found.')

  const duplicate = await tx`
    select 1 from public.products where lower(product_name) = ${name.toLowerCase()}
  `
  if (duplicate.length) throw new BusinessRuleError('That product name is already in use.')

  const rows = await tx<{ product_id: number }[]>`
    insert into public.products (category_id, product_name, description)
    values (${categoryId}, ${name}, ${description ?? null})
    returning product_id
  `
  return { id: String(rows[0].product_id), name }
}

async function createVariant(
  input: Input,
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  tx: Tx,
) {
  requireRole(user!.role as StaffRole, ['administrator', 'inventory', 'manager'])
  const productId = Number(text(input, 'productId'))
  const sku = text(input, 'sku').toUpperCase()
  const size = text(input, 'size')
  const color = text(input, 'color')
  const price = nonnegativeNumber(input, 'price')
  const cost = nonnegativeNumber(input, 'cost')
  const reorderPoint = nonnegativeInteger(input, 'reorderPoint')
  const safetyStock = nonnegativeInteger(input, 'safetyStock')
  const openingStock = nonnegativeInteger(input, 'openingStock')

  if (!Number.isInteger(productId)) throw new BusinessRuleError('Choose a valid product.')
  const products = await tx`
    select 1 from public.products where product_id = ${productId}
  `
  if (!products.length) throw new BusinessRuleError('That product was not found.')

  const duplicate = await tx`
    select 1 from public.product_variants where sku = ${sku}
  `
  if (duplicate.length) throw new BusinessRuleError('That SKU is already in use.')

  const rows = await tx<{ variant_id: number }[]>`
    insert into public.product_variants (product_id, sku, size, color, price, cost)
    values (${productId}, ${sku}, ${size}, ${color}, ${price}, ${cost})
    returning variant_id
  `
  const variantId = rows[0].variant_id

  await tx`
    insert into public.inventory (variant_id, quantity_on_hand, reorder_point, safety_stock)
    values (${variantId}, ${openingStock}, ${reorderPoint}, ${safetyStock})
  `

  if (openingStock > 0) {
    await tx`
      insert into public.inventory_transactions
        (variant_id, user_id, transaction_type, quantity, remarks)
      values
        (${variantId}, ${user!.id}::uuid, 'ADJUSTMENT', ${openingStock},
         ${remark('Opening stock for new variant', `OPENING-${sku}`)})
    `
  }
  return { id: String(variantId), openingStock, productId: String(productId), sku }
}

async function deleteProduct(
  input: Input,
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  tx: Tx,
) {
  requireRole(user!.role as StaffRole, ['administrator', 'manager'])
  const productId = Number(text(input, 'productId'))
  if (!Number.isInteger(productId)) throw new BusinessRuleError('Choose a valid product.')

  const products = await tx<{ product_name: string }[]>`
    select product_name from public.products where product_id = ${productId}
  `
  const product = products[0]
  if (!product) throw new BusinessRuleError('That product was not found.')

  const variants = await tx`
    select 1 from public.product_variants where product_id = ${productId}
  `
  if (variants.length) {
    throw new BusinessRuleError(
      'This product still has variants. Remove its variants first to preserve inventory history.',
    )
  }
  await tx`
    delete from public.products where product_id = ${productId}
  `
  return { id: String(productId), name: product.product_name }
}

/** Staff roles allowed by the public.users CHECK constraint. */
const DB_ROLES = [
  'Administrator',
  'Inventory Staff',
  'Sales Staff',
  'Procurement Staff',
  'Manager',
] as const

/** Access states allowed by the public.users CHECK constraint. */
const DB_STATUSES = ['Active', 'Inactive'] as const

function requireAdminClient() {
  try {
    return createSupabaseAdminClient()
  } catch (error) {
    throw new BusinessRuleError(
      error instanceof Error ? error.message : 'Supabase admin access is unavailable.',
    )
  }
}

const slugify = (value: string) => value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '').slice(0, 24)

async function createUserAccount(
  input: Input,
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  tx: Tx,
) {
  requireRole(user!.role as StaffRole, ['administrator'])
  const name = text(input, 'name')
  const email = text(input, 'email').toLowerCase()
  const password = text(input, 'password')
  const role = text(input, 'role')
  const status =
    typeof input.status === 'string' && (DB_STATUSES as readonly string[]).includes(input.status)
      ? input.status
      : 'Active'

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BusinessRuleError('Enter a valid email address.')
  }
  if (password.length < 6) {
    throw new BusinessRuleError('Password must be at least 6 characters.')
  }
  if (!(DB_ROLES as readonly string[]).includes(role)) {
    throw new BusinessRuleError('Choose a valid role.')
  }

  const duplicateEmail = await tx`
    select 1 from public.users where lower(email) = ${email}
  `
  if (duplicateEmail.length) throw new BusinessRuleError('That email already has an account.')

  const admin = requireAdminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw new BusinessRuleError(error?.message ?? 'Supabase Auth rejected the new account.')
  }
  const authUserId = data.user.id

  // Unique username derived from the email's local part.
  const base = slugify(email.split('@')[0]) || 'staff'
  const taken = await tx<{ username: string }[]>`
    select username from public.users
    where username = ${base} or username like ${`${base}-%`}
  `
  const used = new Set(taken.map((row) => row.username))
  let username = base
  let suffix = 2
  while (used.has(username)) username = `${base}-${suffix++}`

  try {
    const rows = await tx<{ user_id: string }[]>`
      insert into public.users (auth_id, username, name, email, role, status)
      values (${authUserId}::uuid, ${username}, ${name}, ${email}, ${role}, ${status})
      returning user_id
    `
    return { id: String(rows[0].user_id), username, name, email, role, status }
  } catch (insertError) {
    // The transaction will roll back the staff row, so also remove the auth user.
    try {
      await admin.auth.admin.deleteUser(authUserId)
    } catch (cleanupError) {
      console.error('Could not remove the orphaned Supabase Auth user:', cleanupError)
    }
    throw insertError
  }
}

async function updateUserAccount(
  input: Input,
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  tx: Tx,
) {
  requireRole(user!.role as StaffRole, ['administrator'])
  const userId = text(input, 'userId')
  const name = optionalText(input, 'name')
  const role = optionalText(input, 'role')
  const status = optionalText(input, 'status')

  if (role && !(DB_ROLES as readonly string[]).includes(role)) {
    throw new BusinessRuleError('Choose a valid role.')
  }
  if (status && !(DB_STATUSES as readonly string[]).includes(status)) {
    throw new BusinessRuleError('Access must be Active or Inactive.')
  }

  const rows = await tx<{ user_id: string; role: string; status: string }[]>`
    select user_id, role, status
    from public.users
    where user_id = ${userId}::uuid
    for update
  `
  const target = rows[0]
  if (!target) throw new BusinessRuleError('That account was not found.')
  if (target.user_id === user!.id && (status === 'Inactive' || (role && role !== target.role))) {
    throw new BusinessRuleError('You cannot deactivate your own account or change your own role.')
  }

  const updated = await tx<{ name: string; role: string; status: string }[]>`
    update public.users set
      name = coalesce(${name ?? null}, name),
      role = coalesce(${role ?? null}, role),
      status = coalesce(${status ?? null}, status)
    where user_id = ${userId}::uuid
    returning name, role, status
  `
  const row = updated[0]
  return { id: userId, name: row.name, role: row.role, status: row.status }
}

async function deleteUserAccount(
  input: Input,
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  tx: Tx,
) {
  requireRole(user!.role as StaffRole, ['administrator'])
  const userId = text(input, 'userId')
  if (userId === user!.id) {
    throw new BusinessRuleError('You cannot delete your own account while signed in.')
  }

  const rows = await tx<{ auth_id: string | null; name: string }[]>`
    select auth_id, name
    from public.users
    where user_id = ${userId}::uuid
    for update
  `
  const target = rows[0]
  if (!target) throw new BusinessRuleError('That account was not found.')

  await tx`
    delete from public.users where user_id = ${userId}::uuid
  `

  if (target.auth_id) {
    try {
      const admin = requireAdminClient()
      await admin.auth.admin.deleteUser(target.auth_id)
    } catch (error) {
      // The staff row is already gone, so the account can no longer sign in.
      // A leftover auth user only wastes a seat in Supabase Auth.
      console.error('Could not remove the Supabase Auth user:', error)
    }
  }
  return { id: userId, name: target.name }
}
