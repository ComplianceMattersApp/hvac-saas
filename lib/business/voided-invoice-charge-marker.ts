/**
 * Shared marker for Stripe charges that succeeded after their invoice was voided.
 *
 * The Stripe webhook writes it into the pending payment row's notes; the
 * attention center matches on it to raise the charge as money needing a refund
 * decision. It lives in its own module so neither side has to import the other
 * (the webhook module pulls in Stripe and job actions, which has no business
 * being loaded by a read model) and so the literal cannot drift between them.
 */
export const VOIDED_INVOICE_CHARGE_MARKER = "[PAID AFTER VOID]";
