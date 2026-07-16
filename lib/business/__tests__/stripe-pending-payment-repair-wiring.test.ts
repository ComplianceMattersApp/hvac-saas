import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const repair = readFileSync(resolve(__dirname, "../stripe-pending-payment-repair.ts"), "utf8");
const action = readFileSync(resolve(__dirname, "../../actions/stripe-pending-payment-repair-actions.ts"), "utf8");
const page = readFileSync(resolve(__dirname, "../../../app/reports/stripe-reconciliation/page.tsx"), "utf8");
const cleanup = readFileSync(resolve(__dirname, "../stripe-abandoned-session-cleanup.ts"), "utf8");

describe("Stripe pending-payment repair safety wiring", () => {
  it("requires financial lifecycle authority and explicit confirmation", () => {
    expect(action).toContain("canManageInvoiceLifecycle");
    expect(action).toContain('formData.get("confirm_repair") === "yes"');
    expect(page).toContain('name="confirm_repair"');
  });

  it("re-fetches Stripe truth and refuses ambiguous paid sessions", () => {
    expect(repair).toContain("checkout.sessions.retrieve");
    expect(repair).toContain("paid.length !== 1");
    expect(repair).toContain('"multiple_paid_sessions"');
    expect(repair).toContain('"selected_session_not_paid"');
  });

  it("requires exact scope, amount, connected account, and original Stripe event", () => {
    expect(repair).toContain("metadata_mismatch");
    expect(repair).toContain("amount_mismatch");
    expect(repair).toContain("readiness.connectedAccountId");
    expect(repair).toContain('type: "checkout.session.completed"');
    expect(repair).toContain("original_event_not_found");
  });

  it("reuses webhook settlement before downstream QBO and receipt follow-through", () => {
    expect(repair).toContain("recordTenantInvoicePaymentFromCheckoutSession");
    expect(repair).toContain("autoSyncRecordedPaymentToQbo");
    expect(repair).toContain("deliverInternalPaymentReceivedEmail");
  });

  it("does not expose bulk repair", () => {
    expect(page).not.toContain("Repair all");
    expect(page).toContain("Repair this payment");
  });

  it("closes only verified open sessions after another payment was recorded", () => {
    expect(cleanup).toContain('payment_status", "recorded"');
    expect(cleanup).toContain('session.status !== "open"');
    expect(cleanup).toContain("checkout.sessions.expire");
    expect(cleanup.indexOf("checkout.sessions.expire")).toBeLessThan(cleanup.indexOf('.update({ payment_status: "failed"'));
    expect(page).toContain("Close abandoned session");
    expect(page).not.toContain("Close all abandoned");
  });
});
