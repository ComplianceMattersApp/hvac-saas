# Production Schema Stabilization Closeout

Date: 2026-06-08

Production ref: `ornrnvxtwwtulohqwxop`

## Summary

The production schema stabilization lane is closed. The original P0 `/ops` runtime crash was caused by production schema drift around optional field billing/reporting objects, not only a PostgREST schema-cache reload issue.

Runtime fail-soft hardening was added in commit `76a33a1` and remains permanent defensive coverage. Missing optional field billing/reporting schema must fail closed or return empty/default read states rather than crash active routes.

## Targeted Repairs Applied

The following repair migrations were created, validated, and applied with focused/manual production commands instead of broad `supabase db push` or `--include-all`:

- `20260608120000_repair_field_billing_schema_drift`
- `20260608143000_repair_internal_invoices_supplemental_schema_drift`
- `20260608160000_repair_field_charge_proposals_schema_drift`
- `20260608180000_repair_maintenance_agreement_templates_schema_drift`
- `20260608200000_repair_workflow_handoff_schema_drift`

Each repair was scoped to its drift family, verified locally and against production with read-only checks, then applied manually/targeted to production ref `ornrnvxtwwtulohqwxop`. No unrelated drift migrations were applied.

## Safety Outcome

- No production application data was mutated.
- No seed rows were inserted.
- No invoice/payment/Stripe/provider data or behavior was changed by the repair lane.
- Authenticated smoke passed after repairs.
- Vercel logs were clean after repairs, with no missing-table or missing-column crash signatures.

## Remaining Drift Guardrail

`supabase db push --include-all` remains unsafe unless separately audited and explicitly approved. The repo still contains historical migration ledger drift that must not be bulk-applied by default.

The remaining `20260530130000_jobs_account_owner_write_compat.sql` item is migration-history/ledger-only from the drift audit because the expected production objects already exist.

Calendar work may resume after this closeout note is committed.
