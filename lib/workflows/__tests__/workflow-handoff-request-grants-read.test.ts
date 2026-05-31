import { describe, expect, it, vi } from 'vitest'

import {
  getWorkflowHandoffRequestGrantForRecipientAccount,
  listActiveWorkflowHandoffRequestGrantsForRecipientAccount,
  listWorkflowHandoffRequestGrantsForInstallerAccount,
  listWorkflowHandoffRequestGrantsForRecipientAccount,
  type WorkflowHandoffRequestGrantRow,
} from '../workflow-handoff-request-grants-read'

type QueryError = {
  code?: string
  message?: string
  details?: string
  hint?: string
} | null

type FilterState = {
  eq: Array<[string, unknown]>
  in: Array<[string, unknown[]]>
  orders: Array<{ column: string; ascending: boolean }>
  limit: number | null
}

function makeRow(input: Partial<WorkflowHandoffRequestGrantRow> & { id: string }): WorkflowHandoffRequestGrantRow {
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
    granted_by_user_id: 'granted-by-1',
    granted_at: '2026-05-31T20:00:00.000Z',
    revoked_by_user_id: null,
    revoked_at: null,
    revoke_reason: null,
    created_at: '2026-05-31T20:00:00.000Z',
    updated_at: '2026-05-31T20:00:00.000Z',
    ...rest,
  }
}

function makeSupabase(rows: WorkflowHandoffRequestGrantRow[], queryError: QueryError = null) {
  const tableNames: string[] = []
  const states: FilterState[] = []

  const supabase = {
    from: vi.fn((table: string) => {
      tableNames.push(table)
      if (table !== 'workflow_handoff_request_grants') {
        throw new Error(`Unexpected table ${table}`)
      }

      const state: FilterState = {
        eq: [],
        in: [],
        orders: [],
        limit: null,
      }
      states.push(state)

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
        then: (resolve: (value: { data: WorkflowHandoffRequestGrantRow[] | null; error: QueryError }) => unknown, reject?: (reason: unknown) => unknown) => {
          if (queryError) {
            return Promise.resolve({ data: null, error: queryError }).then(resolve, reject)
          }

          let data = [...rows]

          for (const [column, value] of state.eq) {
            data = data.filter((row) => (row as any)?.[column] === value)
          }

          for (const [column, values] of state.in) {
            data = data.filter((row) => values.includes((row as any)?.[column]))
          }

          for (const order of [...state.orders].reverse()) {
            data.sort((left, right) => {
              const leftValue = String((left as any)?.[order.column] ?? '')
              const rightValue = String((right as any)?.[order.column] ?? '')
              return order.ascending
                ? leftValue.localeCompare(rightValue)
                : rightValue.localeCompare(leftValue)
            })
          }

          if (typeof state.limit === 'number') {
            data = data.slice(0, state.limit)
          }

          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }

      return query
    }),
  } as any

  return { supabase, states, tableNames }
}

describe('workflow handoff request grants read helpers', () => {
  it('returns grants scoped to installer account', async () => {
    const { supabase, states, tableNames } = makeSupabase([
      makeRow({ id: 'grant-1', installer_account_owner_user_id: 'installer-1', recipient_account_owner_user_id: 'recipient-1' }),
      makeRow({ id: 'grant-2', installer_account_owner_user_id: 'installer-1', recipient_account_owner_user_id: 'recipient-2' }),
      makeRow({ id: 'grant-3', installer_account_owner_user_id: 'installer-2', recipient_account_owner_user_id: 'recipient-1' }),
    ])

    const result = await listWorkflowHandoffRequestGrantsForInstallerAccount(supabase, 'installer-1')

    expect(result.map((row) => row.id)).toEqual(['grant-1', 'grant-2'])
    expect(states[0]?.eq).toEqual([['installer_account_owner_user_id', 'installer-1']])
    expect(tableNames).toEqual(['workflow_handoff_request_grants'])
  })

  it('returns grants scoped to recipient account', async () => {
    const { supabase, states } = makeSupabase([
      makeRow({ id: 'grant-1', installer_account_owner_user_id: 'installer-1', recipient_account_owner_user_id: 'recipient-1' }),
      makeRow({ id: 'grant-2', installer_account_owner_user_id: 'installer-2', recipient_account_owner_user_id: 'recipient-1' }),
      makeRow({ id: 'grant-3', installer_account_owner_user_id: 'installer-1', recipient_account_owner_user_id: 'recipient-2' }),
    ])

    const result = await listWorkflowHandoffRequestGrantsForRecipientAccount(supabase, 'recipient-1')

    expect(result.map((row) => row.id)).toEqual(['grant-1', 'grant-2'])
    expect(states[0]?.eq).toEqual([['recipient_account_owner_user_id', 'recipient-1']])
  })

  it('lists only active grants for recipient account via active helper', async () => {
    const { supabase, states } = makeSupabase([
      makeRow({ id: 'grant-1', recipient_account_owner_user_id: 'recipient-1', grant_status: 'active' }),
      makeRow({ id: 'grant-2', recipient_account_owner_user_id: 'recipient-1', grant_status: 'revoked', revoked_at: '2026-05-31T21:00:00.000Z', revoked_by_user_id: 'user-2' }),
      makeRow({ id: 'grant-3', recipient_account_owner_user_id: 'recipient-2', grant_status: 'active' }),
    ])

    const result = await listActiveWorkflowHandoffRequestGrantsForRecipientAccount(supabase, 'recipient-1')

    expect(result.map((row) => row.id)).toEqual(['grant-1'])
    expect(states[0]?.eq).toEqual([
      ['recipient_account_owner_user_id', 'recipient-1'],
      ['handoff_kind', 'ecc'],
    ])
    expect(states[0]?.in).toEqual([
      ['grant_status', ['active']],
    ])
  })

  it('gets one grant by id for recipient account scope', async () => {
    const { supabase, states } = makeSupabase([
      makeRow({ id: 'grant-1', recipient_account_owner_user_id: 'recipient-1' }),
      makeRow({ id: 'grant-2', recipient_account_owner_user_id: 'recipient-2' }),
    ])

    await expect(getWorkflowHandoffRequestGrantForRecipientAccount(
      supabase,
      'grant-1',
      'recipient-1',
    )).resolves.toEqual(makeRow({ id: 'grant-1', recipient_account_owner_user_id: 'recipient-1' }))

    expect(states[0]?.eq).toEqual([
      ['id', 'grant-1'],
      ['recipient_account_owner_user_id', 'recipient-1'],
    ])
  })

  it('fails open when workflow_handoff_request_grants table is missing', async () => {
    const { supabase } = makeSupabase([], {
      code: '42P01',
      message: 'relation public.workflow_handoff_request_grants does not exist',
    })

    await expect(listWorkflowHandoffRequestGrantsForInstallerAccount(supabase, 'installer-1')).resolves.toEqual([])
    await expect(listWorkflowHandoffRequestGrantsForRecipientAccount(supabase, 'recipient-1')).resolves.toEqual([])
    await expect(listActiveWorkflowHandoffRequestGrantsForRecipientAccount(supabase, 'recipient-1')).resolves.toEqual([])
    await expect(getWorkflowHandoffRequestGrantForRecipientAccount(supabase, 'grant-1', 'recipient-1')).resolves.toBeNull()
  })

  it('returns safe empty/null when account scope is missing', async () => {
    const { supabase, tableNames } = makeSupabase([makeRow({ id: 'grant-1' })])

    await expect(listWorkflowHandoffRequestGrantsForInstallerAccount(supabase, '')).resolves.toEqual([])
    await expect(listWorkflowHandoffRequestGrantsForRecipientAccount(supabase, '')).resolves.toEqual([])
    await expect(listActiveWorkflowHandoffRequestGrantsForRecipientAccount(supabase, '')).resolves.toEqual([])
    await expect(getWorkflowHandoffRequestGrantForRecipientAccount(supabase, 'grant-1', '')).resolves.toBeNull()

    expect(tableNames).toEqual([])
  })
})
