import type { SupabaseClient } from '@supabase/supabase-js'

export const ACCOUNT_HANDOFF_CONNECTION_STATUSES = ['pending', 'active', 'declined', 'revoked'] as const
export const ACCOUNT_HANDOFF_CONNECTION_HANDOFF_KINDS = ['ecc'] as const

export type AccountHandoffConnectionStatus = (typeof ACCOUNT_HANDOFF_CONNECTION_STATUSES)[number]
export type AccountHandoffConnectionHandoffKind = (typeof ACCOUNT_HANDOFF_CONNECTION_HANDOFF_KINDS)[number]

export type AccountHandoffConnectionRow = {
  id: string
  requesting_account_owner_user_id: string
  recipient_account_owner_user_id: string
  connection_status: AccountHandoffConnectionStatus
  handoff_kind: AccountHandoffConnectionHandoffKind
  requested_by_user_id: string | null
  approved_by_user_id: string | null
  declined_by_user_id: string | null
  revoked_by_user_id: string | null
  requested_at: string
  approved_at: string | null
  declined_at: string | null
  revoked_at: string | null
  connection_note: string | null
  created_at: string
  updated_at: string
}

type AccountHandoffConnectionQueryError = {
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

function normalizeHandoffKind(value: unknown): AccountHandoffConnectionHandoffKind | null {
  const normalized = cleanString(value).toLowerCase()
  return ACCOUNT_HANDOFF_CONNECTION_HANDOFF_KINDS.includes(normalized as AccountHandoffConnectionHandoffKind)
    ? (normalized as AccountHandoffConnectionHandoffKind)
    : null
}

function normalizeConnectionStatus(value: unknown): AccountHandoffConnectionStatus | null {
  const normalized = cleanString(value).toLowerCase()
  return ACCOUNT_HANDOFF_CONNECTION_STATUSES.includes(normalized as AccountHandoffConnectionStatus)
    ? (normalized as AccountHandoffConnectionStatus)
    : null
}

function isMissingAccountHandoffConnectionsTable(error: AccountHandoffConnectionQueryError | null | undefined): boolean {
  if (!error) {
    return false
  }

  const message = [error.message, error.details, error.hint]
    .map((entry) => cleanString(entry).toLowerCase())
    .filter(Boolean)
    .join(' ')

  if (!message.includes('account_handoff_connections')) {
    return false
  }

  return error.code === '42P01'
    || error.code === 'PGRST205'
    || message.includes('not found')
    || message.includes('does not exist')
    || message.includes('schema cache')
}

function normalizeAccountHandoffConnectionRow(value: any): AccountHandoffConnectionRow | null {
  const id = cleanString(value?.id)
  const requestingAccountOwnerUserId = cleanString(value?.requesting_account_owner_user_id)
  const recipientAccountOwnerUserId = cleanString(value?.recipient_account_owner_user_id)
  const connectionStatus = normalizeConnectionStatus(value?.connection_status)
  const handoffKind = normalizeHandoffKind(value?.handoff_kind)
  const requestedAt = cleanString(value?.requested_at)
  const createdAt = cleanString(value?.created_at)
  const updatedAt = cleanString(value?.updated_at)

  if (!id || !requestingAccountOwnerUserId || !recipientAccountOwnerUserId || !connectionStatus || !handoffKind || !requestedAt || !createdAt || !updatedAt) {
    return null
  }

  return {
    id,
    requesting_account_owner_user_id: requestingAccountOwnerUserId,
    recipient_account_owner_user_id: recipientAccountOwnerUserId,
    connection_status: connectionStatus,
    handoff_kind: handoffKind,
    requested_by_user_id: cleanNullableString(value?.requested_by_user_id),
    approved_by_user_id: cleanNullableString(value?.approved_by_user_id),
    declined_by_user_id: cleanNullableString(value?.declined_by_user_id),
    revoked_by_user_id: cleanNullableString(value?.revoked_by_user_id),
    requested_at: requestedAt,
    approved_at: cleanNullableString(value?.approved_at),
    declined_at: cleanNullableString(value?.declined_at),
    revoked_at: cleanNullableString(value?.revoked_at),
    connection_note: cleanNullableString(value?.connection_note),
    created_at: createdAt,
    updated_at: updatedAt,
  }
}

async function fetchAccountHandoffConnectionRows(
  supabase: SupabaseClient,
  queryBuilder: (client: SupabaseClient) => Promise<{ data: AccountHandoffConnectionRow[] | null; error: AccountHandoffConnectionQueryError | null }>,
): Promise<AccountHandoffConnectionRow[]> {
  const { data, error } = await queryBuilder(supabase)

  if (error) {
    if (isMissingAccountHandoffConnectionsTable(error)) {
      return []
    }

    throw error
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => normalizeAccountHandoffConnectionRow(row))
    .filter((row): row is AccountHandoffConnectionRow => row !== null)
}

export async function listAccountHandoffConnectionsForAccount(
  supabase: SupabaseClient,
  accountOwnerUserId: string | null | undefined,
  options?: {
    handoffKind?: AccountHandoffConnectionHandoffKind | null
    statuses?: AccountHandoffConnectionStatus[] | null
    limit?: number | null
  },
): Promise<AccountHandoffConnectionRow[]> {
  const normalizedAccountOwnerUserId = cleanString(accountOwnerUserId)
  if (!normalizedAccountOwnerUserId) {
    return []
  }

  const normalizedHandoffKind = normalizeHandoffKind(options?.handoffKind ?? null)
  const normalizedStatuses = Array.isArray(options?.statuses)
    ? options?.statuses.map((status) => normalizeConnectionStatus(status)).filter((status): status is AccountHandoffConnectionStatus => status !== null)
    : []
  const safeLimit = Math.max(1, Math.min(500, Number(options?.limit ?? 100)))

  return fetchAccountHandoffConnectionRows(supabase, async (client) => {
    let query = client
      .from('account_handoff_connections')
      .select('*')
      .or(`requesting_account_owner_user_id.eq.${normalizedAccountOwnerUserId},recipient_account_owner_user_id.eq.${normalizedAccountOwnerUserId}`)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(safeLimit)

    if (normalizedHandoffKind) {
      query = query.eq('handoff_kind', normalizedHandoffKind)
    }

    if (normalizedStatuses.length > 0) {
      query = query.in('connection_status', normalizedStatuses)
    }

    const { data, error } = await query
    return { data: (data ?? []) as AccountHandoffConnectionRow[], error }
  })
}

export async function listActiveRecipientConnectionsForAccount(
  supabase: SupabaseClient,
  accountOwnerUserId: string | null | undefined,
  handoffKind: AccountHandoffConnectionHandoffKind = 'ecc',
): Promise<AccountHandoffConnectionRow[]> {
  const normalizedAccountOwnerUserId = cleanString(accountOwnerUserId)
  if (!normalizedAccountOwnerUserId) {
    return []
  }

  const normalizedHandoffKind = normalizeHandoffKind(handoffKind) ?? 'ecc'

  return fetchAccountHandoffConnectionRows(supabase, async (client) => {
    const { data, error } = await client
      .from('account_handoff_connections')
      .select('*')
      .eq('requesting_account_owner_user_id', normalizedAccountOwnerUserId)
      .eq('handoff_kind', normalizedHandoffKind)
      .eq('connection_status', 'active')
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })

    return { data: (data ?? []) as AccountHandoffConnectionRow[], error }
  })
}

export async function getAccountHandoffConnectionByIdForAccount(
  supabase: SupabaseClient,
  connectionId: string | null | undefined,
  accountOwnerUserId: string | null | undefined,
): Promise<AccountHandoffConnectionRow | null> {
  const normalizedConnectionId = cleanString(connectionId)
  const normalizedAccountOwnerUserId = cleanString(accountOwnerUserId)

  if (!normalizedConnectionId || !normalizedAccountOwnerUserId) {
    return null
  }

  const rows = await fetchAccountHandoffConnectionRows(supabase, async (client) => {
    const { data, error } = await client
      .from('account_handoff_connections')
      .select('*')
      .eq('id', normalizedConnectionId)
      .or(`requesting_account_owner_user_id.eq.${normalizedAccountOwnerUserId},recipient_account_owner_user_id.eq.${normalizedAccountOwnerUserId}`)
      .limit(1)

    return { data: (data ?? []) as AccountHandoffConnectionRow[], error }
  })

  return rows[0] ?? null
}