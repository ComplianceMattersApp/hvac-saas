import type { FocusedQueueJob } from "@/lib/ops/focused-queues";

export type OpsWorkspaceJob = FocusedQueueJob & {
  customer_phone?: string | null;
  action_required_by?: string | null;
  follow_up_date?: string | null;
  ops_board_failure_note?: string | null;
  jurisdiction?: string | null;
  permit_date?: string | null;
  field_complete_at?: string | null;
  billing_disposition?: string | null;
  certs_complete?: boolean | null;
  contractor_id?: string | null;
  contractors?: { name?: string | null } | null;
};

export const OPS_WORKSPACE_JOB_SELECT =
  "id, title, status, job_type, ops_status, scheduled_date, window_start, window_end, city, job_address, customer_first_name, customer_last_name, customer_phone, pending_info_reason, on_hold_reason, follow_up_date, next_action_note, action_required_by, ops_board_failure_note, permit_number, jurisdiction, permit_date, field_complete, field_complete_at, invoice_complete, billing_disposition, certs_complete, contractor_id, contractors(name), created_at";
