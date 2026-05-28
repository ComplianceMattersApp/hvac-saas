import { beforeEach, describe, expect, it } from "vitest";
import {
  disableOrRevokeTenantCustomerAutopayConsent,
  enableTenantCustomerAutopayConsent,
} from "@/lib/business/tenant-customer-autopay-consents";

type SeedState = {
  customer?: any;
  agreement?: any;
  profile?: any;
  method?: any;
  currentConsent?: any;
};

function makeAdmin(seed: SeedState = {}) {
  const tablesTouched: string[] = [];
  const forbidden = [
    "internal_invoice_payments",
    "internal_invoice_payment_allocations",
    "internal_invoices",
    "maintenance_agreement_visits",
  ];

  const has = (key: keyof SeedState) => Object.prototype.hasOwnProperty.call(seed, key);

  const state = {
    customer: has("customer")
      ? seed.customer
      : {
        id: "cust-1",
        owner_user_id: "owner-1",
      },
    agreement: has("agreement")
      ? seed.agreement
      : {
        id: "ma-1",
        account_owner_user_id: "owner-1",
        customer_id: "cust-1",
      },
    profile: has("profile")
      ? seed.profile
      : {
        id: "tsc-1",
        customer_id: "cust-1",
        account_owner_user_id: "owner-1",
        stripe_connected_account_id: "acct_123",
        stripe_customer_id: "cus_123",
        profile_status: "active",
        is_current: true,
      },
    method: has("method")
      ? seed.method
      : {
        id: "pm-row-1",
        customer_id: "cust-1",
        account_owner_user_id: "owner-1",
        tenant_stripe_customer_id: "tsc-1",
        stripe_connected_account_id: "acct_123",
        stripe_customer_id: "cus_123",
        stripe_payment_method_id: "pm_123",
        payment_method_status: "active",
        detached_at: null,
        invalidated_at: null,
      },
    consents: has("currentConsent") && seed.currentConsent ? [{ ...seed.currentConsent }] : [],
  };

  const inserts: Array<{ table: string; payload: any }> = [];
  const updates: Array<{ table: string; payload: any; id: string }> = [];

  const from = (table: string) => {
    tablesTouched.push(table);

    if (forbidden.includes(table)) {
      throw new Error(`Forbidden table touched: ${table}`);
    }

    if (table === "customers") {
      return {
        select() {
          return {
            eq(_c: string, value: string) {
              return {
                async maybeSingle() {
                  return {
                    data: state.customer?.id === value ? state.customer : null,
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    }

    if (table === "maintenance_agreements") {
      return {
        select() {
          return {
            eq(_c: string, value: string) {
              return {
                async maybeSingle() {
                  return {
                    data: state.agreement?.id === value ? state.agreement : null,
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    }

    if (table === "tenant_stripe_customers") {
      return {
        select() {
          return {
            eq(_c: string, value: string) {
              return {
                async maybeSingle() {
                  return {
                    data: state.profile?.id === value ? state.profile : null,
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    }

    if (table === "tenant_customer_payment_methods") {
      return {
        select() {
          return {
            eq(_c: string, value: string) {
              return {
                async maybeSingle() {
                  return {
                    data: state.method?.id === value ? state.method : null,
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    }

    if (table === "tenant_customer_autopay_consents") {
      return {
        select() {
          const filters: Record<string, unknown> = {};

          const chain: any = {
            eq: (column: string, value: unknown) => {
              filters[column] = value;
              return chain;
            },
            order: () => chain,
            limit: async () => {
              const rows = state.consents.filter((row) =>
                Object.entries(filters).every(([k, v]) => row[k] === v),
              );
              return { data: rows.slice(0, 1), error: null };
            },
          };

          return chain;
        },
        insert(payload: any) {
          const id = `consent-${state.consents.length + 1}`;
          const row = { id, ...payload };
          state.consents.push(row);
          inserts.push({ table, payload: row });
          return {
            select() {
              return {
                async single() {
                  return { data: { id }, error: null };
                },
              };
            },
          };
        },
        update(payload: any) {
          return {
            async eq(_column: string, value: string) {
              const idx = state.consents.findIndex((row) => row.id === value);
              if (idx >= 0) {
                state.consents[idx] = { ...state.consents[idx], ...payload };
                updates.push({ table, payload, id: value });
              }
              return { error: null };
            },
          };
        },
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  };

  return {
    admin: { from },
    inserts,
    updates,
    state,
    tablesTouched,
  };
}

describe("tenant customer autopay consents", () => {
  beforeEach(() => {
    // no-op
  });

  it("enables consent with active profile and active saved method", async () => {
    const ctx = makeAdmin();

    const result = await enableTenantCustomerAutopayConsent({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
      maintenanceAgreementId: "ma-1",
      tenantStripeCustomerId: "tsc-1",
      tenantCustomerPaymentMethodId: "pm-row-1",
      consentVersion: "v1",
      consentTextSnapshot: "I authorize scheduled autopay.",
      consentTextHash: "hash-1",
      consentChannel: "internal_recorded",
      consentSource: "internal_staff_recorded",
      consentedByActorType: "internal_user",
      consentedByUserId: "user-1",
      maxAmountCents: 500000,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("enabled");
    expect(ctx.inserts).toHaveLength(1);
    expect(ctx.inserts[0]?.payload.consent_status).toBe("enabled");
  });

  it("blocks missing payment profile", async () => {
    const ctx = makeAdmin({ profile: null as any });

    const result = await enableTenantCustomerAutopayConsent({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
      maintenanceAgreementId: "ma-1",
      tenantStripeCustomerId: "tsc-1",
      tenantCustomerPaymentMethodId: "pm-row-1",
      consentVersion: "v1",
      consentTextSnapshot: "snap",
      consentTextHash: "hash-1",
      consentChannel: "internal_recorded",
      consentSource: "internal_staff_recorded",
      consentedByActorType: "internal_user",
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe("missing_payment_profile");
    expect(ctx.inserts).toHaveLength(0);
  });

  it("blocks inactive profile", async () => {
    const ctx = makeAdmin({
      profile: {
        id: "tsc-1",
        customer_id: "cust-1",
        account_owner_user_id: "owner-1",
        stripe_connected_account_id: "acct_123",
        stripe_customer_id: "cus_123",
        profile_status: "disabled",
        is_current: false,
      },
    });

    const result = await enableTenantCustomerAutopayConsent({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
      maintenanceAgreementId: "ma-1",
      tenantStripeCustomerId: "tsc-1",
      tenantCustomerPaymentMethodId: "pm-row-1",
      consentVersion: "v1",
      consentTextSnapshot: "snap",
      consentTextHash: "hash-1",
      consentChannel: "internal_recorded",
      consentSource: "internal_staff_recorded",
      consentedByActorType: "internal_user",
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe("payment_profile_inactive");
  });

  it("blocks missing payment method", async () => {
    const ctx = makeAdmin({ method: null as any });

    const result = await enableTenantCustomerAutopayConsent({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
      maintenanceAgreementId: "ma-1",
      tenantStripeCustomerId: "tsc-1",
      tenantCustomerPaymentMethodId: "pm-row-1",
      consentVersion: "v1",
      consentTextSnapshot: "snap",
      consentTextHash: "hash-1",
      consentChannel: "internal_recorded",
      consentSource: "internal_staff_recorded",
      consentedByActorType: "internal_user",
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe("missing_saved_payment_method");
  });

  it("blocks inactive or detached method", async () => {
    const ctx = makeAdmin({
      method: {
        id: "pm-row-1",
        customer_id: "cust-1",
        account_owner_user_id: "owner-1",
        tenant_stripe_customer_id: "tsc-1",
        stripe_connected_account_id: "acct_123",
        stripe_customer_id: "cus_123",
        stripe_payment_method_id: "pm_123",
        payment_method_status: "detached",
        detached_at: "2026-05-28T00:00:00.000Z",
        invalidated_at: null,
      },
    });

    const result = await enableTenantCustomerAutopayConsent({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
      maintenanceAgreementId: "ma-1",
      tenantStripeCustomerId: "tsc-1",
      tenantCustomerPaymentMethodId: "pm-row-1",
      consentVersion: "v1",
      consentTextSnapshot: "snap",
      consentTextHash: "hash-1",
      consentChannel: "internal_recorded",
      consentSource: "internal_staff_recorded",
      consentedByActorType: "internal_user",
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe("saved_payment_method_inactive");
  });

  it("blocks cross-account/profile-method mismatch", async () => {
    const ctx = makeAdmin({
      method: {
        id: "pm-row-1",
        customer_id: "cust-2",
        account_owner_user_id: "owner-1",
        tenant_stripe_customer_id: "tsc-1",
        stripe_connected_account_id: "acct_123",
        stripe_customer_id: "cus_123",
        stripe_payment_method_id: "pm_123",
        payment_method_status: "active",
        detached_at: null,
        invalidated_at: null,
      },
    });

    const result = await enableTenantCustomerAutopayConsent({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
      maintenanceAgreementId: "ma-1",
      tenantStripeCustomerId: "tsc-1",
      tenantCustomerPaymentMethodId: "pm-row-1",
      consentVersion: "v1",
      consentTextSnapshot: "snap",
      consentTextHash: "hash-1",
      consentChannel: "internal_recorded",
      consentSource: "internal_staff_recorded",
      consentedByActorType: "internal_user",
    });

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe("saved_payment_method_scope_mismatch");
  });

  it("rejects card credential fields and does not store them", async () => {
    const ctx = makeAdmin();

    const result = await enableTenantCustomerAutopayConsent({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
      maintenanceAgreementId: "ma-1",
      tenantStripeCustomerId: "tsc-1",
      tenantCustomerPaymentMethodId: "pm-row-1",
      consentVersion: "v1",
      consentTextSnapshot: "snap",
      consentTextHash: "hash-1",
      consentChannel: "internal_recorded",
      consentSource: "internal_staff_recorded",
      consentedByActorType: "internal_user",
      cardNumber: "4242424242424242",
      cvc: "123",
    } as any);

    expect(result.ok).toBe(false);
    expect(result.blockedReason).toBe("forbidden_payment_credentials_input");
    expect(ctx.inserts).toHaveLength(0);
  });

  it("idempotent enable does not create duplicate current enabled consent", async () => {
    const ctx = makeAdmin({
      currentConsent: {
        id: "consent-existing",
        account_owner_user_id: "owner-1",
        customer_id: "cust-1",
        maintenance_agreement_id: "ma-1",
        tenant_stripe_customer_id: "tsc-1",
        tenant_customer_payment_method_id: "pm-row-1",
        stripe_connected_account_id: "acct_123",
        consent_status: "enabled",
        is_current: true,
        consent_version: "v1",
        consent_text_hash: "hash-1",
        max_amount_cents: null,
      },
    });

    const result = await enableTenantCustomerAutopayConsent({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
      maintenanceAgreementId: "ma-1",
      tenantStripeCustomerId: "tsc-1",
      tenantCustomerPaymentMethodId: "pm-row-1",
      consentVersion: "v1",
      consentTextSnapshot: "snap",
      consentTextHash: "hash-1",
      consentChannel: "internal_recorded",
      consentSource: "internal_staff_recorded",
      consentedByActorType: "internal_user",
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("noop");
    expect(ctx.inserts).toHaveLength(0);
  });

  it("disable/revoke preserves history and does not delete payment method", async () => {
    const ctx = makeAdmin({
      currentConsent: {
        id: "consent-existing",
        account_owner_user_id: "owner-1",
        customer_id: "cust-1",
        maintenance_agreement_id: "ma-1",
        tenant_stripe_customer_id: "tsc-1",
        tenant_customer_payment_method_id: "pm-row-1",
        stripe_connected_account_id: "acct_123",
        consent_status: "enabled",
        is_current: true,
        consent_version: "v1",
        consent_text_hash: "hash-1",
        max_amount_cents: null,
      },
    });

    const disabled = await disableOrRevokeTenantCustomerAutopayConsent({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
      maintenanceAgreementId: "ma-1",
      action: "disable",
      actorUserId: "user-1",
      reasonCode: "customer_request",
    });

    expect(disabled.ok).toBe(true);
    expect(disabled.status).toBe("disabled");
    expect(ctx.updates.length).toBe(1);

    const revoked = await disableOrRevokeTenantCustomerAutopayConsent({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
      maintenanceAgreementId: "ma-1",
      action: "revoke",
      actorUserId: "user-1",
      reasonCode: "policy_violation",
    });

    expect(revoked.ok).toBe(true);
    expect(revoked.status).toBe("revoked");
    expect(ctx.tablesTouched.includes("tenant_customer_payment_methods")).toBe(false);
  });

  it("does not write payment/allocation/invoice/visit rows and preserves no-mutation flags", async () => {
    const ctx = makeAdmin();

    const result = await enableTenantCustomerAutopayConsent({
      admin: ctx.admin,
      accountOwnerUserId: "owner-1",
      customerId: "cust-1",
      maintenanceAgreementId: "ma-1",
      tenantStripeCustomerId: "tsc-1",
      tenantCustomerPaymentMethodId: "pm-row-1",
      consentVersion: "v1",
      consentTextSnapshot: "snap",
      consentTextHash: "hash-1",
      consentChannel: "internal_recorded",
      consentSource: "internal_staff_recorded",
      consentedByActorType: "internal_user",
    });

    expect(result.ok).toBe(true);
    expect(result.noPaymentRowWrites).toBe(true);
    expect(result.noAllocationRowWrites).toBe(true);
    expect(result.noInvoiceMutations).toBe(true);
    expect(result.noVisitOrNextDueMutations).toBe(true);
  });
});
