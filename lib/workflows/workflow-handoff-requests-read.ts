import type { SupabaseClient } from '@supabase/supabase-js'

export type WorkflowHandoffStatus = 'sent' | 'accepted' | 'completed' | 'rejected' | 'cancelled'
export type WorkflowHandoffKind = 'ecc' | 'general_future'

export type WorkflowHandoffRequestRow = {
  id: string
  installer_account_owner_user_id: string
  workflow_instance_id: string
  workflow_instance_milestone_id: string
  service_case_id: string
  source_job_id: string | null
  authorized_handoff_recipient_id: string
  recipient_type_snapshot: string
  recipient_display_name_snapshot: string
  handoff_kind: WorkflowHandoffKind
  handoff_status: WorkflowHandoffStatus
  sent_by_user_id: string
  sent_at: string
  responded_by_user_id: string | null
  responded_at: string | null
  response_note: string | null
  evidence_reference: string | null
  created_at: string
  updated_at: string
}

type WorkflowHandoffRequestQueryError = {
  code?: string | null
  message?: string | null
}

function isMissingWorkflowHandoffRequestsTable(error: WorkflowHandoffRequestQueryError | null | undefined): boolean {
  if (!error) {
    return false
  }

  const message = (error.message ?? '').toLowerCase()

  return (
    error.code === '42P01'
    || error.code === 'PGRST205'
    || message.includes('workflow_handoff_requests') && (message.includes('not found') || message.includes('does not exist') || message.includes('schema cache'))
  )
}

async function fetchWorkflowHandoffRequestRows(
  supabase: SupabaseClient,
  queryBuilder: (client: SupabaseClient) => Promise<{ data: WorkflowHandoffRequestRow[] | null; error: WorkflowHandoffRequestQueryError | null }>,
): Promise<WorkflowHandoffRequestRow[]> {
  const { data, error } = await queryBuilder(supabase)

  if (error) {
    if (isMissingWorkflowHandoffRequestsTable(error)) {
      return []
    }

    throw error
  }

  return Array.isArray(data) ? data : []
}

export async function listWorkflowHandoffRequestsForMilestone(
  supabase: SupabaseClient,
  input: {
    installerAccountOwnerUserId: string
    workflowInstanceId: string
    workflowInstanceMilestoneId: string
  },
): Promise<WorkflowHandoffRequestRow[]> {
  return fetchWorkflowHandoffRequestRows(supabase, async (client) => {
    const { data, error } = await client
      .from('workflow_handoff_requests')
      .select('*')
      .eq('installer_account_owner_user_id', input.installerAccountOwnerUserId)
      .eq('workflow_instance_id', input.workflowInstanceId)
      .eq('workflow_instance_milestone_id', input.workflowInstanceMilestoneId)
      .order('created_at', { ascending: false })

    return { data: (data ?? []) as WorkflowHandoffRequestRow[], error }
  })
}

export async function getLatestWorkflowHandoffRequestForMilestone(
  supabase: SupabaseClient,
  input: {
    installerAccountOwnerUserId: string
    workflowInstanceId: string
    workflowInstanceMilestoneId: string
  },
): Promise<WorkflowHandoffRequestRow | null> {
  const requests = await listWorkflowHandoffRequestsForMilestone(supabase, input)
  return requests[0] ?? null
}

export async function listOpenWorkflowHandoffRequestsForInstallerAccount(
  supabase: SupabaseClient,
  input: {
    installerAccountOwnerUserId: string
  },
): Promise<WorkflowHandoffRequestRow[]> {
  return fetchWorkflowHandoffRequestRows(supabase, async (client) => {
    const { data, error } = await client
      .from('workflow_handoff_requests')
      .select('*')
      .eq('installer_account_owner_user_id', input.installerAccountOwnerUserId)
      .in('handoff_status', ['sent', 'accepted'])
      .order('sent_at', { ascending: false })
      .order('created_at', { ascending: false })

    return { data: (data ?? []) as WorkflowHandoffRequestRow[], error }
  })
}