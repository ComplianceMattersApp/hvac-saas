import { describe, expect, it, vi } from 'vitest'
import {
  getLatestWorkflowHandoffRequestForMilestone,
  listOpenWorkflowHandoffRequestsForInstallerAccount,
  listWorkflowHandoffRequestsForMilestone,
  type WorkflowHandoffRequestRow,
} from '../workflow-handoff-requests-read'

type QueryState = {
  rows: WorkflowHandoffRequestRow[]
  error: { code?: string; message?: string } | null
  filters: Array<{ kind: string; column: string; value: unknown }>
  orders: Array<{ column: string; ascending: boolean }>
}

function makeSupabaseMock(state: QueryState) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((column: string, value: unknown) => {
      state.filters.push({ kind: 'eq', column, value })
      return builder
    }),
    in: vi.fn((column: string, value: unknown) => {
      state.filters.push({ kind: 'in', column, value })
      return builder
    }),
    order: vi.fn((column: string, options: { ascending?: boolean } = {}) => {
      state.orders.push({ column, ascending: options.ascending !== false })
      return builder
    }),
    then: vi.fn(async (resolve: (value: { data: WorkflowHandoffRequestRow[] | null; error: QueryState['error'] }) => unknown) => {
      resolve({ data: state.rows, error: state.error })
    }),
  }

  return {
    from: vi.fn(() => builder),
  } as any
}

describe('workflow handoff request read helpers', () => {
  it('lists requests for a milestone using installer and workflow scope', async () => {
    const rows: WorkflowHandoffRequestRow[] = [
      {
        id: 'request-2',
        installer_account_owner_user_id: 'account-1',
        workflow_instance_id: 'workflow-1',
        workflow_instance_milestone_id: 'milestone-1',
        service_case_id: 'service-case-1',
        source_job_id: null,
        authorized_handoff_recipient_id: 'recipient-1',
        recipient_type_snapshot: 'sms',
        recipient_display_name_snapshot: 'Smoke Rater A',
        handoff_kind: 'ecc',
        handoff_status: 'sent',
        sent_by_user_id: 'user-1',
        sent_at: '2026-05-31T18:00:00.000Z',
        responded_by_user_id: null,
        responded_at: null,
        response_note: null,
        evidence_reference: null,
        created_at: '2026-05-31T18:00:00.000Z',
        updated_at: '2026-05-31T18:00:00.000Z',
      },
      {
        id: 'request-1',
        installer_account_owner_user_id: 'account-1',
        workflow_instance_id: 'workflow-1',
        workflow_instance_milestone_id: 'milestone-1',
        service_case_id: 'service-case-1',
        source_job_id: 'job-1',
        authorized_handoff_recipient_id: 'recipient-2',
        recipient_type_snapshot: 'email',
        recipient_display_name_snapshot: 'Rater B',
        handoff_kind: 'ecc',
        handoff_status: 'accepted',
        sent_by_user_id: 'user-1',
        sent_at: '2026-05-31T17:00:00.000Z',
        responded_by_user_id: 'user-2',
        responded_at: '2026-05-31T17:05:00.000Z',
        response_note: null,
        evidence_reference: null,
        created_at: '2026-05-31T17:00:00.000Z',
        updated_at: '2026-05-31T17:05:00.000Z',
      },
    ]
    const state: QueryState = { rows, error: null, filters: [], orders: [] }
    const supabase = makeSupabaseMock(state)

    const result = await listWorkflowHandoffRequestsForMilestone(supabase, {
      installerAccountOwnerUserId: 'account-1',
      workflowInstanceId: 'workflow-1',
      workflowInstanceMilestoneId: 'milestone-1',
    })

    expect(result).toEqual(rows)
    expect(state.filters).toEqual([
      { kind: 'eq', column: 'installer_account_owner_user_id', value: 'account-1' },
      { kind: 'eq', column: 'workflow_instance_id', value: 'workflow-1' },
      { kind: 'eq', column: 'workflow_instance_milestone_id', value: 'milestone-1' },
    ])
    expect(state.orders).toEqual([{ column: 'created_at', ascending: false }])
  })

  it('returns the newest milestone request', async () => {
    const state: QueryState = {
      rows: [
        {
          id: 'request-1',
          installer_account_owner_user_id: 'account-1',
          workflow_instance_id: 'workflow-1',
          workflow_instance_milestone_id: 'milestone-1',
          service_case_id: 'service-case-1',
          source_job_id: null,
          authorized_handoff_recipient_id: 'recipient-1',
          recipient_type_snapshot: 'sms',
          recipient_display_name_snapshot: 'Smoke Rater A',
          handoff_kind: 'ecc',
          handoff_status: 'sent',
          sent_by_user_id: 'user-1',
          sent_at: '2026-05-31T18:00:00.000Z',
          responded_by_user_id: null,
          responded_at: null,
          response_note: null,
          evidence_reference: null,
          created_at: '2026-05-31T18:00:00.000Z',
          updated_at: '2026-05-31T18:00:00.000Z',
        },
      ],
      error: null,
      filters: [],
      orders: [],
    }
    const supabase = makeSupabaseMock(state)

    await expect(getLatestWorkflowHandoffRequestForMilestone(supabase, {
      installerAccountOwnerUserId: 'account-1',
      workflowInstanceId: 'workflow-1',
      workflowInstanceMilestoneId: 'milestone-1',
    })).resolves.toEqual(state.rows[0])
  })

  it('lists open requests for an installer account', async () => {
    const state: QueryState = {
      rows: [],
      error: null,
      filters: [],
      orders: [],
    }
    const supabase = makeSupabaseMock(state)

    await listOpenWorkflowHandoffRequestsForInstallerAccount(supabase, {
      installerAccountOwnerUserId: 'account-1',
    })

    expect(state.filters).toEqual([
      { kind: 'eq', column: 'installer_account_owner_user_id', value: 'account-1' },
      { kind: 'in', column: 'handoff_status', value: ['sent', 'accepted'] },
    ])
    expect(state.orders).toEqual([
      { column: 'sent_at', ascending: false },
      { column: 'created_at', ascending: false },
    ])
  })

  it('fails open when the request table is missing', async () => {
    const state: QueryState = {
      rows: [],
      error: {
        code: '42P01',
        message: 'relation public.workflow_handoff_requests does not exist',
      },
      filters: [],
      orders: [],
    }
    const supabase = makeSupabaseMock(state)

    await expect(listWorkflowHandoffRequestsForMilestone(supabase, {
      installerAccountOwnerUserId: 'account-1',
      workflowInstanceId: 'workflow-1',
      workflowInstanceMilestoneId: 'milestone-1',
    })).resolves.toEqual([])
  })
})