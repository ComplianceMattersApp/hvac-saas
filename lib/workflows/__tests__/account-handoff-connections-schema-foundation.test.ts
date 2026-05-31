import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260531213000_account_handoff_connections_foundation.sql',
)

describe('account handoff connections schema foundation', () => {
  it('defines the trust layer table, checks, indexes, and RLS policies', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.account_handoff_connections')
    expect(sql).toContain('requesting_account_owner_user_id')
    expect(sql).toContain('recipient_account_owner_user_id')
    expect(sql).toContain('connection_status')
    expect(sql).toContain('handoff_kind')
    expect(sql).toContain('requested_by_user_id')
    expect(sql).toContain('approved_by_user_id')
    expect(sql).toContain('declined_by_user_id')
    expect(sql).toContain('revoked_by_user_id')
    expect(sql).toContain('requested_at')
    expect(sql).toContain('approved_at')
    expect(sql).toContain('declined_at')
    expect(sql).toContain('revoked_at')
    expect(sql).toContain('connection_note')
    expect(sql).toContain('account_handoff_connections_account_pair_distinct_chk')
    expect(sql).toContain("account_handoff_connections_status_valid_chk")
    expect(sql).toContain("account_handoff_connections_handoff_kind_valid_chk")
    expect(sql).toContain("account_handoff_connections_approved_state_chk")
    expect(sql).toContain("account_handoff_connections_declined_state_chk")
    expect(sql).toContain("account_handoff_connections_revoked_state_chk")
    expect(sql).toContain('account_handoff_connections_live_pair_uidx')
    expect(sql).toContain('LEAST(requesting_account_owner_user_id, recipient_account_owner_user_id)')
    expect(sql).toContain('GREATEST(requesting_account_owner_user_id, recipient_account_owner_user_id)')
    expect(sql).toContain('ALTER TABLE public.account_handoff_connections ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('account_handoff_connections_select_account_scope')
    expect(sql).toContain('account_handoff_connections_insert_requesting_admin_owner_scope')
    expect(sql).toContain('account_handoff_connections_update_relevant_admin_owner_scope')
    expect(sql).toContain('public.current_internal_account_owner_id()')
  })

  it('preserves source-of-truth boundaries and avoids operational table access', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase()

    expect(sql).not.toContain('public.jobs')
    expect(sql).not.toContain('public.service_cases')
    expect(sql).not.toContain('public.job_events')
    expect(sql).not.toContain('public.workflow_handoff_requests')
    expect(sql).not.toContain('insert into public.jobs')
    expect(sql).not.toContain('update public.jobs')
  })
})