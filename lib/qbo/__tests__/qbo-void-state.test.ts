import { describe, expect, it, vi } from "vitest";

import { isMissingQboVoidColumnError, readInvoiceQboVoidState } from "@/lib/qbo/qbo-void-state";

function makeSupabase(result: { data?: any; error?: any }) {
  const builder: any = {};
  Object.assign(builder, {
    from: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })),
  });
  return builder;
}

describe("isMissingQboVoidColumnError", () => {
  it("recognizes the undeployed-column error", () => {
    expect(isMissingQboVoidColumnError({
      code: "42703",
      message: 'column internal_invoices.qbo_void_status does not exist',
    })).toBe(true);
  });

  it("does not swallow unrelated failures", () => {
    expect(isMissingQboVoidColumnError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingQboVoidColumnError({ code: "42703", message: "column jobs.foo does not exist" })).toBe(false);
  });
});

describe("readInvoiceQboVoidState", () => {
  it("returns the recorded state", async () => {
    const supabase = makeSupabase({
      data: {
        id: "inv1",
        qbo_void_status: "blocked",
        qbo_voided_at: null,
        qbo_void_error: "payment applied",
      },
    });
    await expect(readInvoiceQboVoidState({ supabase, accountOwnerUserId: "acc", invoiceId: "inv1" }))
      .resolves.toEqual({ status: "blocked", voidedAt: null, error: "payment applied" });
  });

  it("returns a null STATUS (not null state) when nothing was recorded, so pre-lane voids stay actionable", async () => {
    const supabase = makeSupabase({
      data: { id: "inv1", qbo_void_status: null, qbo_voided_at: null, qbo_void_error: null },
    });
    await expect(readInvoiceQboVoidState({ supabase, accountOwnerUserId: "acc", invoiceId: "inv1" }))
      .resolves.toEqual({ status: null, voidedAt: null, error: null });
  });

  it("returns null when the columns are not deployed, so invoice reads never break", async () => {
    const supabase = makeSupabase({
      error: { code: "42703", message: 'column internal_invoices.qbo_void_status does not exist' },
    });
    await expect(readInvoiceQboVoidState({ supabase, accountOwnerUserId: "acc", invoiceId: "inv1" }))
      .resolves.toBeNull();
  });

  it("returns null instead of throwing when the read blows up", async () => {
    const supabase: any = {
      from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => { throw new Error("boom"); } }) }) }) }),
    };
    await expect(readInvoiceQboVoidState({ supabase, accountOwnerUserId: "acc", invoiceId: "inv1" }))
      .resolves.toBeNull();
  });
});
