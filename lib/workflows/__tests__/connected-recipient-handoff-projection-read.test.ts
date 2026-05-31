import { describe, expect, it, vi } from 'vitest'

import {
  getConnectedRecipientHandoffProjectionByGrantIdForAccount,
  listActiveConnectedRecipientHandoffProjectionsForAccount,
  listConnectedRecipientHandoffProjectionsForAccount,
  type ConnectedRecipientHandoffProjection,
} from '../connected-recipient-handoff-projection-read'

type QueryError = {
  code?: string
  message?: string
  details?: string
  hint?: string
} | null

type GrantRow = {
  id: string
  installer_account_owner_user_id: string
  recipient_account_owner_user_id: string
  account_handoff_connection_id: string
  workflow_handoff_request_id: string
  authorized_handoff_recipient_id: string | null
  handoff_kind: 'ecc'
  grant_status: 'active' | 'revoked'
  shared_scope: 'handoff_request_only'
  granted_by_user_id: string
  granted_at: string
  revoked_by_user_id: string | null
  revoked_at: string | null
  revoke_reason: string | null
  created_at: string
  updated_at: string
}

type RequestRow = {
  id: string
  installer_account_owner_user_id: string
  handoff_kind: 'ecc'
  handoff_status: ConnectedRecipientHandoffProjection['handoff_status']
  recipient_display_name_snapshot: string
  recipient_type_snapshot: string
  sent_at: string
  responded_at: string | null
  response_note: string | null
  evidence_reference: string | null
}

function makeGrant(input: Partial<GrantRow> & { id: string }): GrantRow {
  const { id, ...rest } = input

  return {
    id,
    installer_account_owner_user_id: 'installer-1',
    recipient_account_owner_user_id: 'recipient-1',
    account_handoff_connection_id: 'connection-1',
    workflow_handoff_request_id: 'request-1',
    authorized_handoff_recipient_id: 'authorized-1',
    handoff_kind: 'ecc',
    grant_status: 'active',
    shared_scope: 'handoff_request_only',
    granted_by_user_id: 'user-1',
    granted_at: '2026-05-31T20:00:00.000Z',
    revoked_by_user_id: null,
    revoked_at: null,
    revoke_reason: null,
    created_at: '2026-05-31T20:00:00.000Z',
    updated_at: '2026-05-31T20:00:00.000Z',
    ...rest,
  }
}

function makeRequest(input: Partial<RequestRow> & { id: string }): RequestRow {
  const { id, ...rest } = input

  return {
    id,
    installer_account_owner_user_id: 'installer-1',
    handoff_kind: 'ecc',
    handoff_status: 'sent',
    recipient_display_name_snapshot: 'Smoke Rater A',
    recipient_type_snapshot: 'connected_account_future',
    sent_at: '2026-05-31T19:00:00.000Z',
    responded_at: null,
    response_note: null,
    evidence_reference: null,
    ...rest,
  }
}

function makeSupabase(seed: {
  grants: GrantRow[]
  requests: RequestRow[]
  grantError?: QueryError
  requestError?: QueryError
}) {
  const tableNames: string[] = []
  const states: Array<{
    table: string
    eq: Array<[string, unknown]>
    in: Array<[string, unknown[]]>
    orders: Array<{ column: string; ascending: boolean }>
    limit: number | null
  }> = []

  const resolveGrantRows = (state: (typeof states)[number]) => {
    let rows = [...seed.grants]

    for (const [column, value] of state.eq) {
      rows = rows.filter((row) => (row as any)?.[column] === value)
    }

    for (const [column, values] of state.in) {
      rows = rows.filter((row) => values.includes((row as any)?.[column]))
    }

    for (const order of [...state.orders].reverse()) {
      rows.sort((left, right) => {
        const leftValue = String((left as any)?.[order.column] ?? '')
        const rightValue = String((right as any)?.[order.column] ?? '')
        return order.ascending
          ? leftValue.localeCompare(rightValue)
          : rightValue.localeCompare(leftValue)
      })
    }

    if (typeof state.limit === 'number') {
      rows = rows.slice(0, state.limit)
    }

    return rows
  }

  const resolveRequestRows = (state: (typeof states)[number]) => {
    let rows = [...seed.requests]

    for (const [column, value] of state.eq) {
      rows = rows.filter((row) => (row as any)?.[column] === value)
    }

    for (const [column, values] of state.in) {
      rows = rows.filter((row) => values.includes((row as any)?.[column]))
    }

    if (typeof state.limit === 'number') {
      rows = rows.slice(0, state.limit)
    }

    return rows
  }

  const buildQuery = (state: (typeof states)[number]) => {
    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        state.eq.push([column, value])
        return query
      }),
      in: vi.fn((column: string, value: unknown[]) => {
        state.in.push([column, value])
        return query
      }),
      order: vi.fn((column: string, options: { ascending?: boolean } = {}) => {
        state.orders.push({ column, ascending: options.ascending !== false })
        return query
      }),
      limit: vi.fn((value: number) => {
        state.limit = value
        return query
      }),
      maybeSingle: vi.fn(async () => {
        if (state.table === 'workflow_handoff_request_grants' && seed.grantError) {
          return { data: null, error: seed.grantError }
        }

        if (state.table === 'workflow_handoff_requests' && seed.requestError) {
          return { data: null, error: seed.requestError }
        }

        const rows = state.table === 'workflow_handoff_request_grants'
          ? resolveGrantRows(state)
          : resolveRequestRows(state)

        return { data: rows[0] ?? null, error: null }
      }),
      then: (resolve: (value: { data: unknown[] | null; error: QueryError }) => unknown, reject?: (reason: unknown) => unknown) => {
        if (state.table === 'workflow_handoff_request_grants' && seed.grantError) {
          return Promise.resolve({ data: null, error: seed.grantError }).then(resolve, reject)
        }

        if (state.table === 'workflow_handoff_requests' && seed.requestError) {
          return Promise.resolve({ data: null, error: seed.requestError }).then(resolve, reject)
        }

        const rows = state.table === 'workflow_handoff_request_grants'
          ? resolveGrantRows(state)
          : resolveRequestRows(state)

        return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
      },
    }

    return query
  }

  const supabase = {
    from: vi.fn((table: string) => {
      tableNames.push(table)

      if (table !== 'workflow_handoff_request_grants' && table !== 'workflow_handoff_requests') {
        throw new Error(`Unexpected table ${table}`)
      }

      const state = {
        table,
        eq: [] as Array<[string, unknown]>,
        in: [] as Array<[string, unknown[]]>,
        orders: [] as Array<{ column: string; ascending: boolean }>,
        limit: null as number | null,
      }

      states.push(state)
      return buildQuery(state)
    }),
  } as any

  return { supabase, tableNames }
}

describe('connected recipient handoff projection read helpers', () => {
  it('lists only projections for the recipient account', async () => {
    const { supabase, tableNames } = makeSupabase({
      grants: [
        makeGrant({ id: 'grant-1', recipient_account_owner_user_id: 'recipient-1', workflow_handoff_request_id: 'request-1' }),
        makeGrant({ id: 'grant-2', recipient_account_owner_user_id: 'recipient-1', workflow_handoff_request_id: 'request-2', grant_status: 'revoked', revoked_at: '2026-05-31T21:00:00.000Z', revoked_by_user_id: 'user-9' }),
        makeGrant({ id: 'grant-3', recipient_account_owner_user_id: 'recipient-2', workflow_handoff_request_id: 'request-3' }),
      ],
      requests: [
        makeRequest({ id: 'request-1', recipient_display_name_snapshot: 'Smoke Rater A' }),
        makeRequest({ id: 'request-2', recipient_display_name_snapshot: 'Smoke Rater B', handoff_status: 'accepted', responded_at: '2026-05-31T20:30:00.000Z', response_note: 'Accepted by connected rater' }),
        makeRequest({ id: 'request-3', installer_account_owner_user_id: 'installer-2', recipient_display_name_snapshot: 'Other Rater' }),
      ],
    })

    const result = await listConnectedRecipientHandoffProjectionsForAccount(supabase, 'recipient-1')

    expect(result).toEqual([
      {
        grant_id: 'grant-1',
        workflow_handoff_request_id: 'request-1',
        handoff_kind: 'ecc',
        handoff_status: 'sent',
        recipient_account_owner_user_id: 'recipient-1',
        installer_account_owner_user_id: 'installer-1',
        recipient_display_name_snapshot: 'Smoke Rater A',
        recipient_type_snapshot: 'connected_account_future',
        sent_at: '2026-05-31T19:00:00.000Z',
        responded_at: null,
        response_note: null,
        evidence_reference: null,
        grant_status: 'active',
        granted_at: '2026-05-31T20:00:00.000Z',
        shared_scope: 'handoff_request_only',
      },
      {
        grant_id: 'grant-2',
        workflow_handoff_request_id: 'request-2',
        handoff_kind: 'ecc',
        handoff_status: 'accepted',
        recipient_account_owner_user_id: 'recipient-1',
        installer_account_owner_user_id: 'installer-1',
        recipient_display_name_snapshot: 'Smoke Rater B',
        recipient_type_snapshot: 'connected_account_future',
        sent_at: '2026-05-31T19:00:00.000Z',
        responded_at: '2026-05-31T20:30:00.000Z',
        response_note: 'Accepted by connected rater',
        evidence_reference: null,
        grant_status: 'revoked',
        granted_at: '2026-05-31T20:00:00.000Z',
        shared_scope: 'handoff_request_only',
      },
    ])

    expect(tableNames).toEqual(['workflow_handoff_request_grants', 'workflow_handoff_requests'])
  })

  it('lists only active projections in the active helper', async () => {
    const { supabase, tableNames } = makeSupabase({
      grants: [
        makeGrant({ id: 'grant-1', recipient_account_owner_user_id: 'recipient-1', workflow_handoff_request_id: 'request-1', grant_status: 'active' }),
        makeGrant({ id: 'grant-2', recipient_account_owner_user_id: 'recipient-1', workflow_handoff_request_id: 'request-2', grant_status: 'revoked', revoked_at: '2026-05-31T21:00:00.000Z', revoked_by_user_id: 'user-9' }),
      ],
      requests: [
        makeRequest({ id: 'request-1', recipient_display_name_snapshot: 'Smoke Rater A' }),
        makeRequest({ id: 'request-2', recipient_display_name_snapshot: 'Smoke Rater B', handoff_status: 'accepted' }),
      ],
    })

    const result = await listActiveConnectedRecipientHandoffProjectionsForAccount(supabase, 'recipient-1')

    expect(result.map((row) => row.grant_id)).toEqual(['grant-1'])
    expect(tableNames).toEqual(['workflow_handoff_request_grants', 'workflow_handoff_requests'])
  })

  it('gets a projection by grant id for the correct recipient account', async () => {
    const { supabase, tableNames } = makeSupabase({
      grants: [
        makeGrant({ id: 'grant-1', recipient_account_owner_user_id: 'recipient-1', workflow_handoff_request_id: 'request-1' }),
        makeGrant({ id: 'grant-2', recipient_account_owner_user_id: 'recipient-2', workflow_handoff_request_id: 'request-2' }),
      ],
      requests: [
        makeRequest({ id: 'request-1' }),
        makeRequest({ id: 'request-2' }),
      ],
    })

    await expect(getConnectedRecipientHandoffProjectionByGrantIdForAccount(supabase, 'grant-1', 'recipient-1')).resolves.toEqual({
      grant_id: 'grant-1',
      workflow_handoff_request_id: 'request-1',
      handoff_kind: 'ecc',
      handoff_status: 'sent',
      recipient_account_owner_user_id: 'recipient-1',
      installer_account_owner_user_id: 'installer-1',
      recipient_display_name_snapshot: 'Smoke Rater A',
      recipient_type_snapshot: 'connected_account_future',
      sent_at: '2026-05-31T19:00:00.000Z',
      responded_at: null,
      response_note: null,
      evidence_reference: null,
      grant_status: 'active',
      granted_at: '2026-05-31T20:00:00.000Z',
      shared_scope: 'handoff_request_only',
    })

    expect(tableNames).toEqual(['workflow_handoff_request_grants', 'workflow_handoff_requests'])
  })

  it('returns null for the wrong recipient account', async () => {
    const { supabase, tableNames } = makeSupabase({
      grants: [makeGrant({ id: 'grant-1', recipient_account_owner_user_id: 'recipient-1', workflow_handoff_request_id: 'request-1' })],
      requests: [makeRequest({ id: 'request-1' })],
    })

    await expect(getConnectedRecipientHandoffProjectionByGrantIdForAccount(supabase, 'grant-1', 'recipient-2')).resolves.toBeNull()
    expect(tableNames).toEqual(['workflow_handoff_request_grants'])
  })

  it('fails open when workflow_handoff_request_grants table is missing', async () => {
    const { supabase } = makeSupabase({
      grants: [],
      requests: [],
      grantError: {
        code: '42P01',
        message: 'relation public.workflow_handoff_request_grants does not exist',
      },
    })

    await expect(listConnectedRecipientHandoffProjectionsForAccount(supabase, 'recipient-1')).resolves.toEqual([])
    await expect(listActiveConnectedRecipientHandoffProjectionsForAccount(supabase, 'recipient-1')).resolves.toEqual([])
    await expect(getConnectedRecipientHandoffProjectionByGrantIdForAccount(supabase, 'grant-1', 'recipient-1')).resolves.toBeNull()
  })

  it('fails open when workflow_handoff_requests table is missing', async () => {
    const { supabase } = makeSupabase({
      grants: [makeGrant({ id: 'grant-1', recipient_account_owner_user_id: 'recipient-1', workflow_handoff_request_id: 'request-1' })],
      requests: [],
      requestError: {
        code: '42P01',
        message: 'relation public.workflow_handoff_requests does not exist',
      },
    })

    await expect(listConnectedRecipientHandoffProjectionsForAccount(supabase, 'recipient-1')).resolves.toEqual([])
    await expect(listActiveConnectedRecipientHandoffProjectionsForAccount(supabase, 'recipient-1')).resolves.toEqual([])
    await expect(getConnectedRecipientHandoffProjectionByGrantIdForAccount(supabase, 'grant-1', 'recipient-1')).resolves.toBeNull()
  })

  it('does not touch operational tables', async () => {
    const forbiddenTables = [
      'jobs',
      'service_cases',
      'customers',
      'job_events',
      'internal_invoices',
      'internal_invoice_payments',
      'workflow_instances',
      'workflow_instance_milestones',
    ]

    const { supabase, tableNames } = makeSupabase({
      grants: [makeGrant({ id: 'grant-1', recipient_account_owner_user_id: 'recipient-1', workflow_handoff_request_id: 'request-1' })],
      requests: [makeRequest({ id: 'request-1' })],
    })

    await listConnectedRecipientHandoffProjectionsForAccount(supabase, 'recipient-1')

    expect(tableNames).toEqual(['workflow_handoff_request_grants', 'workflow_handoff_requests'])
    for (const table of forbiddenTables) {
      expect(tableNames).not.toContain(table)
    }
  })
})