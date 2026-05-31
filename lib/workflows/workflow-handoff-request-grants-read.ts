import type { SupabaseClient } from '@supabase/supabase-js'

export const WORKFLOW_HANDOFF_REQUEST_GRANT_STATUSES = ['active', 'revoked'] as const
export const WORKFLOW_HANDOFF_REQUEST_GRANT_HANDOFF_KINDS = ['ecc'] as const
export const WORKFLOW_HANDOFF_REQUEST_GRANT_SHARED_SCOPES = ['handoff_request_only'] as const

export type WorkflowHandoffRequestGrantStatus = (typeof WORKFLOW_HANDOFF_REQUEST_GRANT_STATUSES)[number]
export type WorkflowHandoffRequestGrantHandoffKind = (typeof WORKFLOW_HANDOFF_REQUEST_GRANT_HANDOFF_KINDS)[number]
export type WorkflowHandoffRequestGrantSharedScope = (typeof WORKFLOW_HANDOFF_REQUEST_GRANT_SHARED_SCOPES)[number]

export type WorkflowHandoffRequestGrantRow = {
  id: string
  installer_account_owner_user_id: string
  recipient_account_owner_user_id: string
  account_handoff_connection_id: string
  workflow_handoff_request_id: string
  authorized_handoff_recipient_id: string | null
  handoff_kind: WorkflowHandoffRequestGrantHandoffKind
  grant_status: WorkflowHandoffRequestGrantStatus
  shared_scope: WorkflowHandoffRequestGrantSharedScope
  granted_by_user_id: string
  granted_at: string
  revoked_by_user_id: string | null
  revoked_at: string | null
  revoke_reason: string | null
  created_at: string
  updated_at: string
}

type WorkflowHandoffRequestGrantQueryError = {
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

function normalizeGrantStatus(value: unknown): WorkflowHandoffRequestGrantStatus | null {
  const normalized = cleanString(value).toLowerCase()
  return WORKFLOW_HANDOFF_REQUEST_GRANT_STATUSES.includes(normalized as WorkflowHandoffRequestGrantStatus)
    ? (normalized as WorkflowHandoffRequestGrantStatus)
    : null
}

function normalizeHandoffKind(value: unknown): WorkflowHandoffRequestGrantHandoffKind | null {
  const normalized = cleanString(value).toLowerCase()
  return WORKFLOW_HANDOFF_REQUEST_GRANT_HANDOFF_KINDS.includes(normalized as WorkflowHandoffRequestGrantHandoffKind)
    ? (normalized as WorkflowHandoffRequestGrantHandoffKind)
    : null
}

function normalizeSharedScope(value: unknown): WorkflowHandoffRequestGrantSharedScope | null {
  const normalized = cleanString(value).toLowerCase()
  return WORKFLOW_HANDOFF_REQUEST_GRANT_SHARED_SCOPES.includes(normalized as WorkflowHandoffRequestGrantSharedScope)
    ? (normalized as WorkflowHandoffRequestGrantSharedScope)
    : null
}

function isMissingWorkflowHandoffRequestGrantsTable(error: WorkflowHandoffRequestGrantQueryError | null | undefined): boolean {
  if (!error) {
    return false
  }

  const message = [error.message, error.details, error.hint]
    .map((entry) => cleanString(entry).toLowerCase())
    .filter(Boolean)
    .join(' ')

  if (!message.includes('workflow_handoff_request_grants')) {
    return false
  }

  return error.code === '42P01'
    || error.code === 'PGRST205'
    || message.includes('not found')
    || message.includes('does not exist')
    || message.includes('schema cache')
}

function normalizeWorkflowHandoffRequestGrantRow(value: any): WorkflowHandoffRequestGrantRow | null {
  const id = cleanString(value?.id)
  const installerAccountOwnerUserId = cleanString(value?.installer_account_owner_user_id)
  const recipientAccountOwnerUserId = cleanString(value?.recipient_account_owner_user_id)
  const accountHandoffConnectionId = cleanString(value?.account_handoff_connection_id)
  const workflowHandoffRequestId = cleanString(value?.workflow_handoff_request_id)
  const grantStatus = normalizeGrantStatus(value?.grant_status)
  const handoffKind = normalizeHandoffKind(value?.handoff_kind)
  const sharedScope = normalizeSharedScope(value?.shared_scope)
  const grantedByUserId = cleanString(value?.granted_by_user_id)
  const grantedAt = cleanString(value?.granted_at)
  const createdAt = cleanString(value?.created_at)
  const updatedAt = cleanString(value?.updated_at)

  if (
    !id
    || !installerAccountOwnerUserId
    || !recipientAccountOwnerUserId
    || !accountHandoffConnectionId
    || !workflowHandoffRequestId
    || !grantStatus
    || !handoffKind
    || !sharedScope
    || !grantedByUserId
    || !grantedAt
    || !createdAt
    || !updatedAt
  ) {
    return null
  }

  return {
    id,
    installer_account_owner_user_id: installerAccountOwnerUserId,
    recipient_account_owner_user_id: recipientAccountOwnerUserId,
    account_handoff_connection_id: accountHandoffConnectionId,
    workflow_handoff_request_id: workflowHandoffRequestId,
    authorized_handoff_recipient_id: cleanNullableString(value?.authorized_handoff_recipient_id),
    handoff_kind: handoffKind,
    grant_status: grantStatus,
    shared_scope: sharedScope,
    granted_by_user_id: grantedByUserId,
    granted_at: grantedAt,
    revoked_by_user_id: cleanNullableString(value?.revoked_by_user_id),
    revoked_at: cleanNullableString(value?.revoked_at),
    revoke_reason: cleanNullableString(value?.revoke_reason),
    created_at: createdAt,
    updated_at: updatedAt,
  }
}

async function fetchWorkflowHandoffRequestGrantRows(
  supabase: SupabaseClient,
  queryBuilder: (client: SupabaseClient) => Promise<{
    data: WorkflowHandoffRequestGrantRow[] | null
    error: WorkflowHandoffRequestGrantQueryError | null
  }>,
): Promise<WorkflowHandoffRequestGrantRow[]> {
  const { data, error } = await queryBuilder(supabase)

  if (error) {
    if (isMissingWorkflowHandoffRequestGrantsTable(error)) {
      return []
    }

    throw error
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => normalizeWorkflowHandoffRequestGrantRow(row))
    .filter((row): row is WorkflowHandoffRequestGrantRow => row !== null)
}

export async function listWorkflowHandoffRequestGrantsForInstallerAccount(
  supabase: SupabaseClient,
  installerAccountOwnerUserId: string | null | undefined,
  options?: {
    statuses?: WorkflowHandoffRequestGrantStatus[] | null
    handoffKind?: WorkflowHandoffRequestGrantHandoffKind | null
    limit?: number | null
  },
): Promise<WorkflowHandoffRequestGrantRow[]> {
  const normalizedInstallerAccountOwnerUserId = cleanString(installerAccountOwnerUserId)
  if (!normalizedInstallerAccountOwnerUserId) {
    return []
  }

  const normalizedStatuses = Array.isArray(options?.statuses)
    ? options?.statuses
      .map((status) => normalizeGrantStatus(status))
      .filter((status): status is WorkflowHandoffRequestGrantStatus => status !== null)
    : []
  const normalizedHandoffKind = normalizeHandoffKind(options?.handoffKind ?? null)
  const safeLimit = Math.max(1, Math.min(500, Number(options?.limit ?? 100)))

  return fetchWorkflowHandoffRequestGrantRows(supabase, async (client) => {
    let query = client
      .from('workflow_handoff_request_grants')
      .select('*')
      .eq('installer_account_owner_user_id', normalizedInstallerAccountOwnerUserId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(safeLimit)

    if (normalizedStatuses.length > 0) {
      query = query.in('grant_status', normalizedStatuses)
    }

    if (normalizedHandoffKind) {
      query = query.eq('handoff_kind', normalizedHandoffKind)
    }

    const { data, error } = await query
    return { data: (data ?? []) as WorkflowHandoffRequestGrantRow[], error }
  })
}

export async function listWorkflowHandoffRequestGrantsForRecipientAccount(
  supabase: SupabaseClient,
  recipientAccountOwnerUserId: string | null | undefined,
  options?: {
    statuses?: WorkflowHandoffRequestGrantStatus[] | null
    handoffKind?: WorkflowHandoffRequestGrantHandoffKind | null
    limit?: number | null
  },
): Promise<WorkflowHandoffRequestGrantRow[]> {
  const normalizedRecipientAccountOwnerUserId = cleanString(recipientAccountOwnerUserId)
  if (!normalizedRecipientAccountOwnerUserId) {
    return []
  }

  const normalizedStatuses = Array.isArray(options?.statuses)
    ? options?.statuses
      .map((status) => normalizeGrantStatus(status))
      .filter((status): status is WorkflowHandoffRequestGrantStatus => status !== null)
    : []
  const normalizedHandoffKind = normalizeHandoffKind(options?.handoffKind ?? null)
  const safeLimit = Math.max(1, Math.min(500, Number(options?.limit ?? 100)))

  return fetchWorkflowHandoffRequestGrantRows(supabase, async (client) => {
    let query = client
      .from('workflow_handoff_request_grants')
      .select('*')
      .eq('recipient_account_owner_user_id', normalizedRecipientAccountOwnerUserId)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(safeLimit)

    if (normalizedStatuses.length > 0) {
      query = query.in('grant_status', normalizedStatuses)
    }

    if (normalizedHandoffKind) {
      query = query.eq('handoff_kind', normalizedHandoffKind)
    }

    const { data, error } = await query
    return { data: (data ?? []) as WorkflowHandoffRequestGrantRow[], error }
  })
}

export async function listActiveWorkflowHandoffRequestGrantsForRecipientAccount(
  supabase: SupabaseClient,
  recipientAccountOwnerUserId: string | null | undefined,
): Promise<WorkflowHandoffRequestGrantRow[]> {
  return listWorkflowHandoffRequestGrantsForRecipientAccount(
    supabase,
    recipientAccountOwnerUserId,
    {
      statuses: ['active'],
      handoffKind: 'ecc',
    },
  )
}

export async function getWorkflowHandoffRequestGrantForRecipientAccount(
  supabase: SupabaseClient,
  grantId: string | null | undefined,
  recipientAccountOwnerUserId: string | null | undefined,
): Promise<WorkflowHandoffRequestGrantRow | null> {
  const normalizedGrantId = cleanString(grantId)
  const normalizedRecipientAccountOwnerUserId = cleanString(recipientAccountOwnerUserId)

  if (!normalizedGrantId || !normalizedRecipientAccountOwnerUserId) {
    return null
  }

  const rows = await fetchWorkflowHandoffRequestGrantRows(supabase, async (client) => {
    const { data, error } = await client
      .from('workflow_handoff_request_grants')
      .select('*')
      .eq('id', normalizedGrantId)
      .eq('recipient_account_owner_user_id', normalizedRecipientAccountOwnerUserId)
      .limit(1)

    return { data: (data ?? []) as WorkflowHandoffRequestGrantRow[], error }
  })

  return rows[0] ?? null
}
