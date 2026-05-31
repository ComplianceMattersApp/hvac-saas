import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260531194500_workflow_handoff_requests_foundation.sql',
)

describe('workflow handoff request schema foundation', () => {
  it('defines the durable request table, access controls, and safety checks', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.workflow_handoff_requests')
    expect(sql).toContain('installer_account_owner_user_id')
    expect(sql).toContain('workflow_instance_id')
    expect(sql).toContain('workflow_instance_milestone_id')
    expect(sql).toContain('service_case_id')
    expect(sql).toContain('source_job_id')
    expect(sql).toContain('authorized_handoff_recipient_id')
    expect(sql).toContain('recipient_type_snapshot')
    expect(sql).toContain('recipient_display_name_snapshot')
    expect(sql).toContain('handoff_kind')
    expect(sql).toContain('handoff_status')
    expect(sql).toContain('sent_by_user_id')
    expect(sql).toContain('sent_at')
    expect(sql).toContain('responded_by_user_id')
    expect(sql).toContain('responded_at')
    expect(sql).toContain('response_note')
    expect(sql).toContain('evidence_reference')
    expect(sql).toContain('workflow_handoff_requests_handoff_kind_valid_chk')
    expect(sql).toContain('workflow_handoff_requests_handoff_status_valid_chk')
    expect(sql).toContain('workflow_handoff_requests_response_required_for_non_sent_chk')
    expect(sql).toContain('workflow_handoff_requests_open_recipient_uidx')
    expect(sql).toContain('workflow_handoff_requests_assert_scope')
    expect(sql).toContain('workflow_handoff_requests_set_updated_at')
    expect(sql).toContain('workflow_handoff_requests_select_account_scope')
    expect(sql).toContain('workflow_handoff_requests_insert_account_scope')
    expect(sql).toContain('public.current_internal_account_owner_id()')

    expect(sql).not.toContain('insert into public.jobs')
    expect(sql).not.toContain('insert into public.job_events')
    expect(sql).not.toContain('insert into public.service_cases')
    expect(sql).not.toContain('update public.jobs')
  })
})