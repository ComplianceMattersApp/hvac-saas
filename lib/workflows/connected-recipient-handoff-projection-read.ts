import type { SupabaseClient } from '@supabase/supabase-js'

import {
  getWorkflowHandoffRequestGrantForRecipientAccount,
  listActiveWorkflowHandoffRequestGrantsForRecipientAccount,
  listWorkflowHandoffRequestGrantsForRecipientAccount,
  type WorkflowHandoffRequestGrantRow,
  type WorkflowHandoffRequestGrantHandoffKind,
  type WorkflowHandoffRequestGrantSharedScope,
  type WorkflowHandoffRequestGrantStatus,
} from './workflow-handoff-request-grants-read'
import type {
  WorkflowHandoffKind,
  WorkflowHandoffStatus,
} from './workflow-handoff-requests-read'

export type ConnectedRecipientHandoffProjectionStatus = WorkflowHandoffRequestGrantStatus

export type ConnectedRecipientHandoffProjection = {
  grant_id: string
  workflow_handoff_request_id: string
  handoff_kind: WorkflowHandoffKind
  handoff_status: WorkflowHandoffStatus
  recipient_account_owner_user_id: string
  installer_account_owner_user_id: string
  recipient_display_name_snapshot: string
  recipient_type_snapshot: string
  sent_at: string
  responded_at: string | null
  response_note: string | null
  evidence_reference: string | null
  grant_status: ConnectedRecipientHandoffProjectionStatus
  granted_at: string
  shared_scope: WorkflowHandoffRequestGrantSharedScope
}

export type ConnectedRecipientHandoffProjectionResult = ConnectedRecipientHandoffProjection | null

type ConnectedRecipientHandoffRequestRow = {
  id: string
  installer_account_owner_user_id: string
  handoff_kind: WorkflowHandoffKind
  handoff_status: WorkflowHandoffStatus
  recipient_display_name_snapshot: string
  recipient_type_snapshot: string
  sent_at: string
  responded_at: string | null
  response_note: string | null
  evidence_reference: string | null
}

type ConnectedRecipientHandoffRequestQueryError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

const CONNECTED_RECIPIENT_HANDOFF_KIND: WorkflowHandoffRequestGrantHandoffKind = 'ecc'
const CONNECTED_RECIPIENT_HANDOFF_REQUEST_SELECT =
  'id, installer_account_owner_user_id, handoff_kind, handoff_status, recipient_display_name_snapshot, recipient_type_snapshot, sent_at, responded_at, response_note, evidence_reference'

function cleanString(value: unknown) {
  return String(value ?? '').trim()
}

function cleanNullableString(value: unknown) {
  const normalized = cleanString(value)
  return normalized.length > 0 ? normalized : null
}

function normalizeConnectedRecipientHandoffRequestRow(value: any): ConnectedRecipientHandoffRequestRow | null {
  const id = cleanString(value?.id)
  const installerAccountOwnerUserId = cleanString(value?.installer_account_owner_user_id)
  const handoffKind = cleanString(value?.handoff_kind).toLowerCase()
  const handoffStatus = cleanString(value?.handoff_status).toLowerCase()
  const recipientDisplayNameSnapshot = cleanString(value?.recipient_display_name_snapshot)
  const recipientTypeSnapshot = cleanString(value?.recipient_type_snapshot)
  const sentAt = cleanString(value?.sent_at)

  if (
    !id
    || !installerAccountOwnerUserId
    || handoffKind !== CONNECTED_RECIPIENT_HANDOFF_KIND
    || !handoffStatus
    || !recipientDisplayNameSnapshot
    || !recipientTypeSnapshot
    || !sentAt
  ) {
    return null
  }

  return {
    id,
    installer_account_owner_user_id: installerAccountOwnerUserId,
    handoff_kind: CONNECTED_RECIPIENT_HANDOFF_KIND,
    handoff_status: handoffStatus as WorkflowHandoffStatus,
    recipient_display_name_snapshot: recipientDisplayNameSnapshot,
    recipient_type_snapshot: recipientTypeSnapshot,
    sent_at: sentAt,
    responded_at: cleanNullableString(value?.responded_at),
    response_note: cleanNullableString(value?.response_note),
    evidence_reference: cleanNullableString(value?.evidence_reference),
  }
}

function isMissingWorkflowHandoffRequestsTable(error: ConnectedRecipientHandoffRequestQueryError | null | undefined): boolean {
  if (!error) {
    return false
  }

  const message = [error.message, error.details, error.hint]
    .map((entry) => cleanString(entry).toLowerCase())
    .filter(Boolean)
    .join(' ')

  if (!message.includes('workflow_handoff_requests')) {
    return false
  }

  return error.code === '42P01'
    || error.code === 'PGRST205'
    || message.includes('not found')
    || message.includes('does not exist')
    || message.includes('schema cache')
}

async function fetchConnectedRecipientHandoffRequestRowsByIds(
  supabase: SupabaseClient,
  requestIds: string[],
): Promise<ConnectedRecipientHandoffRequestRow[] | null> {
  const normalizedRequestIds = Array.from(
    new Set(requestIds.map((requestId) => cleanString(requestId)).filter(Boolean)),
  )

  if (normalizedRequestIds.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('workflow_handoff_requests')
    .select(CONNECTED_RECIPIENT_HANDOFF_REQUEST_SELECT)
    .in('id', normalizedRequestIds)
    .eq('handoff_kind', CONNECTED_RECIPIENT_HANDOFF_KIND)

  if (error) {
    if (isMissingWorkflowHandoffRequestsTable(error)) {
      return null
    }

    throw error
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => normalizeConnectedRecipientHandoffRequestRow(row))
    .filter((row): row is ConnectedRecipientHandoffRequestRow => row !== null)
}

function normalizeConnectedRecipientHandoffProjectionRow(
  grantRow: WorkflowHandoffRequestGrantRow,
  requestRow: ConnectedRecipientHandoffRequestRow | null | undefined,
): ConnectedRecipientHandoffProjection | null {
  if (!requestRow) {
    return null
  }

  if (cleanString(grantRow.workflow_handoff_request_id) !== cleanString(requestRow.id)) {
    return null
  }

  if (cleanString(grantRow.installer_account_owner_user_id) !== cleanString(requestRow.installer_account_owner_user_id)) {
    return null
  }

  if (cleanString(grantRow.handoff_kind).toLowerCase() !== CONNECTED_RECIPIENT_HANDOFF_KIND) {
    return null
  }

  if (cleanString(requestRow.handoff_kind).toLowerCase() !== CONNECTED_RECIPIENT_HANDOFF_KIND) {
    return null
  }

  const grantStatus = cleanString(grantRow.grant_status).toLowerCase()
  const sharedScope = cleanString(grantRow.shared_scope).toLowerCase()
  const grantedAt = cleanString(grantRow.granted_at)

  if (!grantStatus || !sharedScope || !grantedAt) {
    return null
  }

  return {
    grant_id: cleanString(grantRow.id),
    workflow_handoff_request_id: cleanString(grantRow.workflow_handoff_request_id),
    handoff_kind: CONNECTED_RECIPIENT_HANDOFF_KIND,
    handoff_status: requestRow.handoff_status,
    recipient_account_owner_user_id: cleanString(grantRow.recipient_account_owner_user_id),
    installer_account_owner_user_id: cleanString(grantRow.installer_account_owner_user_id),
    recipient_display_name_snapshot: requestRow.recipient_display_name_snapshot,
    recipient_type_snapshot: requestRow.recipient_type_snapshot,
    sent_at: requestRow.sent_at,
    responded_at: requestRow.responded_at,
    response_note: requestRow.response_note,
    evidence_reference: requestRow.evidence_reference,
    grant_status: grantStatus as ConnectedRecipientHandoffProjectionStatus,
    granted_at: grantedAt,
    shared_scope: sharedScope as WorkflowHandoffRequestGrantSharedScope,
  }
}

async function listConnectedRecipientHandoffProjectionRowsForRecipientAccount(
  supabase: SupabaseClient,
  recipientAccountOwnerUserId: string | null | undefined,
  includeRevoked: boolean,
): Promise<ConnectedRecipientHandoffProjection[]> {
  const normalizedRecipientAccountOwnerUserId = cleanString(recipientAccountOwnerUserId)
  if (!normalizedRecipientAccountOwnerUserId) {
    return []
  }

  const grants = includeRevoked
    ? await listWorkflowHandoffRequestGrantsForRecipientAccount(supabase, normalizedRecipientAccountOwnerUserId, {
      handoffKind: CONNECTED_RECIPIENT_HANDOFF_KIND,
    })
    : await listActiveWorkflowHandoffRequestGrantsForRecipientAccount(supabase, normalizedRecipientAccountOwnerUserId)

  if (grants.length === 0) {
    return []
  }

  const requestRows = await fetchConnectedRecipientHandoffRequestRowsByIds(
    supabase,
    grants.map((grantRow) => grantRow.workflow_handoff_request_id),
  )

  if (requestRows == null) {
    return []
  }

  const requestRowsById = new Map(requestRows.map((row) => [row.id, row] as const))

  return grants
    .map((grantRow) => normalizeConnectedRecipientHandoffProjectionRow(grantRow, requestRowsById.get(grantRow.workflow_handoff_request_id)))
    .filter((row): row is ConnectedRecipientHandoffProjection => row !== null)
}

export async function listConnectedRecipientHandoffProjectionsForAccount(
  supabase: SupabaseClient,
  recipientAccountOwnerUserId: string | null | undefined,
): Promise<ConnectedRecipientHandoffProjection[]> {
  return listConnectedRecipientHandoffProjectionRowsForRecipientAccount(supabase, recipientAccountOwnerUserId, true)
}

export async function listActiveConnectedRecipientHandoffProjectionsForAccount(
  supabase: SupabaseClient,
  recipientAccountOwnerUserId: string | null | undefined,
): Promise<ConnectedRecipientHandoffProjection[]> {
  return listConnectedRecipientHandoffProjectionRowsForRecipientAccount(supabase, recipientAccountOwnerUserId, false)
}

export async function getConnectedRecipientHandoffProjectionByGrantIdForAccount(
  supabase: SupabaseClient,
  grantId: string | null | undefined,
  recipientAccountOwnerUserId: string | null | undefined,
): Promise<ConnectedRecipientHandoffProjectionResult> {
  const grantRow = await getWorkflowHandoffRequestGrantForRecipientAccount(
    supabase,
    grantId,
    recipientAccountOwnerUserId,
  )

  if (!grantRow || cleanString(grantRow.handoff_kind).toLowerCase() !== CONNECTED_RECIPIENT_HANDOFF_KIND) {
    return null
  }

  const requestRows = await fetchConnectedRecipientHandoffRequestRowsByIds(supabase, [grantRow.workflow_handoff_request_id])
  if (requestRows == null) {
    return null
  }

  return normalizeConnectedRecipientHandoffProjectionRow(
    grantRow,
    requestRows.find((row) => row.id === grantRow.workflow_handoff_request_id) ?? null,
  )
}