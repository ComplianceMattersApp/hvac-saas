import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reconcileStaleStripeSuccessfulPayments = vi.fn();
const createAdminClient = vi.fn(() => ({ __admin: true }));

vi.mock("@/lib/business/stripe-successful-payment-reconciliation", () => ({
  reconcileStaleStripeSuccessfulPayments: (...args: unknown[]) =>
    reconcileStaleStripeSuccessfulPayments(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: (...args: unknown[]) => createAdminClient(...args),
}));

async function getReconciliation(authHeader?: string) {
  const { GET } = await import("@/app/api/cron/stripe-payment-reconciliation/route");
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return GET(
    new Request("http://localhost/api/cron/stripe-payment-reconciliation", { headers }),
  );
}

describe("GET /api/cron/stripe-payment-reconciliation — cron auth guard + outcome aggregation", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cron-secret-1");
    reconcileStaleStripeSuccessfulPayments.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 and never reconciles when CRON_SECRET is not configured (fail closed)", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const res = await getReconciliation("Bearer cron-secret-1");

    expect(res.status).toBe(401);
    expect(reconcileStaleStripeSuccessfulPayments).not.toHaveBeenCalled();
  });

  it("returns 401 when the Authorization header does not match the secret", async () => {
    const res = await getReconciliation("Bearer wrong-secret");

    expect(res.status).toBe(401);
    expect(reconcileStaleStripeSuccessfulPayments).not.toHaveBeenCalled();
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const res = await getReconciliation();

    expect(res.status).toBe(401);
    expect(reconcileStaleStripeSuccessfulPayments).not.toHaveBeenCalled();
  });

  it("runs bounded reconciliation and aggregates outcome counts for an authorized cron call", async () => {
    reconcileStaleStripeSuccessfulPayments.mockResolvedValue([
      { outcome: "already_reconciled", financialMutation: false },
      { outcome: "already_reconciled", financialMutation: false },
      { outcome: "not_paid", financialMutation: false },
      { outcome: "allocation_repaired", paymentId: "payment-1", financialMutation: false },
    ]);

    const res = await getReconciliation("Bearer cron-secret-1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checked).toBe(4);
    expect(body.outcomes).toEqual({
      already_reconciled: 2,
      not_paid: 1,
      allocation_repaired: 1,
    });
    expect(reconcileStaleStripeSuccessfulPayments).toHaveBeenCalledWith(
      expect.objectContaining({ admin: expect.anything(), limit: 25 }),
    );
  });

  it("reports an empty outcome map when there is nothing stale to reconcile", async () => {
    const res = await getReconciliation("Bearer cron-secret-1");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checked).toBe(0);
    expect(body.outcomes).toEqual({});
  });
});
