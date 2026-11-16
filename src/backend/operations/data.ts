import 'server-only'
import { sql } from '@/lib/db'
import type { AppUser } from '@/backend/access/staff'

/**
 * Reads all operational data for the UI from the Supabase `public` schema.
 *
 * Tables: users, categories, products, product_variants, inventory,
 * inventory_transactions, sales, sale_items, suppliers, supplier_products,
 * purchase_orders, purchase_order_items, po_receipts.
 *
 * The reads are grouped into three SQL statements (catalog, activity,
 * supply chain) so a page load costs three pooled round-trips instead of
 * nine. Sections without backing tables (locations, transfers, materials,
 * work orders, integrations) return empty lists and render as empty states.
 */

const toNumber = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

const toISO = (value: unknown) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** Transaction remarks follow `reason :: reference`; tolerate legacy rows. */
const splitRemarks = (remarks: string | null): { reason: string; reference: string } => {
  const value = (remarks ?? '').trim()
  if (!value) return { reason: '', reference: '' }
  const separator = value.indexOf(' :: ')
  if (separator === -1) return { reason: value, reference: '' }
  return { reason: value.slice(0, separator).trim(), reference: value.slice(separator + 4).trim() }
}

const transactionTypeMap: Record<string, string> = {
  SALE: 'sale',
  CANCELLATION: 'cancellation',
  RETURN: 'return',
  RECEIPT: 'receipt',
  ADJUSTMENT: 'adjustment',
}

const poStatusMap: Record<string, string> = {
  Draft: 'draft',
  'Pending Approval': 'pending-approval',
  Approved: 'approved',
  Ordered: 'ordered',
  'Partially Received': 'partially-received',
  Received: 'received',
}

export type OperationsData = Awaited<ReturnType<typeof getOperationsData>>

export async function getOperationsData(_user?: AppUser) {
  const [catalog, activity, supply] = await Promise.all([getCatalog(), getActivity(), getSupplyChain()])

  const productRows = catalog.products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    styleCode: `STYLE-${product.id.padStart(4, '0')}`,
    season: 'Core',
    status: 'Active',
    description: product.description,
  }))

  const variantRows = catalog.variants.map((variant) => {
    const product = productRows.find((item) => item.id === variant.productId)
    return {
      id: variant.id,
      productId: variant.productId,
      sku: variant.sku,
      product: product?.name ?? `Product ${variant.productId}`,
      styleCode: product?.styleCode ?? 'STYLE',
      season: product?.season ?? 'Core',
      size: variant.size,
      color: variant.color,
      stock: variant.stock,
      reserved: 0,
      available: variant.stock,
      inbound: variant.inbound,
      recentSales: variant.recentSales,
      reorderPoint: variant.reorderPoint,
      safetyStock: variant.safetyStock,
      price: variant.price,
      cost: variant.cost,
      movement:
        variant.stock <= variant.reorderPoint
          ? 'Fast-moving'
          : variant.stock > variant.reorderPoint * 3
            ? 'Slow-moving'
            : 'Normal',
    }
  })

  return {
    categories: catalog.categories,
    products: productRows,
    variants: variantRows,
    transactions: activity.transactions.map((item) => {
      const { reason, reference } = splitRemarks(item.remarks)
      return {
        id: item.id,
        date: item.date,
        sku: item.sku,
        type: transactionTypeMap[item.type] ?? item.type.toLowerCase(),
        quantity: item.quantity,
        balance: item.balance,
        reference,
        reason,
        location: 'Main Warehouse',
        destination: '',
      }
    }),
    sales: activity.sales,
    suppliers: supply.suppliers,
    purchaseOrders: supply.purchaseOrders,
    receipts: supply.receipts,
    users: supply.users,
    stockTimeline: activity.stockTimeline,
    locations: [] as Array<{ id: string; name: string }>,
    locationInventory: [],
    transfers: [] as Array<{
      id: string
      number: string
      source: string
      destination: string
      itemCount: number
      shippedAt: string | null
      status: string
    }>,
    materials: [] as Array<{
      id: string
      name: string
      code: string
      type: string
      unit: string
      onHand: number
      reserved: number
      available: number
      reorderPoint: number
    }>,
    workOrders: [] as Array<{
      id: string
      number: string
      status: string
    }>,
    integrations: [] as Array<{
      id: string
      name: string
      category: string
      status: string
      result: string
    }>,
  }
}

type CatalogRow = {
  categories: Array<{ id: string; name: string }>
  products: Array<{ id: string; name: string; category: string; description: string }>
  variants: Array<{
    id: string
    productId: string
    sku: string
    size: string
    color: string
    price: number
    cost: number
    stock: number
    reorderPoint: number
    safetyStock: number
    recentSales: number
    inbound: number
  }>
}

async function getCatalog(): Promise<CatalogRow> {
  const rows = await sql<
    {
      categories: CatalogRow['categories']
      products: CatalogRow['products']
      variants: CatalogRow['variants']
    }[]
  >`
    with variant_rows as (
      select
        v.variant_id,
        v.product_id,
        v.sku,
        v.size,
        v.color,
        v.price,
        v.cost,
        coalesce(i.quantity_on_hand, 0) as stock,
        coalesce(i.reorder_point, 10) as reorder_point,
        coalesce(i.safety_stock, 5) as safety_stock,
        coalesce((
          select sum(si.quantity)
          from public.sale_items si
          join public.sales s on s.sale_id = si.sale_id
          where si.variant_id = v.variant_id
            and s.status = 'Completed'
            and s.sale_date >= now() - interval '30 days'
        ), 0) as recent_sales,
        coalesce((
          select sum(
            poi.quantity_ordered - coalesce((
              select sum(r.quantity_received)
              from public.po_receipts r
              where r.po_item_id = poi.po_item_id and r.status = 'Accepted'
            ), 0)
          )
          from public.purchase_order_items poi
          join public.purchase_orders po on po.purchase_order_id = poi.purchase_order_id
          where poi.variant_id = v.variant_id
            and po.status in ('Ordered', 'Partially Received')
        ), 0) as inbound
      from public.product_variants v
      left join public.inventory i on i.variant_id = v.variant_id
      order by v.variant_id
      limit 200
    )
    select
      (select coalesce(json_agg(x.obj), '[]'::json) from (
        select json_build_object('id', c.category_id, 'name', c.category_name) as obj
        from public.categories c
        order by c.category_name
        limit 100
      ) x) as categories,
      (select coalesce(json_agg(x.obj), '[]'::json) from (
        select json_build_object(
          'id', p.product_id,
          'name', p.product_name,
          'category', coalesce(c.category_name, 'Uncategorized'),
          'description', coalesce(p.description, '')
        ) as obj
        from public.products p
        left join public.categories c on c.category_id = p.category_id
        order by p.created_at desc, p.product_id desc
        limit 100
      ) x) as products,
      (select coalesce(json_agg(x.obj), '[]'::json) from (
        select json_build_object(
          'id', vr.variant_id,
          'productId', vr.product_id,
          'sku', vr.sku,
          'size', vr.size,
          'color', vr.color,
          'price', vr.price,
          'cost', vr.cost,
          'stock', vr.stock,
          'reorderPoint', vr.reorder_point,
          'safetyStock', vr.safety_stock,
          'recentSales', vr.recent_sales,
          'inbound', vr.inbound
        ) as obj
        from variant_rows vr
      ) x) as variants
  `
  const row = rows[0]
  return {
    categories: (row?.categories ?? []).map((item) => ({
      id: String(item.id),
      name: item.name,
    })),
    products: (row?.products ?? []).map((item) => ({
      id: String(item.id),
      name: item.name,
      category: item.category,
      description: item.description ?? '',
    })),
    variants: (row?.variants ?? []).map((item) => ({
      id: String(item.id),
      productId: String(item.productId),
      sku: item.sku,
      size: item.size,
      color: item.color,
      price: toNumber(item.price),
      cost: toNumber(item.cost),
      stock: toNumber(item.stock),
      reorderPoint: toNumber(item.reorderPoint),
      safetyStock: toNumber(item.safetyStock),
      recentSales: toNumber(item.recentSales),
      inbound: toNumber(item.inbound),
    })),
  }
}

type ActivityRow = {
  transactions: Array<{
    id: string
    type: string
    quantity: number
    remarks: string | null
    date: string
    sku: string
    balance: number
  }>
  sales: Array<{
    id: string
    reference: string
    channel: string
    date: string
    status: string
    total: number
    items: Array<{ id: string; sku: string; quantity: number; returned: number }>
  }>
  totalStock: number | string
  dailyChanges: Array<{ day: string; net: number }>
}

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Units on hand for each of the last 30 days, reconstructed from the ledger. */
function buildStockTimeline(currentTotal: number, changes: Array<{ day: string; net: number }>) {
  const netByDay = new Map<string, number>()
  for (const change of changes) {
    netByDay.set(change.day, (netByDay.get(change.day) ?? 0) + toNumber(change.net))
  }
  const totalNet = [...netByDay.values()].reduce((sum, net) => sum + net, 0)
  const timeline: Array<{ date: string; onHand: number }> = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let onHand = currentTotal - totalNet
  const start = new Date(today)
  start.setDate(start.getDate() - 29)
  for (let day = new Date(start); day <= today; day.setDate(day.getDate() + 1)) {
    const key = dayKey(day)
    onHand += netByDay.get(key) ?? 0
    timeline.push({ date: key, onHand: Math.max(0, onHand) })
  }
  return timeline
}

async function getActivity() {
  const rows = await sql<
    {
      transactions: ActivityRow['transactions']
      sales: ActivityRow['sales']
      totalStock: ActivityRow['totalStock']
      dailyChanges: ActivityRow['dailyChanges']
    }[]
  >`
    with txn as (
      select
        t.transaction_id,
        t.transaction_type,
        t.quantity,
        t.remarks,
        t.transaction_date,
        v.sku,
        sum(t.quantity) over (
          partition by t.variant_id
          order by t.transaction_date, t.transaction_id
          rows between unbounded preceding and current row
        ) as balance
      from public.inventory_transactions t
      join public.product_variants v on v.variant_id = t.variant_id
      order by t.transaction_date desc, t.transaction_id desc
      limit 100
    ),
    sale_list as (
      select * from public.sales
      order by sale_date desc, sale_id desc
      limit 100
    ),
    sale_item_rows as (
      select
        si.sale_id,
        si.sale_item_id,
        si.quantity,
        v.sku,
        coalesce((
          select sum(t.quantity)
          from public.inventory_transactions t
          where t.variant_id = si.variant_id
            and t.transaction_type = 'RETURN'
            and t.remarks like 'SALE_ITEM:' || si.sale_item_id || ' ::%'
        ), 0) as returned
      from public.sale_items si
      join public.product_variants v on v.variant_id = si.variant_id
      where si.sale_id in (select sale_id from sale_list)
    ),
    daily as (
      select
        date_trunc('day', transaction_date)::date as day,
        sum(quantity)::int as net
      from public.inventory_transactions
      where transaction_date >= now() - interval '30 days'
      group by 1
    )
    select
      (select coalesce(json_agg(x.obj), '[]'::json) from (
        select json_build_object(
          'id', t.transaction_id,
          'type', t.transaction_type,
          'quantity', t.quantity,
          'remarks', t.remarks,
          'date', t.transaction_date,
          'sku', t.sku,
          'balance', t.balance
        ) as obj
        from txn t
      ) x) as transactions,
      (select coalesce(json_agg(x.obj), '[]'::json) from (
        select json_build_object(
          'id', s.sale_id,
          'reference', s.order_reference,
          'channel', s.channel,
          'date', s.sale_date,
          'status', s.status,
          'total', s.total_amount,
          'items', coalesce((
            select json_agg(json_build_object(
              'id', i.sale_item_id,
              'sku', i.sku,
              'quantity', i.quantity,
              'returned', i.returned
            ) order by i.sale_item_id)
            from sale_item_rows i
            where i.sale_id = s.sale_id
          ), '[]'::json)
        ) as obj
        from sale_list s
      ) x) as sales,
      (select coalesce(sum(quantity_on_hand), 0) from public.inventory) as "totalStock",
      (select coalesce(json_agg(x.obj), '[]'::json) from (
        select json_build_object('day', to_char(d.day, 'YYYY-MM-DD'), 'net', d.net) as obj
        from daily d
        order by d.day
      ) x) as "dailyChanges"
  `
  const row = rows[0]
  const totalStock = toNumber(row?.totalStock)
  return {
    transactions: (row?.transactions ?? []).map((item) => ({
      id: String(item.id),
      type: item.type,
      quantity: toNumber(item.quantity),
      remarks: item.remarks,
      date: toISO(item.date) ?? new Date().toISOString(),
      sku: item.sku,
      balance: toNumber(item.balance),
    })),
    sales: (row?.sales ?? []).map((item) => ({
      id: String(item.id),
      reference: item.reference,
      channel: item.channel,
      date: toISO(item.date) ?? new Date().toISOString(),
      status: (item.status ?? '').toLowerCase(),
      total: toNumber(item.total),
      syncStatus: 'Manual',
      itemCount: (item.items ?? []).reduce((sum, line) => sum + toNumber(line.quantity), 0),
      items: (item.items ?? []).map((line) => ({
        id: String(line.id),
        sku: line.sku,
        quantity: toNumber(line.quantity),
        returnedQuantity: toNumber(line.returned),
      })),
    })),
    stockTimeline: buildStockTimeline(totalStock, row?.dailyChanges ?? []),
  }
}

type SupplyRow = {
  suppliers: Array<{
    id: string
    name: string
    contact: string
    phone: string
    leadTime: number
    status: string
  }>
  purchaseOrders: Array<{
    id: string
    number: string
    supplier: string
    createdByName: string | null
    status: string
    createdAt: string
    items: Array<{
      id: string
      variant: string
      variantId: string
      ordered: number
      received: number
      unitCost: number
    }>
  }>
  receipts: Array<{
    id: string
    number: string
    po: string | null
    quantity: number
    receivedAt: string
  }>
  users: Array<{
    id: string
    name: string
    email: string
    role: string
    status: string
  }>
}

async function getSupplyChain(): Promise<{
  suppliers: SupplyRow['suppliers']
  purchaseOrders: Array<{
    id: string
    number: string
    supplier: string
    createdByName: string | null
    status: string
    createdAt: string
    baseCost: number
    items: Array<{
      id: string
      purchaseOrderId: string
      variant: string
      variantId: string
      ordered: number
      received: number
      outstanding: number
      unitCost: number
      estimatedLandedUnitCost: number
    }>
  }>
  receipts: SupplyRow['receipts']
  users: Array<SupplyRow['users'][number] & { locations: string[] }>
}> {
  const rows = await sql<
    {
      suppliers: SupplyRow['suppliers']
      purchaseOrders: SupplyRow['purchaseOrders']
      receipts: SupplyRow['receipts']
      users: SupplyRow['users']
    }[]
  >`
    with po_list as (
      select
        po.purchase_order_id,
        po.po_number,
        s.supplier_name,
        creator.name as created_by_name,
        po.order_date,
        po.status
      from public.purchase_orders po
      left join public.suppliers s on s.supplier_id = po.supplier_id
      left join public.users creator on creator.user_id = po.created_by
      order by po.order_date desc, po.purchase_order_id desc
      limit 100
    ),
    po_item_rows as (
      select
        poi.purchase_order_id,
        poi.po_item_id,
        poi.variant_id,
        poi.quantity_ordered,
        poi.unit_cost,
        v.sku,
        coalesce((
          select sum(r.quantity_received)
          from public.po_receipts r
          where r.po_item_id = poi.po_item_id and r.status = 'Accepted'
        ), 0) as received
      from public.purchase_order_items poi
      join public.product_variants v on v.variant_id = poi.variant_id
      where poi.purchase_order_id in (select purchase_order_id from po_list)
    )
    select
      (select coalesce(json_agg(x.obj), '[]'::json) from (
        select json_build_object(
          'id', s.supplier_id,
          'name', s.supplier_name,
          'contact', coalesce(s.contact_person, '—'),
          'phone', s.contact_details,
          'leadTime', s.lead_time_days,
          'status', s.status
        ) as obj
        from public.suppliers s
        order by s.supplier_name
        limit 100
      ) x) as suppliers,
      (select coalesce(json_agg(x.obj), '[]'::json) from (
        select json_build_object(
          'id', po.purchase_order_id,
          'number', po.po_number,
          'supplier', coalesce(po.supplier_name, 'Unknown supplier'),
          'createdByName', po.created_by_name,
          'status', po.status,
          'createdAt', po.order_date,
          'items', coalesce((
            select json_agg(json_build_object(
              'id', i.po_item_id,
              'variant', i.sku,
              'variantId', i.variant_id,
              'ordered', i.quantity_ordered,
              'received', i.received,
              'unitCost', i.unit_cost
            ) order by i.po_item_id)
            from po_item_rows i
            where i.purchase_order_id = po.purchase_order_id
          ), '[]'::json)
        ) as obj
        from po_list po
      ) x) as "purchaseOrders",
      (select coalesce(json_agg(x.obj), '[]'::json) from (
        select json_build_object(
          'id', r.receipt_id,
          'po', po.po_number,
          'quantity', r.quantity_received,
          'receivedAt', r.received_date
        ) as obj
        from public.po_receipts r
        join public.purchase_order_items poi on poi.po_item_id = r.po_item_id
        join public.purchase_orders po on po.purchase_order_id = poi.purchase_order_id
        order by r.received_date desc, r.receipt_id desc
        limit 100
      ) x) as receipts,
      (select coalesce(json_agg(x.obj), '[]'::json) from (
        select json_build_object(
          'id', u.user_id,
          'name', u.name,
          'email', u.email,
          'role', u.role,
          'status', u.status
        ) as obj
        from public.users u
        order by u.name
        limit 100
      ) x) as users
  `
  const row = rows[0]
  return {
    suppliers: (row?.suppliers ?? []).map((item) => ({
      id: String(item.id),
      name: item.name,
      contact: item.contact,
      phone: item.phone,
      leadTime: toNumber(item.leadTime),
      status: item.status,
    })),
    purchaseOrders: (row?.purchaseOrders ?? []).map((item) => {
      const items = (item.items ?? []).map((line) => ({
        id: String(line.id),
        purchaseOrderId: String(item.id),
        variant: line.variant,
        variantId: String(line.variantId),
        ordered: toNumber(line.ordered),
        received: toNumber(line.received),
        outstanding: Math.max(0, toNumber(line.ordered) - toNumber(line.received)),
        unitCost: toNumber(line.unitCost),
        estimatedLandedUnitCost: toNumber(line.unitCost),
      }))
      const baseCost = items.reduce((sum, line) => sum + line.ordered * line.unitCost, 0)
      return {
        id: String(item.id),
        number: item.number,
        supplier: item.supplier,
        createdByName: item.createdByName ?? null,
        status: poStatusMap[item.status] ?? (item.status ?? '').toLowerCase(),
        expectedAt: null,
        createdAt: toISO(item.createdAt) ?? new Date().toISOString(),
        baseCost,
        additionalCost: 0,
        landedConfirmed: false,
        items,
      }
    }),
    receipts: (row?.receipts ?? []).map((item) => ({
      id: String(item.id),
      number: `RCPT-${String(item.id).padStart(4, '0')}`,
      po: item.po ?? '—',
      quantity: toNumber(item.quantity),
      receivedAt: toISO(item.receivedAt) ?? new Date().toISOString(),
    })),
    users: (row?.users ?? []).map((item) => ({
      id: String(item.id),
      name: item.name,
      email: item.email,
      role: item.role,
      status: item.status,
      locations: [],
    })),
  }
}
