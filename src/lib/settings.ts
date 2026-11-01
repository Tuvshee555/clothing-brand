// Shapes of the editable store settings (database `settings` rows).

export interface StoreInfo {
  storeName: string
  tagline: string
  contactEmail: string
  contactHours: string
  announcement: string
  announcementEnabled: boolean
}

export interface Policy {
  title: string
  body: string
}

export type PolicyKey = 'delivery' | 'returns' | 'exchange' | 'ordering' | 'payment' | 'privacy'
export type Policies = Record<PolicyKey, Policy>

export const POLICY_SLUGS: Record<PolicyKey, string> = {
  delivery: 'delivery',
  returns: 'returns',
  exchange: 'exchange',
  ordering: 'how-to-order',
  payment: 'payment',
  privacy: 'privacy',
}

export interface SizeRow {
  size: string
  [measure: string]: string
}

export interface SizeGuide {
  tops: { columns: string[]; rows: SizeRow[] }
  bottoms: { columns: string[]; rows: SizeRow[] }
  note: string
}
