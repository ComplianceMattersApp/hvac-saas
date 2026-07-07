import type { SupabaseClient } from '@supabase/supabase-js'

export const ACCOUNT_WORKSHARE_CONNECTION_STATUSES = ['pending', 'active', 'disabled', 'revoked'] as const
export const ACCOUNT_WORKSHARE_SERVICE_TYPES = ['ecc_hers'] as const

export type AccountWorkshareConnectionStatus = (typeof ACCOUNT_WORKSHARE_CONNECTION_STATUSES)[number]
export type AccountWorkshareServiceType = (typeof ACCOUNT_WORKSHARE_SERVICE_TYPES)[number]

export type AccountWorkshareConnectionRow = {
  id: string
  sender_account_id: string | null
  receiver_account_id: string
  service_type: AccountWorkshareServiceType
  status: AccountWorkshareConnectionStatus
  invite_email: string | null
  invite_company_name: string | null
  invite_token_hash: string | null
  invited_by_user_id: string
  accepted_by_user_id: string | null
  disabled_by_user_id: string | null
  revoked_by_user_id: string | null
  created_at: string
  accepted_at: string | null
  disabled_at: string | null
  revoked_at: string | null
  updated_at: string
}

type AccountWorkshareConnectionQueryError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

function cleanString(value: unknown) {
  return String(value ?? '').trim()
}

function cleanNullableString(value: unknown) {
  const normalized = cleanString(value)
  return normalized.length > 0 ? normalized : null
}

function normalizeStatus(value: unknown): AccountWorkshareConnectionStatus | null {
  const normalized = cleanString(value).toLowerCase()
  return ACCOUNT_WORKSHARE_CONNECTION_STATUSES.includes(normalized as AccountWorkshareConnectionStatus)
    ? (normalized as AccountWorkshareConnectionStatus)
    : null
}

function normalizeServiceType(value: unknown): AccountWorkshareServiceType | null {
  const normalized = cleanString(value).toLowerCase()
  return ACCOUNT_WORKSHARE_SERVICE_TYPES.includes(normalized as AccountWorkshareServiceType)
    ? (normalized as AccountWorkshareServiceType)
    : null
}

function isMissingAccountWorkshareConnectionsTable(error: AccountWorkshareConnectionQueryError | null | undefined): boolean {
  if (!error) {
    return false
  }

  const message = [error.message, error.details, error.hint]
    .map((entry) => cleanString(entry).toLowerCase())
    .filter(Boolean)
    .join(' ')

  if (!message.includes('account_workshare_connections')) {
    return false
  }

  return error.code === '42P01'
    || error.code === 'PGRST205'
    || message.includes('not found')
    || message.includes('does not exist')
    || message.includes('schema cache')
}

export function normalizeAccountWorkshareConnectionRow(value: any): AccountWorkshareConnectionRow | null {
  const id = cleanString(value?.id)
  const receiverAccountId = cleanString(value?.receiver_account_id)
  const serviceType = normalizeServiceType(value?.service_type)
  const status = normalizeStatus(value?.status)
  const invitedByUserId = cleanString(value?.invited_by_user_id)
  const createdAt = cleanString(value?.created_at)
  const updatedAt = cleanString(value?.updated_at)

  if (!id || !receiverAccountId || !serviceType || !status || !invitedByUserId || !createdAt || !updatedAt) {
    return null
  }

  return {
    id,
    sender_account_id: cleanNullableString(value?.sender_account_id),
    receiver_account_id: receiverAccountId,
    service_type: serviceType,
    status,
    invite_email: cleanNullableString(value?.invite_email),
    invite_company_name: cleanNullableString(value?.invite_company_name),
    invite_token_hash: cleanNullableString(value?.invite_token_hash),
    invited_by_user_id: invitedByUserId,
    accepted_by_user_id: cleanNullableString(value?.accepted_by_user_id),
    disabled_by_user_id: cleanNullableString(value?.disabled_by_user_id),
    revoked_by_user_id: cleanNullableString(value?.revoked_by_user_id),
    created_at: createdAt,
    accepted_at: cleanNullableString(value?.accepted_at),
    disabled_at: cleanNullableString(value?.disabled_at),
    revoked_at: cleanNullableString(value?.revoked_at),
    updated_at: updatedAt,
  }
}

async function fetchAccountWorkshareConnectionRows(
  supabase: SupabaseClient,
  queryBuilder: (client: SupabaseClient) => Promise<{ data: AccountWorkshareConnectionRow[] | null; error: AccountWorkshareConnectionQueryError | null }>,
): Promise<AccountWorkshareConnectionRow[]> {
  const { data, error } = await queryBuilder(supabase)

  if (error) {
    if (isMissingAccountWorkshareConnectionsTable(error)) {
      return []
    }

    throw error
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => normalizeAccountWorkshareConnectionRow(row))
    .filter((row): row is AccountWorkshareConnectionRow => row !== null)
}

export async function listAccountWorkshareConnectionsForAccount(
  supabase: SupabaseClient,
  accountOwnerUserId: string | null | undefined,
  options?: {
    serviceType?: AccountWorkshareServiceType | null
    statuses?: AccountWorkshareConnectionStatus[] | null
    limit?: number | null
  },
): Promise<AccountWorkshareConnectionRow[]> {
  const normalizedAccountOwnerUserId = cleanString(accountOwnerUserId)
  if (!normalizedAccountOwnerUserId) {
    return []
  }

  const serviceType = normalizeServiceType(options?.serviceType ?? null)
  const statuses = Array.isArray(options?.statuses)
    ? options.statuses.map((status) => normalizeStatus(status)).filter((status): status is AccountWorkshareConnectionStatus => status !== null)
    : []
  const safeLimit = Math.max(1, Math.min(500, Number(options?.limit ?? 100)))

  return fetchAccountWorkshareConnectionRows(supabase, async (client) => {
    let query = client
      .from('account_workshare_connections')
      .select('*')
      .or(`sender_account_id.eq.${normalizedAccountOwnerUserId},receiver_account_id.eq.${normalizedAccountOwnerUserId}`)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(safeLimit)

    if (serviceType) {
      query = query.eq('service_type', serviceType)
    }

    if (statuses.length > 0) {
      query = query.in('status', statuses)
    }

    const { data, error } = await query
    return { data: (data ?? []) as AccountWorkshareConnectionRow[], error }
  })
}

export async function listRaterWorkshareConnectionsForSender(
  supabase: SupabaseClient,
  senderAccountId: string | null | undefined,
): Promise<AccountWorkshareConnectionRow[]> {
  const normalizedSenderAccountId = cleanString(senderAccountId)
  if (!normalizedSenderAccountId) {
    return []
  }

  return fetchAccountWorkshareConnectionRows(supabase, async (client) => {
    const { data, error } = await client
      .from('account_workshare_connections')
      .select('*')
      .eq('sender_account_id', normalizedSenderAccountId)
      .eq('service_type', 'ecc_hers')
      .in('status', ['pending', 'active'])
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })

    return { data: (data ?? []) as AccountWorkshareConnectionRow[], error }
  })
}

export async function listSenderWorkshareConnectionsForReceiver(
  supabase: SupabaseClient,
  receiverAccountId: string | null | undefined,
): Promise<AccountWorkshareConnectionRow[]> {
  const normalizedReceiverAccountId = cleanString(receiverAccountId)
  if (!normalizedReceiverAccountId) {
    return []
  }

  return fetchAccountWorkshareConnectionRows(supabase, async (client) => {
    const { data, error } = await client
      .from('account_workshare_connections')
      .select('*')
      .eq('receiver_account_id', normalizedReceiverAccountId)
      .eq('service_type', 'ecc_hers')
      .in('status', ['pending', 'active'])
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })

    return { data: (data ?? []) as AccountWorkshareConnectionRow[], error }
  })
}
