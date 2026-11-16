export const roles = [
  'administrator',
  'inventory',
  'sales',
  'procurement',
  'manager',
  'production',
] as const

export type StaffRole = (typeof roles)[number]

/** Maps the Supabase `users.role` values to the app's internal role keys. */
export const roleToStaffRole: Record<string, StaffRole> = {
  Administrator: 'administrator',
  'Inventory Staff': 'inventory',
  'Sales Staff': 'sales',
  'Procurement Staff': 'procurement',
  Manager: 'manager',
}

export type AppUser = {
  id: string
  authId: string
  name: string
  email: string
  role: StaffRole
  status: 'active'
}
