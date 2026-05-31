import { describe, expect, it, vi } from 'vitest'

import {
  getAccountHandoffConnectionByIdForAccount,
  listAccountHandoffConnectionsForAccount,
  listActiveRecipientConnectionsForAccount,
  type AccountHandoffConnectionRow,
} from '../account-handoff-connections-read'

type QueryError = { code?: string; message?: string } | null

type FilterState = {
  eq: Array<[string, unknown]>
  in: Array<[string, unknown[]]>
  or: string[]
  orders: Array<{ column: string; ascending: boolean }>
  limit: number | null
}

function makeRow(input: Partial<AccountHandoffConnectionRow> & { id: string }): AccountHandoffConnectionRow {
  const { id, ...rest } = input

  return {
    id,
    requesting_account_owner_user_id: 'account-a',
    recipient_account_owner_user_id: 'account-b',
    connection_status: 'pending',
    handoff_kind: 'ecc',
    requested_by_user_id: 'user-a',
    approved_by_user_id: null,
    declined_by_user_id: null,
    revoked_by_user_id: null,
    requested_at: '2026-05-31T18:00:00.000Z',
    approved_at: null,
    declined_at: null,
    revoked_at: null,
    connection_note: null,
    created_at: '2026-05-31T18:00:00.000Z',
    updated_at: '2026-05-31T18:00:00.000Z',
    ...rest,
  }
}

function matchesOrScope(row: AccountHandoffConnectionRow, clause: string) {
  if (!clause) {
    return true
  }

  return clause.split(',').some((segment) => {
    const [column, operator, value] = segment.split('.')
    if (operator !== 'eq') {
      return false
    }

    return String((row as any)?.[column] ?? '') === String(value ?? '')
  })
}

function makeSupabase(rows: AccountHandoffConnectionRow[], queryError: QueryError = null) {
  const tableNames: string[] = []
  const states: FilterState[] = []

  const supabase = {
    from: vi.fn((table: string) => {
      tableNames.push(table)
      if (table !== 'account_handoff_connections') {
        throw new Error(`Unexpected table ${table}`)
      }

      const state: FilterState = {
        eq: [],
        in: [],
        or: [],
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
        or: vi.fn((value: string) => {
          state.or.push(value)
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
        then: (resolve: (value: { data: AccountHandoffConnectionRow[] | null; error: QueryError }) => unknown, reject?: (reason: unknown) => unknown) => {
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

          if (state.or.length > 0) {
            data = data.filter((row) => state.or.some((clause) => matchesOrScope(row, clause)))
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

describe('account handoff connections read helpers', () => {
  it('lists connections where the account is requester or recipient', async () => {
    const { supabase, states, tableNames } = makeSupabase([
      makeRow({ id: 'connection-1', requesting_account_owner_user_id: 'account-a', recipient_account_owner_user_id: 'account-b' }),
      makeRow({ id: 'connection-2', requesting_account_owner_user_id: 'account-c', recipient_account_owner_user_id: 'account-a' }),
      makeRow({ id: 'connection-3', requesting_account_owner_user_id: 'account-d', recipient_account_owner_user_id: 'account-e' }),
    ])

    const result = await listAccountHandoffConnectionsForAccount(supabase, 'account-a')

    expect(result.map((row) => row.id)).toEqual(['connection-1', 'connection-2'])
    expect(states[0]?.or).toEqual(['requesting_account_owner_user_id.eq.account-a,recipient_account_owner_user_id.eq.account-a'])
    expect(tableNames).toEqual(['account_handoff_connections'])
  })

  it('lists only active ecc recipient connections for the requesting account', async () => {
    const { supabase, states } = makeSupabase([
      makeRow({ id: 'connection-1', requesting_account_owner_user_id: 'account-a', recipient_account_owner_user_id: 'account-b', connection_status: 'active', handoff_kind: 'ecc' }),
      makeRow({ id: 'connection-2', requesting_account_owner_user_id: 'account-a', recipient_account_owner_user_id: 'account-c', connection_status: 'pending', handoff_kind: 'ecc' }),
      makeRow({ id: 'connection-3', requesting_account_owner_user_id: 'account-a', recipient_account_owner_user_id: 'account-d', connection_status: 'active', handoff_kind: 'ecc' }),
      makeRow({ id: 'connection-4', requesting_account_owner_user_id: 'account-z', recipient_account_owner_user_id: 'account-a', connection_status: 'active', handoff_kind: 'ecc' }),
    ])

    const result = await listActiveRecipientConnectionsForAccount(supabase, 'account-a')

    expect(result.map((row) => row.id)).toEqual(['connection-1', 'connection-3'])
    expect(states[0]?.eq).toEqual([
      ['requesting_account_owner_user_id', 'account-a'],
      ['handoff_kind', 'ecc'],
      ['connection_status', 'active'],
    ])
  })

  it('gets a single connection by id for either side of the account scope', async () => {
    const { supabase, states } = makeSupabase([
      makeRow({ id: 'connection-1', requesting_account_owner_user_id: 'account-a', recipient_account_owner_user_id: 'account-b' }),
      makeRow({ id: 'connection-2', requesting_account_owner_user_id: 'account-c', recipient_account_owner_user_id: 'account-d' }),
    ])

    await expect(getAccountHandoffConnectionByIdForAccount(supabase, 'connection-1', 'account-b')).resolves.toEqual(
      makeRow({ id: 'connection-1', requesting_account_owner_user_id: 'account-a', recipient_account_owner_user_id: 'account-b' }),
    )
    expect(states[0]?.eq).toEqual([['id', 'connection-1']])
    expect(states[0]?.or).toEqual(['requesting_account_owner_user_id.eq.account-b,recipient_account_owner_user_id.eq.account-b'])
  })

  it('fails open when the table is missing', async () => {
    const { supabase } = makeSupabase([], {
      code: '42P01',
      message: 'relation public.account_handoff_connections does not exist',
    })

    await expect(listAccountHandoffConnectionsForAccount(supabase, 'account-a')).resolves.toEqual([])
    await expect(listActiveRecipientConnectionsForAccount(supabase, 'account-a')).resolves.toEqual([])
    await expect(getAccountHandoffConnectionByIdForAccount(supabase, 'connection-1', 'account-a')).resolves.toBeNull()
  })

  it('returns safe empty when account scope is missing', async () => {
    const { supabase, tableNames } = makeSupabase([makeRow({ id: 'connection-1' })])

    await expect(listAccountHandoffConnectionsForAccount(supabase, '')).resolves.toEqual([])
    await expect(listActiveRecipientConnectionsForAccount(supabase, '')).resolves.toEqual([])
    await expect(getAccountHandoffConnectionByIdForAccount(supabase, 'connection-1', '')).resolves.toBeNull()
    expect(tableNames).toEqual([])
  })
})