import { describe, expect, it } from "vitest";
import { resolveInvoicePaymentLinkUiState } from "../invoice-payment-link-ui";

describe("resolveInvoicePaymentLinkUiState", () => {
  it("shows the customer payment link action for issued invoices with a balance and ready connect", () => {
    const state = resolveInvoicePaymentLinkUiState({
      billingMode: "internal_invoicing",
      invoiceStatus: "issued",
      balanceDueCents: 12500,
      connectReady: true,
    });

    expect(state).toEqual(
      expect.objectContaining({
        showPanel: true,
        showCreateButton: true,
        showSetupRequired: false,
      }),
    );
  });

  it("hides the action for draft invoices", () => {
    const state = resolveInvoicePaymentLinkUiState({
      billingMode: "internal_invoicing",
      invoiceStatus: "draft",
      balanceDueCents: 12500,
      connectReady: true,
    });

    expect(state.showPanel).toBe(false);
    expect(state.showCreateButton).toBe(false);
    expect(state.showSetupRequired).toBe(false);
  });

  it("hides the action for void invoices", () => {
    const state = resolveInvoicePaymentLinkUiState({
      billingMode: "internal_invoicing",
      invoiceStatus: "void",
      balanceDueCents: 12500,
      connectReady: true,
    });

    expect(state.showPanel).toBe(false);
  });

  it("hides the action for paid or zero-balance invoices", () => {
    const paidState = resolveInvoicePaymentLinkUiState({
      billingMode: "internal_invoicing",
      invoiceStatus: "issued",
      balanceDueCents: 0,
      connectReady: true,
    });

    expect(paidState.showPanel).toBe(false);
  });

  it("shows setup-required guidance when Connect is not ready", () => {
    const state = resolveInvoicePaymentLinkUiState({
      billingMode: "internal_invoicing",
      invoiceStatus: "issued",
      balanceDueCents: 12500,
      connectReady: false,
    });

    expect(state).toEqual(
      expect.objectContaining({
        showPanel: true,
        showCreateButton: false,
        showSetupRequired: true,
        setupHref: "/ops/admin/company-profile",
      }),
    );
  });

  it("hides the action outside internal invoicing mode", () => {
    const state = resolveInvoicePaymentLinkUiState({
      billingMode: "external_billing",
      invoiceStatus: "issued",
      balanceDueCents: 12500,
      connectReady: true,
    });

    expect(state.showPanel).toBe(false);
  });
});