export const QBO_ALLOCATION_REPAIR_BLOCKED_MESSAGES = {
  missing_scope:
    "The repair request was missing its account or finding identity. Reload Needs Attention and try once more.",
  finding_closed:
    "This finding is no longer open. Run reconciliation to refresh the current QuickBooks state.",
  finding_ineligible:
    "This issue is not the narrow, verified allocation case that automatic repair supports. Review it in QuickBooks.",
  payment_not_recorded:
    "The EveryStep payment is no longer recorded. Review the payment ledger before changing anything in QuickBooks.",
  payment_link_changed:
    "The stored QuickBooks payment identity changed after this finding was created. Run reconciliation before taking another action.",
  invoice_not_repairable:
    "The target invoice is no longer an issued, QuickBooks-linked invoice. Review the invoice before changing the payment.",
  job_scope_mismatch:
    "The payment and invoice no longer belong to the same job. No automatic accounting change is safe.",
  qbo_reconnect_required:
    "QuickBooks authorization is no longer active. Reconnect QuickBooks, then run reconciliation again.",
  qbo_payment_missing:
    "QuickBooks no longer has the linked payment. Run reconciliation to refresh the finding; do not collect the customer again.",
  qbo_invoice_missing:
    "QuickBooks no longer has a usable target invoice. Review the invoice in QuickBooks before changing the payment.",
  payment_amount_mismatch:
    "The QuickBooks payment total no longer equals the EveryStep payment. Review the amounts in both systems; automatic repair will not guess.",
  customer_mismatch:
    "QuickBooks assigns the payment and invoice to different customers. Correct the customer or allocation in QuickBooks after accounting review.",
  payment_has_existing_allocation:
    "QuickBooks now applies this payment to another invoice or transaction. Review its existing allocation there; automatic repair will not move it.",
  payment_not_fully_unapplied:
    "QuickBooks does not show the entire payment as unapplied. Review how the payment is split before making any change.",
  invoice_balance_too_small:
    "QuickBooks shows less remaining on the invoice than this payment. The invoice may already be paid or partially paid there. Review its linked payments; do not collect again.",
} as const;

export type QboAllocationRepairBlockedReason = keyof typeof QBO_ALLOCATION_REPAIR_BLOCKED_MESSAGES;

export function qboAllocationRepairBlockedMessage(reason: string | undefined): string {
  if (reason && reason in QBO_ALLOCATION_REPAIR_BLOCKED_MESSAGES) {
    return QBO_ALLOCATION_REPAIR_BLOCKED_MESSAGES[reason as QboAllocationRepairBlockedReason];
  }
  return "QuickBooks changed after this issue was detected, so automatic repair stopped.";
}
