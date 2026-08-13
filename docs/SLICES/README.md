# Go-Live Slice Roadmap

Working agreement: each slice is a self-contained spec in this folder, handed to a coding
agent (Codex / Claude in VS Code). When a slice is complete, the branch comes back for
review before the next slice starts. Specs are written so the agent needs no outside
context — repo rules, root cause, design decisions, and acceptance criteria are inside.

Owner decisions already made (do not relitigate inside a slice):
- ECC/rater lane is the launch focus; HVAC-service parity is sequenced after.
- CHEERS/EDDS registry integration is **deferred until core is complete** (CEC approval
  process — strategic track, not a slice).
- CF2R signature-chase tracking: dropped (raters do the CF2Rs themselves in practice).
- Sample-group management (RA2.6): parked until a customer doing subdivision work asks.
- Consumer financing: not pursuing near-term. Payroll: never. Inventory/commissions: not yet.
- Recurring visits must generate **due visits into the Needs Scheduling queue** — never
  auto-book customer appointments.

| # | Slice | Status |
|---|-------|--------|
| 1 | QBO correctness — per-line item mapping (Qty-shows-as-hours fix) + verify-after-write on invoice & payment sync | **Merged to main.** Owner note: QBO-sandbox manual QA deferred — owner holds the step list and will return to it |
| 2 | Sales tax — schema, invoice UI/PDF, QBO tax mapping (rater default: non-taxable services) | **Implemented + reviewed (2 passes), approved to merge.** Fail-loud subtotal change pre-verified against live data 2026-08-13: `line_subtotal` CHECK constraint confirmed present, zero rows violating — no watch period needed |
| 3 | Offline draft persistence on ECC test forms (`/jobs/[id]/tests`) | **Ready — see SLICE-03-offline-test-drafts.md** |
| 4 | Twilio self-serve tenant provisioning (in-app A2P registration wizard + status tracking + tenant-admin activation) | **Ready — see SLICE-04-twilio-self-serve-provisioning.md** (builds on the owner's Lane 7 spec in docs/ACTIVE; per-tenant cost ≈ $19.50 one-time + ~$2.65/mo, absorbed vs passed-through is an owner pricing decision) |
| 5 | Recurring visit generation → Needs Scheduling queue (no auto-booking) | Not started |
| 6 | Hardening pair — `(account_owner_user_id, user_id)` unique constraint + role-change audit events | Not started |
| 7 | CHEERS Entry Summary field-order alignment with registry entry screens | Not started |
| 8 | Cleanup — delete classic job-detail branch + retired mobile renderer, purge stale root audit docs/cruft, refresh schema snapshot | Not started |
| 9 | Owner actions (no code) — workshare prod smoke test; tenancy-transfer contingency memo | Not started |
| — | (Open slot: second go-live item, TBD by owner) | — |

Parallel strategic track (after core): EDDS regulations research → go/no-go memo.
