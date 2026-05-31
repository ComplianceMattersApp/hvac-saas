import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260531223000_workflow_handoff_request_grants_foundation.sql',
)

describe('workflow handoff request grants schema foundation', () => {
  it('defines request-scoped grant table, checks, indexes, and policies', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.workflow_handoff_request_grants')
    expect(sql).toContain('installer_account_owner_user_id')
    expect(sql).toContain('recipient_account_owner_user_id')
    expect(sql).toContain('account_handoff_connection_id')
    expect(sql).toContain('workflow_handoff_request_id')
    expect(sql).toContain('authorized_handoff_recipient_id')
    expect(sql).toContain('handoff_kind')
    expect(sql).toContain('grant_status')
    expect(sql).toContain('shared_scope')
    expect(sql).toContain('granted_by_user_id')
    expect(sql).toContain('granted_at')
    expect(sql).toContain('revoked_by_user_id')
    expect(sql).toContain('revoked_at')
    expect(sql).toContain('revoke_reason')

    expect(sql).toContain('workflow_handoff_request_grants_account_pair_distinct_chk')
    expect(sql).toContain('workflow_handoff_request_grants_handoff_kind_valid_chk')
    expect(sql).toContain('workflow_handoff_request_grants_status_valid_chk')
    expect(sql).toContain('workflow_handoff_request_grants_shared_scope_valid_chk')
    expect(sql).toContain('workflow_handoff_request_grants_revoked_state_chk')

    expect(sql).toContain('workflow_handoff_request_grants_installer_account_idx')
    expect(sql).toContain('workflow_handoff_request_grants_recipient_account_idx')
    expect(sql).toContain('workflow_handoff_request_grants_request_idx')
    expect(sql).toContain('workflow_handoff_request_grants_connection_idx')
    expect(sql).toContain('workflow_handoff_request_grants_active_request_recipient_uidx')
    expect(sql).toContain("WHERE grant_status = 'active'")

    expect(sql).toContain('ALTER TABLE public.workflow_handoff_request_grants ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('workflow_handoff_request_grants_select_installer_account_scope')
    expect(sql).toContain('workflow_handoff_request_grants_select_recipient_account_scope')
    expect(sql).toContain('workflow_handoff_request_grants_insert_installer_admin_owner_scope')
    expect(sql).toContain('workflow_handoff_request_grants_update_revoke_installer_admin_owner_scope')
    expect(sql).toContain('public.current_internal_account_owner_id()')
  })

  it('keeps source-of-truth boundaries and avoids operational access policies', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase()

    expect(sql).not.toContain('public.jobs')
    expect(sql).not.toContain('public.service_cases')
    expect(sql).not.toContain('public.job_events')
    expect(sql).not.toContain('public.customers')
    expect(sql).not.toContain('public.internal_invoices')
    expect(sql).not.toContain('public.internal_invoice_payments')
    expect(sql).not.toContain('public.outbound_sms_messages')
    expect(sql).not.toContain('public.qbo_sync_events')
    expect(sql).not.toContain('public.portal_notifications')
    expect(sql).not.toContain('jobs_select')
    expect(sql).not.toContain('service_cases_select')
    expect(sql).not.toContain('job_events_select')
  })
})
