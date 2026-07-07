import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = path.join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260706120000_account_workshare_connections_foundation.sql',
)

describe('account workshare connections schema foundation', () => {
  it('defines a directional ECC/HERS connection table with directional uniqueness', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.account_workshare_connections')
    expect(sql).toContain('sender_account_id')
    expect(sql).toContain('receiver_account_id')
    expect(sql).toContain("service_type          text        NOT NULL DEFAULT 'ecc_hers'")
    expect(sql).toContain("status                text        NOT NULL DEFAULT 'pending'")
    expect(sql).toContain('invite_email')
    expect(sql).toContain('invite_company_name')
    expect(sql).toContain('invite_token_hash')
    expect(sql).toContain('account_workshare_connections_live_directional_pair_uidx')
    expect(sql).toContain('ON public.account_workshare_connections (sender_account_id, receiver_account_id, service_type)')
    expect(sql).not.toContain('LEAST(')
    expect(sql).not.toContain('GREATEST(')
  })

  it('keeps P1-B isolated from jobs, handoff requests, portals, and money domains', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase()

    expect(sql).not.toContain('public.jobs')
    expect(sql).not.toContain('public.customers')
    expect(sql).not.toContain('public.ecc_test_runs')
    expect(sql).not.toContain('public.workflow_handoff_requests')
    expect(sql).not.toContain('public.workflow_handoff_request_grants')
    expect(sql).not.toContain('public.contractor_users')
    expect(sql).not.toContain('public.contractor_invites')
    expect(sql).not.toContain('stripe')
    expect(sql).not.toContain('qbo')
    expect(sql).not.toContain('sms')
  })

  it('scopes reads and mutations by internal account owner parties', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('ALTER TABLE public.account_workshare_connections ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('account_workshare_connections_select_party_scope')
    expect(sql).toContain('sender_account_id = public.current_internal_account_owner_id()')
    expect(sql).toContain('receiver_account_id = public.current_internal_account_owner_id()')
    expect(sql).toContain('account_workshare_connections_insert_receiver_admin_owner_scope')
    expect(sql).toContain('account_workshare_connections_update_receiver_admin_owner_scope')
    expect(sql).not.toContain('account_workshare_connections_update_sender_admin_owner_scope')
  })
})
