'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Factory,
  FileBarChart,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  PackageCheck,
  PackageOpen,
  Plus,
  QrCode,
  Search,
  Send,
  ShoppingBag,
  SlidersHorizontal,
  Trash2,
  Truck,
  Undo2,
  Users,
  Warehouse,
  X,
  XCircle,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { OperationsData } from '@/backend/operations/data'
import { InventoryActionPanel, type InventoryActionMode } from './inventory/InventoryActionPanel'
import { ProductCatalogPanel } from './products/ProductCatalogPanel'
import { AdjustStockPanel } from './inventory/AdjustStockPanel'
import { SaleEntryPanel } from './sales/SaleEntryPanel'
import { ReturnItemsPanel } from './sales/ReturnItemsPanel'
import { PurchaseOrderDraftPanel } from './purchase-orders/PurchaseOrderDraftPanel'
import { ReceiveItemsPanel } from './purchase-orders/ReceiveItemsPanel'
import { UserAccountPanel } from './users/UserAccountPanel'

const nav = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['products', 'Products', ShoppingBag],
  ['inventory', 'Inventory', Boxes],
  // Hidden until the schema has backing tables — see [section]/page.tsx.
  // ['materials-production', 'Materials & Production', Factory],
  // ['warehouses', 'Warehouses', Warehouse],
  ['sales-returns', 'Sales & Returns', CircleDollarSign],
  ['suppliers', 'Suppliers', Truck],
  ['purchase-orders', 'Purchase Orders', ClipboardList],
  ['planning', 'Planning', SlidersHorizontal],
  ['reports', 'Reports', FileBarChart],
  ['integrations', 'Integrations', Link2],
  ['users', 'Users', Users],
] as const

const titles: Record<string, [string, string]> = {
  dashboard: ['Operations overview', 'Exceptions, inventory health, WIP, and inbound activity.'],
  products: ['Products', 'Manage styles and scan the full style–color–size picture.'],
  inventory: ['Inventory', 'Available, reserved, inbound, and movement history by location.'],
  'materials-production': [
    'Materials & Production',
    'Allocate raw materials and move work orders toward finished goods.',
  ],
  warehouses: [
    'Warehouses & 3PL',
    'Balance stock across internal, partner, and returns locations.',
  ],
  'sales-returns': [
    'Sales & Returns',
    'Review channel orders and route returns by condition and destination.',
  ],
  suppliers: ['Suppliers', 'Lead times, MOQs, supplied variants, and purchasing performance.'],
  'purchase-orders': [
    'Purchase Orders',
    'Review suggested buys, approvals, receiving progress, and landed cost.',
  ],
  planning: [
    'Planning',
    'Compare planned buys, inbound stock, sales, and transparent assumptions.',
  ],
  reports: ['Reports', 'Operational views for inventory, production, procurement, and returns.'],
  integrations: [
    'Integrations',
    'Prototype connection states only — no external services are connected.',
  ],
  users: ['Users & Access', 'Assign operational roles and location-specific access.'],
  scan: ['Mobile scanner', 'Scanner-ready prototype for receiving, counts, and picking.'],
}

const roleLabels: Record<string, string> = {
  administrator: 'Administrator',
  inventory: 'Inventory Staff',
  sales: 'Sales Staff',
  procurement: 'Procurement Staff',
  manager: 'Manager / Owner',
  production: 'Production / Warehouse Staff',
}

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(
        new Date(value),
      )
    : 'Not set'
const money = (value: number) =>
  `${process.env.NEXT_PUBLIC_CURRENCY_SYMBOL ?? '¤'}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const human = (value: string) =>
  value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

function Status({ value }: { value: string }) {
  const key = value.toLowerCase()
  const tone =
    key.includes('not connected') || key.includes('not-connected')
      ? 'status-neutral'
      : key.includes('received') ||
          key.includes('connected') ||
          key.includes('complete') ||
          key === 'active' ||
          key === 'approved' ||
          key === 'healthy' ||
          key === 'success'
        ? 'status-green'
        : key.includes('pending') ||
            key.includes('syncing') ||
            key.includes('transit') ||
            key.includes('ready') ||
            key.includes('attention') ||
            key.includes('low')
          ? 'status-amber'
          : key.includes('error') ||
              key.includes('mismatch') ||
              key.includes('cancel') ||
              key.includes('rejected') ||
              key.includes('broken') ||
              key.includes('suspended') ||
              key.includes('short')
            ? 'status-red'
            : 'status-neutral'
  return (
    <span className={`status ${tone}`}>
      {tone === 'status-green' && <CheckCircle2 aria-hidden="true" size={11} />}
      {tone === 'status-amber' && <AlertTriangle aria-hidden="true" size={11} />}
      {tone === 'status-red' && <XCircle aria-hidden="true" size={11} />}
      {human(value)}
    </span>
  )
}

function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <PackageOpen aria-hidden="true" size={24} />
      <p className="mt-3 font-semibold text-slate-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

type DrawerState =
  | { type: 'po-draft'; sku?: string }
  | { type: 'return'; reference: string }
  | { type: 'sale-entry' }
  | { type: 'receive'; po: OperationsData['purchaseOrders'][number] }
  | { type: 'scan' }
  | {
      type: 'inventory-action'
      mode: InventoryActionMode
      productId?: string
      variantId?: string
    }
  | { type: 'catalog-form'; mode: 'product' | 'variant'; productId?: string }
  | { type: 'adjust-stock' }
  | {
      type: 'user-form'
      mode: 'create' | 'edit'
      target?: OperationsData['users'][number]
    }
  | null

export function OperationsApp({
  data,
  section,
  user,
}: {
  data: OperationsData
  section: string
  user: { name: string; role: string }
}) {
  const router = useRouter()
  const [mobileNav, setMobileNav] = useState(false)
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('All locations')
  const [drawer, setDrawer] = useState<DrawerState>(null)
  const [notice, setNotice] = useState('')

  const lowStock = data.variants.filter((item) => item.available <= item.reorderPoint)
  const totalUnits = data.variants.reduce((sum, item) => sum + item.stock, 0)
  const reservedUnits = data.variants.reduce((sum, item) => sum + item.reserved, 0)
  const inboundUnits = data.variants.reduce((sum, item) => sum + item.inbound, 0)
  const openPoUnits = data.purchaseOrders
    .filter((po) => !['received', 'rejected'].includes(po.status))
    .reduce((sum, po) => sum + po.items.reduce((acc, item) => acc + item.outstanding, 0), 0)

  async function logout() {
    await fetch('/api/app/logout', { method: 'POST' })
    router.replace('/login')
    router.refresh()
  }

  const roleAllowed = (key: string) => {
    if (key === 'users') return user.role === 'administrator'
    if (user.role === 'sales')
      return [
        'dashboard',
        'products',
        'inventory',
        'sales-returns',
        'reports',
        'integrations',
      ].includes(key)
    if (user.role === 'production')
      return [
        'dashboard',
        'products',
        'inventory',
        'materials-production',
        'warehouses',
        'reports',
      ].includes(key)
    if (user.role === 'procurement')
      return [
        'dashboard',
        'products',
        'inventory',
        'suppliers',
        'purchase-orders',
        'planning',
        'reports',
        'integrations',
      ].includes(key)
    return true
  }

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3200)
  }

  return (
    <div className="min-h-screen bg-[#f4f5f4] text-slate-950">
      <aside
        className={`sidebar ${mobileNav ? 'translate-x-0' : '-translate-x-full'} xl:translate-x-0`}
        data-app-sidebar
      >
        <div className="flex h-18 items-center justify-between px-5">
          <Link className="flex items-center gap-3" href="/dashboard">
            <span className="grid size-9 place-items-center rounded-[11px] bg-teal-300 font-bold text-slate-950">
              T
            </span>
            <div>
              <p className="font-semibold tracking-[-0.02em] text-white">Threadline</p>
              <p className="text-[11px] text-slate-400">Apparel operations</p>
            </div>
          </Link>
          <button
            aria-label="Close navigation"
            className="icon-button text-white xl:hidden"
            onClick={() => setMobileNav(false)}
          >
            <X size={19} />
          </button>
        </div>
        <nav aria-label="Primary navigation" className="mt-3 overflow-y-auto px-3 pb-4">
          {nav
            .filter(([key]) => roleAllowed(key))
            .map(([key, label, Icon]) => (
              <Link
                className={`nav-link ${section === key ? 'nav-link-active' : ''}`}
                href={`/${key}`}
                key={key}
                onClick={() => setMobileNav(false)}
              >
                <Icon aria-hidden="true" size={17} strokeWidth={section === key ? 2 : 1.65} />
                {label}
              </Link>
            ))}
        </nav>
        <div className="mt-auto border-t border-white/8 p-3">
          {['administrator', 'inventory', 'manager', 'production'].includes(user.role) && (
            <button
              className="mb-2 flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-teal-200 hover:bg-white/8"
              onClick={() => setDrawer({ type: 'scan' })}
              type="button"
            >
              <QrCode aria-hidden="true" size={17} />
              Open scanner
            </button>
          )}
          <div className="rounded-xl bg-white/6 p-3">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {roleLabels[user.role] ?? human(user.role)}
            </p>
            <button
              className="mt-3 flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-sm text-slate-400 hover:bg-white/8 hover:text-white"
              onClick={logout}
              type="button"
            >
              <LogOut aria-hidden="true" size={16} /> Sign out
            </button>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          aria-label="Close navigation overlay"
          className="fixed inset-0 z-30 bg-slate-950/35 lg:hidden"
          onClick={() => setMobileNav(false)}
        />
      )}

      <div className="xl:pl-[252px]" data-app-content>
        <header className="topbar">
          <button
            aria-label="Open navigation"
            className="icon-button xl:hidden"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={20} />
          </button>
          <div className="relative hidden w-full max-w-md sm:block">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={17}
            />
            <input
              aria-label="Global search"
              className="search-field"
              placeholder="Search styles, SKUs, POs, locations…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400 xl:block">
              ⌘ K
            </kbd>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label className="location-select">
              <Building2 aria-hidden="true" size={15} />
              <span className="sr-only">Inventory location</span>
              <select value={location} onChange={(event) => setLocation(event.target.value)}>
                <option>All locations</option>
                {data.locations.map((item) => (
                  <option key={item.id}>{item.name}</option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" size={14} />
            </label>
            <button aria-label="Notifications, 3 unread" className="icon-button relative">
              <Bell size={18} />
              <span className="absolute right-2 top-2 size-2 rounded-full bg-amber-500 ring-2 ring-white" />
            </button>
            <button aria-label="Open user menu" className="user-avatar">
              {user.name
                .split(' ')
                .map((part) => part[0])
                .slice(0, 2)
                .join('')}
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-[1580px] px-4 py-6 sm:px-7 lg:px-9 lg:py-8">
          <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-teal-700">
                <span>{formatDate(new Date().toISOString())}</span>
                <span aria-hidden="true" className="text-slate-300">
                  /
                </span>
                <span>{location}</span>
              </div>
              <h1 className="mt-2 text-balance text-[30px] font-semibold leading-tight tracking-[-0.035em] text-slate-950 sm:text-[34px]">
                {titles[section]?.[0] ?? 'Operations'}
              </h1>
              <p className="mt-2 max-w-2xl text-pretty text-sm leading-6 text-slate-500">
                {titles[section]?.[1]}
              </p>
            </div>
          </header>

          {section === 'dashboard' && (
            <Dashboard
              data={data}
              inboundUnits={inboundUnits}
              lowStock={lowStock}
              openPoUnits={openPoUnits}
              reservedUnits={reservedUnits}
              totalUnits={totalUnits}
              onDraftPO={(sku) => setDrawer({ type: 'po-draft', sku })}
            />
          )}
          {section === 'products' && (
            <ProductsView
              data={data}
              query={query}
              role={user.role}
              onDelete={(productId) =>
                setDrawer({ type: 'inventory-action', mode: 'delete-product', productId })
              }
              onAddProduct={() => setDrawer({ type: 'catalog-form', mode: 'product' })}
              onAddVariant={(productId) =>
                setDrawer({ type: 'catalog-form', mode: 'variant', productId })
              }
              onReplenish={(sku) => setDrawer({ type: 'po-draft', sku })}
              onStockIn={(productId, variantId) =>
                setDrawer({ type: 'inventory-action', mode: 'stock-in', productId, variantId })
              }
            />
          )}
          {section === 'inventory' && (
            <InventoryView
              data={data}
              location={location}
              onAdjustStock={() => setDrawer({ type: 'adjust-stock' })}
              onQrStockIn={() => setDrawer({ type: 'inventory-action', mode: 'qr-stock-in' })}
              role={user.role}
            />
          )}
          {/* Hidden until the schema has backing tables.
          {section === 'materials-production' && <MaterialsProductionView data={data} />}
          {section === 'warehouses' && <WarehousesView data={data} />}
          */}
          {section === 'sales-returns' && (
            <SalesReturnsView
              data={data}
              onRecordSale={() => setDrawer({ type: 'sale-entry' })}
              onReturn={(reference) => setDrawer({ type: 'return', reference })}
            />
          )}
          {section === 'suppliers' && <SuppliersView data={data} />}
          {section === 'purchase-orders' && (
            <PurchaseOrdersView
              data={data}
              onNew={() => setDrawer({ type: 'po-draft' })}
              onReceive={(po) => setDrawer({ type: 'receive', po })}
              role={user.role}
              onNotice={showNotice}
            />
          )}
          {section === 'planning' && (
            <PlanningView data={data} onDraftPO={(sku) => setDrawer({ type: 'po-draft', sku })} />
          )}
          {section === 'reports' && <ReportsView data={data} />}
          {section === 'integrations' && <IntegrationsView data={data} />}
          {section === 'users' && (
            <UsersView
              data={data}
              onCreate={() => setDrawer({ type: 'user-form', mode: 'create' })}
              onEdit={(target) => setDrawer({ type: 'user-form', mode: 'edit', target })}
            />
          )}
          {section === 'scan' && (
            <ScannerView data={data} onComplete={showNotice} role={user.role} />
          )}
        </main>
      </div>

      {drawer?.type === 'po-draft' && (
        <Drawer
          onClose={() => setDrawer(null)}
          subtitle="Create a draft that stays pending until a manager approves it"
          title="Draft purchase order"
        >
          <PurchaseOrderDraftPanel
            data={data}
            initialSku={drawer.sku}
            onClose={() => setDrawer(null)}
            onComplete={showNotice}
            role={user.role}
          />
        </Drawer>
      )}
      {drawer?.type === 'sale-entry' && (
        <Drawer
          compact
          onClose={() => setDrawer(null)}
          subtitle="Record a completed order against live stock balances"
          title="Record sale"
        >
          <SaleEntryPanel
            data={data}
            onClose={() => setDrawer(null)}
            onComplete={showNotice}
            role={user.role}
          />
        </Drawer>
      )}
      {drawer?.type === 'return' && (
        <Drawer
          compact
          onClose={() => setDrawer(null)}
          subtitle={`${drawer.reference} · restock returned units`}
          title="Process return"
        >
          <ReturnItemsPanel
            data={data}
            reference={drawer.reference}
            onClose={() => setDrawer(null)}
            onComplete={showNotice}
            role={user.role}
          />
        </Drawer>
      )}
      {drawer?.type === 'receive' && (
        <Drawer
          compact
          onClose={() => setDrawer(null)}
          subtitle={`${drawer.po.number} · record accepted quantities per line`}
          title="Receive purchase order"
        >
          <ReceiveItemsPanel
            po={drawer.po}
            onClose={() => setDrawer(null)}
            onComplete={showNotice}
            role={user.role}
          />
        </Drawer>
      )}
      {drawer?.type === 'scan' && (
        <Drawer
          compact
          onClose={() => setDrawer(null)}
          subtitle="Read product, variant, quantity, and size from a box label"
          title="QR stock in"
        >
          <InventoryActionPanel
            data={data}
            mode="qr-stock-in"
            onClose={() => setDrawer(null)}
            onComplete={showNotice}
            role={user.role}
          />
        </Drawer>
      )}
      {drawer?.type === 'inventory-action' && (
        <Drawer
          compact
          onClose={() => setDrawer(null)}
          subtitle={
            drawer.mode === 'stock-in'
              ? 'Increase a variant through an audited stock event'
              : 'Permanently remove a product that has no variants'
          }
          title={drawer.mode === 'stock-in' ? 'Stock in' : 'Delete product'}
        >
          <InventoryActionPanel
            data={data}
            mode={drawer.mode}
            onClose={() => setDrawer(null)}
            onComplete={showNotice}
            productId={drawer.productId}
            role={user.role}
            variantId={drawer.variantId}
          />
        </Drawer>
      )}
      {drawer?.type === 'catalog-form' && (
        <Drawer
          onClose={() => setDrawer(null)}
          subtitle={
            drawer.mode === 'product'
              ? 'Create a clothing style, then add its size and color variants'
              : 'Create one size and color SKU with an independent stock balance'
          }
          title={drawer.mode === 'product' ? 'Add product' : 'Add variant'}
        >
          <ProductCatalogPanel
            data={data}
            mode={drawer.mode}
            onClose={() => setDrawer(null)}
            onComplete={showNotice}
            productId={drawer.productId}
          />
        </Drawer>
      )}
      {drawer?.type === 'adjust-stock' && (
        <Drawer
          compact
          onClose={() => setDrawer(null)}
          subtitle="A reason and audit reference are required"
          title="Adjust stock"
        >
          <AdjustStockPanel
            data={data}
            onClose={() => setDrawer(null)}
            onComplete={showNotice}
            role={user.role}
          />
        </Drawer>
      )}
      {drawer?.type === 'user-form' && (
        <Drawer
          compact
          onClose={() => setDrawer(null)}
          subtitle={
            drawer.mode === 'create'
              ? 'Creates a Supabase Auth login plus a staff record in one step'
              : 'Update the name, role, and access of this account'
          }
          title={drawer.mode === 'create' ? 'Create staff account' : 'Edit staff account'}
        >
          <UserAccountPanel
            mode={drawer.mode}
            onClose={() => setDrawer(null)}
            onComplete={showNotice}
            target={drawer.target}
          />
        </Drawer>
      )}
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 aria-hidden="true" size={18} />
          <span>{notice}</span>
          <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  )
}

function Dashboard({
  data,
  totalUnits,
  reservedUnits,
  inboundUnits,
  openPoUnits,
  lowStock,
  onDraftPO,
}: {
  data: OperationsData
  totalUnits: number
  reservedUnits: number
  inboundUnits: number
  openPoUnits: number
  lowStock: OperationsData['variants']
  onDraftPO: (sku: string) => void
}) {
  const brokenRuns = new Set(lowStock.map((item) => item.productId)).size
  const openOrders = data.purchaseOrders.filter(
    (po) => !['received', 'rejected'].includes(po.status),
  )
  const recentSales = data.sales.reduce((sum, sale) => sum + sale.itemCount, 0)
  const grossSales = data.sales.reduce((sum, sale) => sum + sale.total, 0)
  const channelTotals = new Map<string, number>()
  for (const sale of data.sales) {
    channelTotals.set(sale.channel, (channelTotals.get(sale.channel) ?? 0) + sale.total)
  }
  const channelColors = ['#0d9488', '#0ea5e9', '#fbbf24', '#94a3b8', '#fb7185']
  const channelMix = [...channelTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([channel, total], index) => ({
      color: channelColors[index % channelColors.length],
      label: channel,
      percent: grossSales ? Math.round((total / grossSales) * 100) : 0,
      value: total,
    }))
    .slice(0, 5)
  return (
    <div className="space-y-6">
      <section aria-label="Inventory summary" className="kpi-band">
        <Metric label="Units in stock" value={totalUnits} detail={`${reservedUnits} reserved`} />
        <Metric
          label="Low-stock variants"
          value={lowStock.length}
          detail={`${brokenRuns} ${brokenRuns === 1 ? 'style requires' : 'styles require'} action`}
          alert
        />
        <Metric label="Broken size runs" value={brokenRuns} detail={`${lowStock.length} variants low`} alert />
        <Metric
          label="Open purchase orders"
          value={openOrders.length}
          detail={`${openPoUnits} units inbound`}
        />
        <Metric
          label="Returns processed"
          value={data.transactions.filter((item) => item.type === 'return').length}
          detail="Recorded return events"
        />
        <Metric
          label="Recorded sales"
          value={data.sales.length}
          detail={`${recentSales} units · ${money(grossSales)} gross`}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.42fr_.58fr]">
        <section className="surface">
          <SectionHeading
            action={<Link href="/inventory">View all inventory</Link>}
            subtitle="Live balances from the inventory table"
            title="Inventory health"
          />
          <div className="grid gap-6 px-5 pb-5 md:grid-cols-[1.5fr_.75fr]">
            <div className="chart-shell">
              <div className="chart-grid" />
              <StockTimelineChart timeline={data.stockTimeline} />
              <div className="chart-axis">
                <span>{formatDate(data.stockTimeline[0]?.date ?? null)}</span>
                <span>Today</span>
              </div>
            </div>
            <div className="space-y-3 self-center">
              <ChartLegend
                color="bg-teal-600"
                label="On hand"
                value={totalUnits}
              />
              <ChartLegend color="bg-sky-400" label="Inbound" value={inboundUnits} />
              <ChartLegend color="bg-amber-400" label="Reserved" value={reservedUnits} />
              <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                The line tracks total units on hand across the last 30 days, reconstructed from
                the inventory ledger.
              </div>
            </div>
          </div>
        </section>
        <section className="surface">
          <SectionHeading subtitle="Share of recorded sales by channel" title="Sales mix" />
          {channelMix.length ? (
            <div className="space-y-5 px-5 pb-5">
              <div className="pie-wrap">
                <svg
                  aria-label="Sales mix by channel"
                  role="img"
                  viewBox="0 0 120 120"
                >
                  {(() => {
                    const radius = 44
                    const circumference = 2 * Math.PI * radius
                    let offset = circumference * 0.25
                    return channelMix.map((item) => {
                      const length = grossSales ? (item.value / grossSales) * circumference : 0
                      const dash = `${Math.max(length - 2, 0)} ${circumference - Math.max(length - 2, 0)}`
                      const element = (
                        <circle
                          cx="60"
                          cy="60"
                          fill="none"
                          key={item.label}
                          r={radius}
                          stroke={item.color}
                          strokeDasharray={dash}
                          strokeDashoffset={offset}
                          strokeLinecap="butt"
                          strokeWidth="16"
                        />
                      )
                      offset -= length
                      return element
                    })
                  })()}
                </svg>
                <div className="pie-center">
                  <strong>{money(grossSales)}</strong>
                  <span>gross sales</span>
                </div>
              </div>
              <div className="space-y-2">
                {channelMix.map((item) => (
                  <div className="flex items-center gap-3 text-sm" key={item.label}>
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: item.color }}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                      {item.label}
                    </span>
                    <span className="tabular text-slate-500">{item.percent}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty
              body="Record a sale to see the channel mix build up."
              title="No sales recorded yet"
            />
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <section className="surface">
          <SectionHeading
            subtitle="Low availability and broken size runs"
            title="Exceptions requiring attention"
          />
          <div className="divide-y divide-slate-100">
            {lowStock.slice(0, 5).map((item) => (
              <div className="exception-row" key={item.id}>
                <span className="exception-icon">
                  <AlertTriangle size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {item.product} · {item.color} / {item.size}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.available} available · reorder at {item.reorderPoint}
                  </p>
                </div>
                <Status value={item.available === 0 ? 'Broken size run' : 'Low stock'} />
                <button className="text-action" onClick={() => onDraftPO(item.sku)}>
                  Draft PO
                </button>
              </div>
            ))}
            {!lowStock.length && (
              <p className="px-5 py-6 text-sm text-slate-500">
                Every variant is above its reorder point.
              </p>
            )}
          </div>
        </section>
        <section className="surface">
          <SectionHeading subtitle="Purchase orders in flight" title="Inbound shipments" />
          <div className="divide-y divide-slate-100 px-5">
            {data.purchaseOrders.slice(0, 4).map((po) => (
              <div className="flex items-center gap-4 py-4" key={po.id}>
                <span className="grid size-9 place-items-center rounded-lg bg-sky-50 text-sky-700">
                  <Truck size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{po.number}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {po.supplier} · created {formatDate(po.createdAt)}
                  </p>
                </div>
                <Status value={po.status} />
              </div>
            ))}
            {!data.purchaseOrders.length && (
              <p className="py-6 text-sm text-slate-500">No purchase orders yet.</p>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DataList
          empty="No movements yet"
          rows={data.transactions.slice(0, 5).map((item) => ({
            title: `${item.sku} · ${human(item.type)}`,
            detail: `${item.location} · ${item.reference || item.reason}`,
            end: `${item.quantity > 0 ? '+' : ''}${item.quantity}`,
          }))}
          subtitle="Latest inventory-changing events"
          title="Recent stock movements"
        />
        <DataList
          empty="No integrations configured"
          rows={data.integrations
            .slice(0, 5)
            .map((integration) => ({
              title: integration.name,
              detail: integration.result,
              node: <Status value={integration.status} />,
            }))}
          subtitle="Connect external services later"
          title="Integration status"
        />
      </div>
    </div>
  )
}

function ProductsView({
  data,
  query,
  role,
  onDelete,
  onAddProduct,
  onAddVariant,
  onReplenish,
  onStockIn,
}: {
  data: OperationsData
  query: string
  role: string
  onDelete: (productId: string) => void
  onAddProduct: () => void
  onAddVariant: (productId: string) => void
  onReplenish: (sku: string) => void
  onStockIn: (productId: string, variantId: string) => void
}) {
  const canDelete = ['administrator', 'manager'].includes(role)
  const canStockIn = ['administrator', 'inventory', 'manager', 'production'].includes(role)
  const canCreate = ['administrator', 'inventory', 'manager'].includes(role)
  const filtered = data.products.filter((product) =>
    `${product.name} ${product.styleCode} ${product.category}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  )
  const [selectedID, setSelectedID] = useState(filtered[0]?.id ?? '')
  const selected = data.products.find((product) => product.id === selectedID) ?? filtered[0]
  const variants = data.variants.filter((variant) => variant.productId === selected?.id)

  const selectProduct = (productId: string) => {
    setSelectedID(productId)
    window.setTimeout(() => {
      document.getElementById('product-detail')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 0)
  }

  if (!data.products.length) {
    return (
      <section className="surface">
        <Empty
          body="Create a product style and its size and color variants to start the catalog."
          title="No products yet"
        />
      </section>
    )
  }

  return (
    <div className="products-showcase space-y-6">
      <section className="surface">
        <div className="product-showcase-toolbar">
          <div>
            <p className="text-sm font-semibold text-slate-950">Product catalog</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              {filtered.length} {filtered.length === 1 ? 'style' : 'styles'} · select a card
              to inspect its variants
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreate && (
              <button className="primary-button" onClick={onAddProduct} type="button">
                <Plus size={15} /> Add product
              </button>
            )}
          </div>
        </div>

        {filtered.length ? (
          <div className="product-card-grid">
            {filtered.map((product) => {
              const productVariants = data.variants.filter(
                (variant) => variant.productId === product.id,
              )
              const lowCount = productVariants.filter(
                (variant) => variant.available <= variant.reorderPoint,
              ).length
              const available = productVariants.reduce((sum, variant) => sum + variant.available, 0)
              const sizes = [...new Set(productVariants.map((variant) => variant.size))]
              return (
                <button
                  aria-pressed={selected?.id === product.id}
                  className={`product-card group ${selected?.id === product.id ? 'product-card-selected' : ''}`}
                  key={product.id}
                  onClick={() => selectProduct(product.id)}
                  type="button"
                >
                  <span className="product-card-media">
                    <span className="product-card-placeholder">
                      <span>{product.name.slice(0, 2).toUpperCase()}</span>
                      <small>{product.category}</small>
                    </span>
                    <span className="product-card-status">
                      <Status value={lowCount ? `${lowCount} low stock` : 'Healthy'} />
                    </span>
                  </span>
                  <span className="product-card-body">
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0 text-left">
                        <strong>{product.name}</strong>
                        <small>
                          {product.styleCode} · {product.category}
                        </small>
                      </span>
                      <ArrowRight className="shrink-0 text-slate-300" size={17} />
                    </span>
                    <span className="product-card-stats">
                      <span>
                        <b>{productVariants.length}</b>
                        <small>Variants</small>
                      </span>
                      <span>
                        <b>{available}</b>
                        <small>Available</small>
                      </span>
                    </span>
                    <span className="product-size-chips">
                      {sizes.length ? (
                        sizes.map((size) => <i key={size}>{size}</i>)
                      ) : (
                        <small>No sizes configured</small>
                      )}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <Empty
            body="Try a different search in the top navigation."
            title="No matching products"
          />
        )}
      </section>

      {selected && (
        <div className="product-detail space-y-6" id="product-detail">
          <section className="product-detail-hero surface">
            <div className="product-detail-heading">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">
                    {selected.styleCode}
                  </p>
                  <Status value={selected.status} />
                </div>
                <h2>{selected.name}</h2>
                <p>{selected.category}</p>
              </div>
              <div className="product-detail-actions">
                {canCreate && (
                  <button
                    className="primary-button"
                    onClick={() => onAddVariant(selected.id)}
                    type="button"
                  >
                    <Plus size={15} /> Add variant
                  </button>
                )}
                {canDelete && (
                  <button
                    className="secondary-button text-red-700"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Permanently delete ${selected.name}? This only succeeds when the product has no variants.`,
                        )
                      ) {
                        onDelete(selected.id)
                      }
                    }}
                    type="button"
                  >
                    <Trash2 size={15} /> Delete
                  </button>
                )}
              </div>
            </div>

            <div className="product-detail-overview">
              <div className="product-status-panel flex-1">
                <div>
                  <p className="product-eyebrow">Product status</p>
                  <h3>Inventory by variant</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {selected.description ||
                      'Track every size and color independently. Stock changes are recorded against one SKU at a time.'}
                  </p>
                </div>
                <div className="product-summary-stats">
                  <div>
                    <span>Variants</span>
                    <strong>{variants.length}</strong>
                  </div>
                  <div>
                    <span>On hand</span>
                    <strong>{variants.reduce((sum, variant) => sum + variant.stock, 0)}</strong>
                  </div>
                  <div>
                    <span>Available</span>
                    <strong>{variants.reduce((sum, variant) => sum + variant.available, 0)}</strong>
                  </div>
                  <div>
                    <span>Low stock</span>
                    <strong>
                      {
                        variants.filter((variant) => variant.available <= variant.reorderPoint)
                          .length
                      }
                    </strong>
                  </div>
                </div>
                <div className="rounded-xl bg-teal-50 p-4 text-sm leading-6 text-teal-900">
                  <strong className="block">Variant stock stays separate</strong>
                  <span className="mt-1 block text-teal-800">
                    Adding stock to one size or color never changes another variant.
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="surface">
            <SectionHeading
              action={
                <span className="text-xs font-medium text-slate-500">{variants.length} SKUs</span>
              }
              subtitle="Each size and color has its own stock balance and replenishment action"
              title="Variants & size inventory"
            />
            {variants.length ? (
              <div className="variant-card-grid">
                {variants.map((variant) => {
                  const low = variant.available <= variant.reorderPoint
                  return (
                    <article className="variant-stock-card" key={variant.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-500">
                            {variant.sku}
                          </p>
                          <h3>
                            {variant.color} · Size {variant.size}
                          </h3>
                        </div>
                        <Status value={low ? 'Low stock' : 'Healthy'} />
                      </div>
                      <div className="variant-balance">
                        <span>On hand</span>
                        <strong>{variant.stock}</strong>
                        <small>units for this variant only</small>
                      </div>
                      <div className="variant-stock-grid">
                        <div>
                          <span>Reserved</span>
                          <strong>{variant.reserved}</strong>
                        </div>
                        <div>
                          <span>Available</span>
                          <strong className={low ? 'text-amber-700' : ''}>
                            {variant.available}
                          </strong>
                        </div>
                        <div>
                          <span>Inbound</span>
                          <strong>{variant.inbound}</strong>
                        </div>
                        <div>
                          <span>Reorder at</span>
                          <strong>{variant.reorderPoint}</strong>
                        </div>
                      </div>
                      <div className="variant-card-actions">
                        {canStockIn && (
                          <button
                            className="primary-button justify-center"
                            onClick={() => onStockIn(selected.id, variant.id)}
                            type="button"
                          >
                            <PackageCheck size={15} /> Add stock
                          </button>
                        )}
                        {low && (
                          <button
                            className="secondary-button justify-center"
                            onClick={() => onReplenish(variant.sku)}
                            type="button"
                          >
                            <ClipboardList size={15} /> Replenish
                          </button>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            ) : (
              <Empty
                body="Add size and color variants before receiving stock."
                title="No variants configured"
              />
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function InventoryView({
  data,
  location,
  onAdjustStock,
  onQrStockIn,
  role,
}: {
  data: OperationsData
  location: string
  onAdjustStock: () => void
  onQrStockIn: () => void
  role: string
}) {
  const [view, setView] = useState<'By variant' | 'By product'>('By variant')
  const [search, setSearch] = useState('')
  const needle = search.trim().toLowerCase()

  const variants = data.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    product: variant.product,
    color: variant.color,
    size: variant.size,
    onHand: variant.stock,
    reserved: variant.reserved,
    available: variant.available,
    inbound: variant.inbound,
    reorderPoint: variant.reorderPoint,
  }))

  // The search filters both views: by SKU/product/size/color, or by product name.
  const filteredVariants = needle
    ? variants.filter((item) =>
        `${item.sku} ${item.product} ${item.color} ${item.size}`.toLowerCase().includes(needle),
      )
    : variants

  // Group the same filtered variants into product rows for "By product".
  const productRows = [...new Set(filteredVariants.map((item) => item.product))].map((product) => {
    const lines = filteredVariants.filter((item) => item.product === product)
    return {
      product,
      variants: lines.length,
      onHand: lines.reduce((sum, item) => sum + item.onHand, 0),
      available: lines.reduce((sum, item) => sum + item.available, 0),
      inbound: lines.reduce((sum, item) => sum + item.inbound, 0),
      low: lines.filter((item) => item.available <= item.reorderPoint).length,
    }
  })
  void location
  return (
    <div className="space-y-6">
      <section className="surface">
        <Toolbar>
          <Segmented
            options={['By variant', 'By product']}
            value={view}
            onChange={(next) => setView(next as 'By variant' | 'By product')}
          />
          <label className="relative block w-full max-w-xs">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              aria-label="Search inventory"
              className="search-field"
              placeholder="Search SKU, product, size, color…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="flex gap-2">
            {['administrator', 'inventory', 'manager', 'production'].includes(role) && (
              <button className="primary-button" onClick={onQrStockIn} type="button">
                <QrCode size={15} /> Scan box QR
              </button>
            )}
            {['administrator', 'inventory', 'manager'].includes(role) && (
              <button className="secondary-button" onClick={onAdjustStock}>
                <SlidersHorizontal size={15} /> Adjust stock
              </button>
            )}
          </div>
        </Toolbar>
        {view === 'By variant' ? (
          <Table
            columns={[
              'Variant',
              'Product',
              'On hand',
              'Reserved',
              'Available',
              'Inbound',
              'Reorder',
            ]}
            rows={filteredVariants.map((item) => [
              <div key="variant">
                <strong>{item.sku}</strong>
                <small>
                  {item.color} / {item.size}
                </small>
              </div>,
              item.product,
              item.onHand,
              item.reserved,
              <strong
                className={item.available <= item.reorderPoint ? 'text-amber-700' : ''}
                key="available"
              >
                {item.available}
              </strong>,
              item.inbound,
              item.reorderPoint,
            ])}
            empty={
              needle ? (
                <Empty
                  title="No matching variants"
                  body={`Nothing matches “${search}”. Try a SKU, product name, size, or color.`}
                />
              ) : (
                <Empty
                  title="No stock balances yet"
                  body="Add variants to products and receive inventory to populate stock."
                />
              )
            }
          />
        ) : (
          <Table
            columns={['Product', 'Variants', 'On hand', 'Available', 'Inbound', 'Low stock']}
            rows={productRows.map((item) => [
              <strong key="product">{item.product}</strong>,
              item.variants,
              item.onHand,
              item.available,
              item.inbound,
              item.low ? (
                <Status key="low" value={`${item.low} low`} />
              ) : (
                <Status key="ok" value="Healthy" />
              ),
            ])}
            empty={
              needle ? (
                <Empty
                  title="No matching products"
                  body={`Nothing matches “${search}”. Try a product name or SKU.`}
                />
              ) : (
                <Empty
                  title="No stock yet"
                  body="Add variants to products and receive inventory to populate stock."
                />
              )
            }
          />
        )}
      </section>
      <section className="surface">
        <SectionHeading
          subtitle="Sales, returns, adjustments, and receipts recorded in inventory_transactions"
          title="Stock movement history"
        />
        <Table
          columns={['Date', 'Variant', 'Event', 'Location', 'Reference', 'Change', 'Balance']}
          rows={data.transactions.map((item) => [
            formatDate(item.date),
            <strong key="sku">{item.sku}</strong>,
            <Status key="type" value={item.type} />,
            item.destination ? `${item.location} → ${item.destination}` : item.location,
            item.reference,
            <strong className={item.quantity > 0 ? 'text-emerald-700' : 'text-red-700'} key="qty">
              {item.quantity > 0 ? '+' : ''}
              {item.quantity}
            </strong>,
            item.balance,
          ])}
          empty={<Empty title="No movements yet" body="Stock events will appear here." />}
        />
      </section>
    </div>
  )
}

function MaterialsProductionView({ data }: { data: OperationsData }) {
  return (
    <div className="space-y-6">
      <section className="surface">
        <SectionHeading
          subtitle="Fabric, trims, and packaging available for production"
          title="Raw materials"
        />
        <Table
          columns={['Material', 'Type', 'On hand', 'Reserved', 'Available', 'Reorder at', 'Status']}
          rows={data.materials.map((item) => [
            <div key="material">
              <strong>{item.name}</strong>
              <small>{item.code}</small>
            </div>,
            human(item.type),
            `${item.onHand} ${human(item.unit)}`,
            item.reserved,
            item.available,
            item.reorderPoint,
            <Status
              key="status"
              value={item.available <= item.reorderPoint ? 'Low stock' : 'Healthy'}
            />,
          ])}
          empty={
            <Empty
              title="No materials tracked yet"
              body="Material stock tables are not part of the current database schema."
            />
          }
        />
      </section>
      <section className="surface">
        <SectionHeading subtitle="Open production work" title="Work orders" />
        <Empty
          title="No work orders tracked yet"
          body="Production work-order tables are not part of the current database schema."
        />
      </section>
    </div>
  )
}

function WarehousesView({ data }: { data: OperationsData }) {
  return (
    <div className="space-y-6">
      <section className="surface">
        <SectionHeading
          subtitle="Internal, partner, and returns locations"
          title="Locations"
        />
        <Empty
          title="No locations configured yet"
          body="Location and transfer tables are not part of the current database schema. Stock is tracked in a single warehouse."
        />
      </section>
      <section className="surface">
        <SectionHeading
          subtitle="Source, destination, items, and handoff status"
          title="Stock transfers"
        />
        <Table
          columns={['Transfer', 'Route', 'Units', 'Shipped', 'Status', 'Next step']}
          rows={data.transfers.map((transfer) => [
            <strong key="number">{transfer.number}</strong>,
            `${transfer.source} → ${transfer.destination}`,
            transfer.itemCount,
            formatDate(transfer.shippedAt),
            <Status key="status" value={transfer.status} />,
            transfer.status === 'in-transit' ? 'Confirm receipt' : 'Prepare shipment',
          ])}
          empty={
            <Empty
              title="No transfers recorded"
              body="Transfers will appear here once location tracking is added."
            />
          }
        />
      </section>
    </div>
  )
}

function SalesReturnsView({
  data,
  onRecordSale,
  onReturn,
}: {
  data: OperationsData
  onRecordSale: () => void
  onReturn: (reference: string) => void
}) {
  const returnedUnits = data.transactions
    .filter((item) => item.type === 'return')
    .reduce((sum, item) => sum + item.quantity, 0)
  return (
    <div className="space-y-6">
      <section className="surface">
        <Toolbar>
          <Segmented
            options={['All sales']}
            value="All sales"
            onChange={() => {}}
          />
          <button className="primary-button" onClick={onRecordSale}>
            <Plus size={15} /> Record sale
          </button>
        </Toolbar>
        <Table
          columns={['Order', 'Channel', 'Date', 'Items', 'Total', 'Order status', 'Sync', '']}
          rows={data.sales.map((sale) => [
            <strong key="order">{sale.reference}</strong>,
            sale.channel,
            formatDate(sale.date),
            sale.itemCount,
            money(sale.total),
            <Status key="status" value={sale.status} />,
            <Status key="sync" value={sale.syncStatus} />,
            <button className="text-action" key="return" onClick={() => onReturn(sale.reference)}>
              Process return
            </button>,
          ])}
          empty={
            <Empty
              title="No sales recorded yet"
              body="Use Record sale to book a completed order against live stock."
            />
          }
        />
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface p-5">
          <h2 className="font-semibold text-slate-950">Return summary</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Returned units are recorded in the inventory ledger and increase the variant stock
            balance when they are restocked.
          </p>
          <div className="mt-5 space-y-3">
            <div className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-slate-100 text-slate-600">
                <Undo2 size={14} />
              </span>
              <span className="flex-1 text-sm font-medium">Units returned</span>
              <strong className="tabular">{returnedUnits}</strong>
            </div>
          </div>
        </section>
        <section className="surface p-5">
          <h2 className="font-semibold text-slate-950">Sales recorded</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Every sale deducts stock from the exact variant and writes an audited inventory
            transaction you can trace in the stock movement history.
          </p>
          <div className="mt-5 flex items-center gap-3 rounded-lg bg-teal-50 p-3 text-sm text-teal-900">
            <ShoppingBag size={17} />
            {data.sales.length} orders · {data.sales.reduce((sum, sale) => sum + sale.itemCount, 0)}{' '}
            units sold
          </div>
        </section>
      </div>
    </div>
  )
}

function SuppliersView({ data }: { data: OperationsData }) {
  const [selectedID, setSelectedID] = useState(data.suppliers[0]?.id ?? '')
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <section className="surface">
        <SectionHeading
          subtitle="Contacts, lead times, MOQs, and supplied variants"
          title="Supplier directory"
        />
        <Table
          columns={['Supplier', 'Contact', 'Contact details', 'Lead time', 'Open POs', 'Status']}
          rows={data.suppliers.map((supplier) => [
            <button className="text-left" key="supplier" onClick={() => setSelectedID(supplier.id)}>
              <strong>{supplier.name}</strong>
              <small>{supplier.contact}</small>
            </button>,
            supplier.contact,
            supplier.phone,
            `${supplier.leadTime} days`,
            data.purchaseOrders.filter(
              (po) => po.supplier === supplier.name && po.status !== 'received',
            ).length,
            <Status key="status" value="Active" />,
          ])}
        />
      </section>
      <aside className="surface self-start p-5">
        <p className="text-xs font-medium text-teal-700">Supplier profile</p>
        <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em]">
          {data.suppliers.find((item) => item.id === selectedID)?.name}
        </h2>
        <dl className="mt-5 space-y-4 text-sm">
          <Detail
            label="Lead time"
            value={`${data.suppliers.find((item) => item.id === selectedID)?.leadTime ?? 0} days`}
          />
          <Detail
            label="Contact"
            value={data.suppliers.find((item) => item.id === selectedID)?.contact ?? '—'}
          />
          <Detail
            label="Contact details"
            value={data.suppliers.find((item) => item.id === selectedID)?.phone ?? '—'}
          />
          <Detail
            label="Status"
            value={data.suppliers.find((item) => item.id === selectedID)?.status ?? 'Active'}
          />
        </dl>
      </aside>
    </div>
  )
}

function PurchaseOrdersView({
  data,
  onNew,
  onReceive,
  role,
  onNotice,
}: {
  data: OperationsData
  onNew: () => void
  onReceive: (po: OperationsData['purchaseOrders'][number]) => void
  role: string
  onNotice: (message: string) => void
}) {
  const [selectedID, setSelectedID] = useState(data.purchaseOrders[0]?.id ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const selected = data.purchaseOrders.find((po) => po.id === selectedID) ?? data.purchaseOrders[0]
  const status = selected?.status ?? ''
  const manager = role === 'manager'
  const canReceive = ['administrator', 'inventory', 'manager'].includes(role)

  async function runDecision(action: string) {
    if (!selected) return
    setPending(true)
    setError('')
    try {
      const response = await fetch('/api/app/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'purchase-order-decision',
          decision: action,
          purchaseOrderId: selected.id,
        }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Unable to update this order.')
      onNotice(`${selected.number} ${action === 'approve' ? 'approved' : `${action}ed`}.`)
      router.refresh()
    } catch (decisionError) {
      setError(
        decisionError instanceof Error ? decisionError.message : 'Unable to continue.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
      <section className="surface self-start">
        <Toolbar>
          <Segmented options={['All', 'Approval', 'Inbound']} value="All" onChange={() => {}} />
          <button className="secondary-button" onClick={onNew}>
            <Plus size={15} /> New draft
          </button>
        </Toolbar>
        <div className="divide-y divide-slate-100">
          {data.purchaseOrders.map((po) => (
            <button
              className={`po-list-row ${selected?.id === po.id ? 'po-list-row-active' : ''}`}
              key={po.id}
              onClick={() => setSelectedID(po.id)}
            >
              <div className="min-w-0 flex-1 text-left">
                <strong>{po.number}</strong>
                <small>
                  {po.supplier} · created {formatDate(po.createdAt)}
                </small>
              </div>
              <div className="text-right">
                <Status value={po.status} />
                <small className="mt-1">{money(po.baseCost)}</small>
              </div>
            </button>
          ))}
          {!data.purchaseOrders.length && (
            <p className="px-1 py-4 text-sm text-slate-500">No purchase orders yet.</p>
          )}
        </div>
      </section>
      {selected && (
        <section className="surface">
          <div className="border-b border-slate-100 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-[-0.02em]">{selected.number}</h2>
                  <Status value={status} />
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {selected.supplier}
                  {selected.createdByName ? ` · drafted by ${selected.createdByName}` : ''}
                </p>
              </div>
              {canReceive && !['Draft', 'Pending Approval'].includes(status) && (
                <button className="primary-button" onClick={() => onReceive(selected)}>
                  <PackageCheck size={15} /> Receive stock
                </button>
              )}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-1">
              {['draft', 'pending-approval', 'approved', 'ordered', 'partially-received', 'received'].map(
                (step, index, all) => (
                  <div className="flex items-center" key={step}>
                    <span className={`po-step ${step === status ? 'po-step-active' : ''}`}>
                      {human(step)}
                    </span>
                    {index < all.length - 1 && (
                      <ArrowRight className="mx-1 text-slate-300" size={13} />
                    )}
                  </div>
                ),
              )}
            </div>
          </div>
          <Table
            columns={['Variant', 'Ordered', 'Received', 'Outstanding', 'Unit cost', 'Line total']}
            rows={selected.items.map((item) => [
              <strong key="variant">{item.variant}</strong>,
              item.ordered,
              item.received,
              item.outstanding,
              money(item.unitCost),
              money(item.ordered * item.unitCost),
            ])}
            empty={
              <Empty title="No line items" body="This draft has no items attached yet." />
            }
          />
          <div className="border-t border-slate-100 p-5">
            <h3 className="text-sm font-semibold">Approval flow</h3>
            <div className="mt-3 flex gap-3 text-xs text-slate-500">
              <span className="grid size-7 place-items-center rounded-full bg-emerald-50 text-emerald-700">
                <Check size={13} />
              </span>
              <p className="leading-5">
                {selected.createdByName
                  ? `Draft prepared by ${selected.createdByName}. `
                  : ''}
                {status === 'pending-approval'
                  ? 'A manager decision is required before ordering.'
                  : `Current status: ${human(status)}.`}
              </p>
            </div>
            {error && <p className="form-error">{error}</p>}
            {manager && status === 'draft' && (
              <div className="mt-5 flex justify-end">
                <button
                  className="primary-button"
                  disabled={pending}
                  onClick={() => runDecision('submit')}
                >
                  <Send size={15} /> Submit for approval
                </button>
              </div>
            )}
            {manager && status === 'pending-approval' && (
              <div className="mt-5 flex justify-end gap-2">
                <button
                  className="secondary-button text-red-700"
                  disabled={pending}
                  onClick={() => runDecision('reject')}
                >
                  <X size={15} /> Reject
                </button>
                <button
                  className="primary-button"
                  disabled={pending}
                  onClick={() => runDecision('approve')}
                >
                  <Check size={15} /> Approve order
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function PlanningView({
  data,
  onDraftPO,
}: {
  data: OperationsData
  onDraftPO: (sku: string) => void
}) {
  return (
    <div className="space-y-6">
      <section className="surface">
        <Toolbar>
          <Segmented options={['All variants']} value="All variants" onChange={() => {}} />
        </Toolbar>
        <Table
          columns={[
            'Style / Variant',
            'On hand',
            'Inbound',
            '30-day sales',
            'Remaining',
            'Suggested reorder',
            '',
          ]}
          rows={data.variants.map((item) => {
            const recentSales = item.recentSales
            const remaining = item.stock + item.inbound - recentSales
            const suggested = Math.max(
              0,
              item.reorderPoint + item.safetyStock + recentSales - item.stock - item.inbound,
            )
            return [
              <div key="style">
                <strong>{item.product}</strong>
                <small>{item.sku}</small>
              </div>,
              item.stock,
              item.inbound,
              recentSales,
              remaining,
              <strong className={suggested > 0 ? 'text-amber-700' : ''} key="suggested">
                {suggested}
              </strong>,
              <button
                className="text-action"
                key="draft"
                onClick={() => onDraftPO(item.sku)}
                disabled={suggested === 0}
              >
                Review
              </button>,
            ]
          })}
          empty={
            <Empty
              title="No variants to plan for"
              body="Add product variants and record sales to see reorder suggestions."
            />
          }
        />
      </section>
      <section className="surface p-5">
        <div className="flex items-start gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-700">
            <BarChart3 size={18} />
          </span>
          <div>
            <h2 className="font-semibold">Visible planning assumptions</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              Suggestions use the last 30 days of recorded sales, each variant's reorder point and
              safety stock, current stock on hand, and inbound purchase-order quantities. They are
              directional planning aids — not certain predictions — and never create or send an
              order automatically.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function ReportsView({ data }: { data: OperationsData }) {
  const [active, setActive] = useState<string | null>(null)
  const lowVariants = data.variants.filter((variant) => variant.available <= variant.reorderPoint)

  const reports: Array<{
    id: string
    title: string
    detail: string
    group: string
    count: number
  }> = [
    {
      id: 'stock-by-variant',
      title: 'Stock by variant',
      detail: 'On hand, available, inbound, and reorder quantities',
      group: 'Inventory',
      count: data.variants.length,
    },
    {
      id: 'broken-size-runs',
      title: 'Broken size runs',
      detail: 'Variants at or below their reorder point, grouped by style',
      group: 'Merchandising',
      count: new Set(lowVariants.map((variant) => variant.productId)).size,
    },
    {
      id: 'sales-by-channel',
      title: 'Sales by channel',
      detail: 'Recorded sales grouped by sales channel',
      group: 'Sales',
      count: data.sales.length,
    },
    {
      id: 'stock-movements',
      title: 'Stock movements',
      detail: 'Adjustments, receipts, sales, cancellations, and returns',
      group: 'Inventory',
      count: data.transactions.length,
    },
    {
      id: 'supplier-performance',
      title: 'Supplier performance',
      detail: 'Contacts, lead times, and open order counts',
      group: 'Procurement',
      count: data.suppliers.length,
    },
    {
      id: 'purchase-orders',
      title: 'Purchase orders',
      detail: 'Value, approval status, and outstanding units',
      group: 'Procurement',
      count: data.purchaseOrders.length,
    },
    {
      id: 'returns',
      title: 'Returns',
      detail: 'Returned units recorded in the inventory ledger',
      group: 'Sales',
      count: data.transactions.filter((item) => item.type === 'return').length,
    },
    {
      id: 'goods-receipts',
      title: 'Goods receipts',
      detail: 'Receipts recorded against purchase orders',
      group: 'Procurement',
      count: data.receipts.length,
    },
  ]

  if (active) {
    const report = reports.find((item) => item.id === active)
    if (!report) return null
    return (
      <div className="space-y-6">
        <div>
          <button className="secondary-button" onClick={() => setActive(null)} type="button">
            ‹ All reports
          </button>
        </div>
        <section className="surface">
          <SectionHeading
            action={<Status value={report.group} />}
            subtitle={report.detail}
            title={report.title}
          />
          {report.id === 'stock-by-variant' && (
            <Table
              columns={['Variant', 'Product', 'On hand', 'Available', 'Inbound', 'Reorder at']}
              rows={data.variants.map((variant) => [
                <div key="sku">
                  <strong>{variant.sku}</strong>
                  <small>
                    {variant.color} / {variant.size}
                  </small>
                </div>,
                variant.product,
                variant.stock,
                variant.available,
                variant.inbound,
                variant.reorderPoint,
              ])}
              empty={<Empty title="No variants yet" body="Add variants to populate this report." />}
            />
          )}
          {report.id === 'broken-size-runs' && (
            <Table
              columns={['Style', 'Variant', 'Available', 'Reorder at', 'Short by']}
              rows={lowVariants
                .sort((a, b) => a.available - b.available)
                .map((variant) => [
                  variant.product,
                  <div key="sku">
                    <strong>{variant.sku}</strong>
                    <small>
                      {variant.color} / {variant.size}
                    </small>
                  </div>,
                  variant.available,
                  variant.reorderPoint,
                  <strong className="text-red-700" key="short">
                    {variant.reorderPoint - variant.available}
                  </strong>,
                ])}
              empty={
                <Empty
                  title="No broken size runs"
                  body="Every variant is above its reorder point."
                />
              }
            />
          )}
          {report.id === 'sales-by-channel' && (
            <SalesByChannelReport sales={data.sales} />
          )}
          {report.id === 'stock-movements' && (
            <Table
              columns={['Date', 'Variant', 'Event', 'Change', 'Balance', 'Reference']}
              rows={data.transactions.map((item) => [
                formatDate(item.date),
                <strong key="sku">{item.sku}</strong>,
                <Status key="type" value={item.type} />,
                <strong
                  className={item.quantity > 0 ? 'text-emerald-700' : 'text-red-700'}
                  key="qty"
                >
                  {item.quantity > 0 ? '+' : ''}
                  {item.quantity}
                </strong>,
                item.balance,
                item.reference || item.reason,
              ])}
              empty={<Empty title="No movements yet" body="Stock events will appear here." />}
            />
          )}
          {report.id === 'supplier-performance' && (
            <Table
              columns={['Supplier', 'Contact', 'Contact details', 'Lead time', 'Open POs', 'Outstanding units']}
              rows={data.suppliers.map((supplier) => {
                const open = data.purchaseOrders.filter(
                  (po) => po.supplier === supplier.name && !['received'].includes(po.status),
                )
                return [
                  <div key="supplier">
                    <strong>{supplier.name}</strong>
                    <small>{supplier.contact}</small>
                  </div>,
                  supplier.contact,
                  supplier.phone,
                  `${supplier.leadTime} days`,
                  open.length,
                  open.reduce(
                    (sum, po) => sum + po.items.reduce((acc, item) => acc + item.outstanding, 0),
                    0,
                  ),
                ]
              })}
              empty={<Empty title="No suppliers yet" body="Add suppliers to populate this report." />}
            />
          )}
          {report.id === 'purchase-orders' && (
            <Table
              columns={['PO', 'Supplier', 'Status', 'Created', 'Value', 'Outstanding units']}
              rows={data.purchaseOrders.map((po) => [
                <strong key="po">{po.number}</strong>,
                po.supplier,
                <Status key="status" value={po.status} />,
                formatDate(po.createdAt),
                money(po.baseCost),
                po.items.reduce((sum, item) => sum + item.outstanding, 0),
              ])}
              empty={<Empty title="No purchase orders yet" body="Draft a PO to populate this report." />}
            />
          )}
          {report.id === 'returns' && (
            <Table
              columns={['Date', 'Variant', 'Units returned', 'Reason', 'Reference']}
              rows={data.transactions
                .filter((item) => item.type === 'return')
                .map((item) => [
                  formatDate(item.date),
                  <strong key="sku">{item.sku}</strong>,
                  item.quantity,
                  item.reason || 'Product return',
                  item.reference,
                ])}
              empty={
                <Empty title="No returns recorded" body="Processed returns will appear here." />
              }
            />
          )}
          {report.id === 'goods-receipts' && (
            <Table
              columns={['Receipt', 'Purchase order', 'Units received', 'Received at']}
              rows={data.receipts.map((receipt) => [
                <strong key="receipt">{receipt.number}</strong>,
                receipt.po,
                receipt.quantity,
                formatDate(receipt.receivedAt),
              ])}
              empty={
                <Empty
                  title="No receipts recorded"
                  body="Receipts recorded against purchase orders will appear here."
                />
              }
            />
          )}
        </section>
      </div>
    )
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {reports.map((report) => (
        <button
          className="report-row report-row-clickable"
          key={report.id}
          onClick={() => setActive(report.id)}
          type="button"
        >
          <span className="report-icon">
            <FileBarChart size={18} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <strong>{report.title}</strong>
            <small>{report.detail}</small>
          </span>
          <span className="text-right">
            <Status value={report.group} />
            <small className="mt-2 block">{report.count}</small>
          </span>
        </button>
      ))}
    </div>
  )
}

function SalesByChannelReport({ sales }: { sales: OperationsData['sales'] }) {
  const byChannel = new Map<string, { orders: number; units: number; revenue: number }>()
  for (const sale of sales) {
    const entry = byChannel.get(sale.channel) ?? { orders: 0, units: 0, revenue: 0 }
    entry.orders += 1
    entry.units += sale.itemCount
    entry.revenue += sale.total
    byChannel.set(sale.channel, entry)
  }
  const totalRevenue = [...byChannel.values()].reduce((sum, entry) => sum + entry.revenue, 0)
  return (
    <Table
      columns={['Channel', 'Orders', 'Units', 'Revenue', 'Share']}
      rows={[...byChannel.entries()]
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .map(([channel, entry]) => [
          <strong key="channel">{channel}</strong>,
          entry.orders,
          entry.units,
          money(entry.revenue),
          `${totalRevenue ? Math.round((entry.revenue / totalRevenue) * 100) : 0}%`,
        ])}
      empty={<Empty title="No sales recorded yet" body="Record a sale to populate this report." />}
    />
  )
}

function IntegrationsView({ data }: { data: OperationsData }) {
  return (
    <div className="space-y-6">
      <div className="prototype-warning">
        <AlertTriangle aria-hidden="true" size={18} />
        <div>
          <strong>No integrations connected</strong>
          <p>
            External platforms (e-commerce, marketplaces, accounting) are not connected yet. The
            database is the single source of truth for now.
          </p>
        </div>
      </div>
      <section className="surface">
        <SectionHeading
          subtitle="Connection states will appear here"
          title="Connected services"
        />
        {data.integrations.length ? (
          <div className="integration-grid">
            {data.integrations.map((integration) => (
              <section className="integration-card" key={integration.id}>
                <div className="flex items-start justify-between gap-3">
                  <span className="integration-logo">
                    {integration.name.slice(0, 2).toUpperCase()}
                  </span>
                  <Status value={integration.status} />
                </div>
                <h2>{integration.name}</h2>
                <p>{human(integration.category)}</p>
              </section>
            ))}
          </div>
        ) : (
          <Empty
            title="No integrations configured"
            body="Connect e-commerce, marketplace, or accounting services when you're ready."
          />
        )}
      </section>
    </div>
  )
}

function UsersView({
  data,
  onCreate,
  onEdit,
}: {
  data: OperationsData
  onCreate: () => void
  onEdit: (target: OperationsData['users'][number]) => void
}) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function runStatusToggle(target: OperationsData['users'][number]) {
    const nextStatus = target.status === 'Active' ? 'Inactive' : 'Active'
    const action = nextStatus === 'Inactive'
      ? 'deactivate'
      : 'reactivate'
    setPendingId(target.id)
    setError('')
    try {
      const response = await fetch('/api/app/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-user', userId: target.id, status: nextStatus }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error ?? `Unable to ${action} this account.`)
      router.refresh()
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Unable to continue.')
    } finally {
      setPendingId(null)
    }
  }

  async function removeUser(target: OperationsData['users'][number]) {
    if (
      !window.confirm(
        `Permanently delete ${target.name}'s account (${target.email})? The Supabase Auth login is removed too.`,
      )
    ) {
      return
    }
    setPendingId(target.id)
    setError('')
    try {
      const response = await fetch('/api/app/operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-user', userId: target.id }),
      })
      const result = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Unable to delete this account.')
      router.refresh()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to continue.')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <section className="surface">
      <Toolbar>
        <Segmented options={['All accounts']} value="All accounts" onChange={() => {}} />
        <button className="primary-button" onClick={onCreate} type="button">
          <Plus size={15} /> Add account
        </button>
      </Toolbar>
      {error && <p className="form-error mx-5">{error}</p>}
      <Table
        columns={['Staff member', 'Role', 'Status', 'Actions']}
        rows={data.users.map((user) => [
          <div key="user">
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </div>,
          roleLabels[user.role] ?? human(user.role),
          <Status key="status" value={user.status} />,
          <div className="flex flex-wrap gap-2" key="actions">
            <button
              className={`text-action ${user.status === 'Active' ? 'text-amber-700' : ''}`}
              disabled={pendingId === user.id}
              onClick={() => runStatusToggle(user)}
              type="button"
            >
              {user.status === 'Active' ? 'Deactivate' : 'Activate'}
            </button>
            <button
              className="text-action"
              disabled={pendingId === user.id}
              onClick={() => onEdit(user)}
              type="button"
            >
              Edit
            </button>
            <button
              className="text-action text-red-700"
              disabled={pendingId === user.id}
              onClick={() => removeUser(user)}
              type="button"
            >
              Delete
            </button>
          </div>,
        ])}
        empty={
          <Empty
            title="No staff accounts"
            body="Create the first account so teammates can sign in."
          />
        }
      />
      <p className="px-5 pb-5 text-xs leading-5 text-slate-500">
        Inactive accounts cannot sign in: their login is rejected while they remain deactivated.
        Your own account cannot be deactivated or deleted from here while you are signed in.
      </p>
    </section>
  )
}

function ScannerView({
  data,
  onComplete,
  role,
}: {
  data: OperationsData
  onComplete: (message: string) => void
  role: string
}) {
  return (
    <section className="surface p-5">
      <InventoryActionPanel data={data} mode="qr-stock-in" onComplete={onComplete} role={role} />
    </section>
  )
}

function Metric({
  label,
  value,
  detail,
  alert,
}: {
  label: string
  value: number
  detail: string
  alert?: boolean
}) {
  return (
    <div className="metric">
      <p>{label}</p>
      <strong className={`tabular ${alert ? 'text-amber-600' : ''}`}>{value}</strong>
      <span>{detail}</span>
    </div>
  )
}

function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle: string
  action?: React.ReactNode
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  )
}

function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="toolbar">{children}</div>
}

function Table({
  columns,
  rows,
  empty,
  pageSize = 10,
}: {
  columns: string[]
  rows: React.ReactNode[][]
  empty?: React.ReactNode
  /** Rows per page. All tables are capped at 10 rows by default. */
  pageSize?: number
}) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  // Keep the page in range when the row count shrinks (filters, deletes…).
  const currentPage = Math.min(page, pageCount)
  if (currentPage !== page) {
    setPage(currentPage)
  }
  const visible = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  if (!rows.length && empty) return empty
  return (
    <div className="table-block">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="table-pager">
          <button
            className="pager-button"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
            type="button"
          >
            ‹ Prev
          </button>
          <span className="pager-status">
            Page {currentPage} of {pageCount} · {rows.length} rows
          </span>
          <button
            className="pager-button"
            disabled={currentPage >= pageCount}
            onClick={() => setPage(currentPage + 1)}
            type="button"
          >
            Next ›
          </button>
        </div>
      )}
    </div>
  )
}

function DataList({
  title,
  subtitle,
  rows,
  empty,
}: {
  title: string
  subtitle: string
  rows: Array<{ title: string; detail: string; end?: string; node?: React.ReactNode }>
  empty: string
}) {
  return (
    <section className="surface">
      <SectionHeading subtitle={subtitle} title={title} />
      {rows.length ? (
        <div className="divide-y divide-slate-100 px-5">
          {rows.map((row) => (
            <div className="flex items-center gap-4 py-4" key={`${row.title}-${row.detail}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{row.title}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{row.detail}</p>
              </div>
              {row.node ?? <strong className="tabular">{row.end}</strong>}
            </div>
          ))}
        </div>
      ) : (
        <Empty title={empty} body="New activity will appear here." />
      )}
    </section>
  )
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map((option) => (
        <button
          aria-selected={option === value}
          className={option === value ? 'segmented-active' : ''}
          key={option}
          onClick={() => onChange(option)}
          role="tab"
        >
          {option}
        </button>
      ))}
    </div>
  )
}

function Drawer({
  title,
  subtitle,
  children,
  onClose,
  compact,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  onClose: () => void
  compact?: boolean
}) {
  const dialogRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const inertNodes = [
      document.querySelector('[data-app-sidebar]'),
      document.querySelector('[data-app-content]'),
    ].filter(Boolean) as HTMLElement[]
    inertNodes.forEach((node) => node.setAttribute('inert', ''))
    const dialog = dialogRef.current
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]',
    )
    focusable?.[0]?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab' && focusable?.length) {
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      inertNodes.forEach((node) => node.removeAttribute('inert'))
      previous?.focus()
    }
  }, [onClose])
  return (
    <div className="drawer-layer" role="presentation">
      <button aria-label="Close panel" className="drawer-scrim" onClick={onClose} />
      <section
        aria-label={title}
        aria-modal="true"
        className={`drawer ${compact ? 'drawer-compact' : ''}`}
        ref={dialogRef}
        role="dialog"
      >
        <header className="drawer-header">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button aria-label="Close panel" className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </section>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-1 font-medium text-slate-800">{value}</dd>
    </div>
  )
}

function ChartLegend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`size-2.5 rounded-full ${color}`} />
      <span className="flex-1 text-sm text-slate-600">{label}</span>
      <strong className="tabular">{value}</strong>
    </div>
  )
}

/** Line graph of total units on hand for the last 30 days (from the ledger). */
function StockTimelineChart({
  timeline,
}: {
  timeline: Array<{ date: string; onHand: number }>
}) {
  if (timeline.length < 2) {
    return (
      <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 300 120">
        <text fill="rgb(100 116 139)" fontSize="10" x="12" y="20">
          Not enough ledger history to draw a trend yet.
        </text>
      </svg>
    )
  }
  const width = 300
  const height = 120
  const pad = 10
  const values = timeline.map((point) => point.onHand)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = timeline.map((point, index) => {
    const x = (index / (timeline.length - 1)) * width
    const y = height - pad - ((point.onHand - min) / span) * (height - 2 * pad)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const line = points.join(' ')
  const area = `0,${height} ${line} ${width},${height}`
  return (
    <svg
      aria-label="Units on hand over the last 30 days"
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      <polygon fill="rgba(13, 148, 136, 0.14)" points={area} />
      <polyline
        fill="none"
        points={line}
        stroke="#0d9488"
        strokeLinejoin="round"
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
