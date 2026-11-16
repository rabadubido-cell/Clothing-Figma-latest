import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/backend/auth/session'
import { getOperationsData } from '@/backend/operations/data'
import { OperationsApp } from '../_components/operations/OperationsApp'

const sections = [
  'dashboard',
  'products',
  'inventory',
  'materials-production',
  'warehouses',
  'sales-returns',
  'suppliers',
  'purchase-orders',
  'planning',
  'reports',
  'integrations',
  'users',
  'scan',
]

// 'materials-production' and 'warehouses' are hidden for now — the schema has
// no backing tables yet. Uncomment here and in OperationsApp.tsx to re-enable.
const roleSections: Record<string, string[]> = {
  administrator: sections.filter((section) => section !== 'materials-production' && section !== 'warehouses'),
  manager: sections.filter(
    (section) => !['users', 'materials-production', 'warehouses'].includes(section),
  ),
  inventory: [
    'dashboard',
    'products',
    'inventory',
    // 'materials-production',
    // 'warehouses',
    'sales-returns',
    'suppliers',
    'purchase-orders',
    'planning',
    'reports',
    'integrations',
    'scan',
  ],
  procurement: [
    'dashboard',
    'products',
    'inventory',
    'suppliers',
    'purchase-orders',
    'planning',
    'reports',
    'integrations',
  ],
  sales: ['dashboard', 'products', 'inventory', 'sales-returns', 'reports', 'integrations'],
  production: [
    'dashboard',
    'products',
    'inventory',
    // 'materials-production',
    // 'warehouses',
    'reports',
    'scan',
  ],
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!sections.includes(section)) notFound()
  // Auth and data reads are independent, so they run in parallel to cut load time.
  const [user, data] = await Promise.all([getCurrentUser(), getOperationsData()])
  if (!user) redirect('/login')
  if (!roleSections[user.role]?.includes(section)) redirect('/dashboard')
  return <OperationsApp data={data} section={section} user={{ name: user.name, role: user.role }} />
}
