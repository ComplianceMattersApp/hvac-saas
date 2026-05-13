import { describe, expect, it } from "vitest";

import {
  classifyMaintenanceAgreementDueState,
  isMaintenanceAgreementFrequency,
  isMaintenanceAgreementStatus,
  isMaintenanceAgreementType,
  listMaintenanceAgreementsForCustomer,
  listMaintenanceAgreementsForLocation,
  listUpcomingOverdueMaintenanceAgreements,
  resolveScopedMaintenanceAgreementJobPrefill,
  summarizeMaintenanceAgreementsForAccount,
} from "@/lib/maintenance-agreements/read-model";

const ACCOUNT_OWNER = "owner-1";
const CUSTOMER_ID = "customer-1";
const LOCATION_ID = "location-1";

type MockAgreement = {
  id: string;
  account_owner_user_id: string;
  customer_id: string;
  primary_location_id: string | null;
  preferred_technician_user_id: string | null;
  agreement_name: string;
  agreement_type: string;
  frequency: string;
  next_due_date: string | null;
  default_visit_scope_summary: string | null;
  default_visit_scope_items: unknown;
  status: string;
  start_date: string;
  renewal_date: string | null;
  internal_notes: string | null;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: string;
  updated_at: string;
};

function makeAgreement(input: Partial<MockAgreement> & { id: string }): MockAgreement {
  return {
    account_owner_user_id: ACCOUNT_OWNER,
    customer_id: CUSTOMER_ID,
    primary_location_id: LOCATION_ID,
    preferred_technician_user_id: null,
    agreement_name: `Agreement ${input.id}`,
    agreement_type: "maintenance",
    frequency: "quarterly",
    next_due_date: "2026-05-20",
    default_visit_scope_summary: null,
    default_visit_scope_items: [],
    status: "active",
    start_date: "2026-01-01",
    renewal_date: null,
    internal_notes: null,
    created_by_user_id: "user-1",
    updated_by_user_id: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...input,
  };
}

function makeSupabaseMock(rows: MockAgreement[]) {
  const calls: Array<{ op: string; column?: string; value?: unknown }> = [];

  const supabase = {
    from(table: string) {
      calls.push({ op: "from", value: table });
      const filters: Array<[string, unknown]> = [];
      const lteFilters: Array<[string, string]> = [];
      let limitValue: number | null = null;

      const exec = () => {
        let data = [...rows];
        for (const [column, value] of filters) {
          data = data.filter((row) => (row as any)[column] === value);
        }
        for (const [column, value] of lteFilters) {
          data = data.filter((row) => String((row as any)[column] ?? "") <= value);
        }
        data.sort((a, b) => {
          const due = String(a.next_due_date ?? "").localeCompare(String(b.next_due_date ?? ""));
          if (due !== 0) return due;
          return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
        });
        if (limitValue !== null) data = data.slice(0, limitValue);
        return { data, error: null };
      };

      const build = (): any => ({
        select: (value: string) => {
          calls.push({ op: "select", value });
          return build();
        },
        eq: (column: string, value: unknown) => {
          calls.push({ op: "eq", column, value });
          filters.push([column, value]);
          return build();
        },
        lte: (column: string, value: string) => {
          calls.push({ op: "lte", column, value });
          lteFilters.push([column, value]);
          return build();
        },
        order: (column: string, value: unknown) => {
          calls.push({ op: "order", column, value });
          return build();
        },
        limit: (value: number) => {
          calls.push({ op: "limit", value });
          limitValue = value;
          return build();
        },
        maybeSingle: async () => {
          const result = exec();
          return { data: result.data[0] ?? null, error: result.error };
        },
        then: (resolve: any, reject?: any) => Promise.resolve(exec()).then(resolve, reject),
      });

      return build();
    },
  };

  return { supabase, calls };
}

describe("maintenance agreement validation helpers", () => {
  it("recognizes allowed model values only", () => {
    expect(isMaintenanceAgreementType("maintenance")).toBe(true);
    expect(isMaintenanceAgreementType("service_contract")).toBe(false);
    expect(isMaintenanceAgreementFrequency("semi_annual")).toBe(true);
    expect(isMaintenanceAgreementFrequency("weekly")).toBe(false);
    expect(isMaintenanceAgreementStatus("active")).toBe(true);
    expect(isMaintenanceAgreementStatus("deleted")).toBe(false);
  });
});

describe("classifyMaintenanceAgreementDueState", () => {
  it("classifies active agreements by due date", () => {
    expect(
      classifyMaintenanceAgreementDueState({
        status: "active",
        nextDueDate: "2026-05-11",
        today: "2026-05-12",
      }),
    ).toBe("overdue");
    expect(
      classifyMaintenanceAgreementDueState({
        status: "active",
        nextDueDate: "2026-05-12",
        today: "2026-05-12",
      }),
    ).toBe("due_today");
    expect(
      classifyMaintenanceAgreementDueState({
        status: "active",
        nextDueDate: "2026-05-13",
        today: "2026-05-12",
      }),
    ).toBe("upcoming");
  });

  it("keeps non-active or missing-date agreements out of due classification", () => {
    expect(classifyMaintenanceAgreementDueState({ status: "paused", nextDueDate: "2026-05-11" })).toBe("inactive");
    expect(classifyMaintenanceAgreementDueState({ status: "active", nextDueDate: null })).toBe("not_scheduled");
  });
});

describe("maintenance agreement read model", () => {
  it("lists customer agreements with explicit account and customer filters", async () => {
    const { supabase, calls } = makeSupabaseMock([
      makeAgreement({ id: "a-1" }),
      makeAgreement({ id: "a-2", customer_id: "other-customer" }),
      makeAgreement({ id: "a-3", account_owner_user_id: "other-owner" }),
    ]);

    const rows = await listMaintenanceAgreementsForCustomer({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      customerId: CUSTOMER_ID,
    });

    expect(rows.map((row) => row.id)).toEqual(["a-1"]);
    expect(calls).toContainEqual({ op: "from", value: "maintenance_agreements" });
    expect(calls).toContainEqual({ op: "eq", column: "account_owner_user_id", value: ACCOUNT_OWNER });
    expect(calls).toContainEqual({ op: "eq", column: "customer_id", value: CUSTOMER_ID });
  });

  it("lists location agreements with explicit account and location filters", async () => {
    const { supabase, calls } = makeSupabaseMock([
      makeAgreement({ id: "a-1" }),
      makeAgreement({ id: "a-2", primary_location_id: "other-location" }),
    ]);

    const rows = await listMaintenanceAgreementsForLocation({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      locationId: LOCATION_ID,
    });

    expect(rows.map((row) => row.id)).toEqual(["a-1"]);
    expect(calls).toContainEqual({ op: "eq", column: "account_owner_user_id", value: ACCOUNT_OWNER });
    expect(calls).toContainEqual({ op: "eq", column: "primary_location_id", value: LOCATION_ID });
  });

  it("lists active upcoming/overdue agreements with a horizon and due state", async () => {
    const { supabase, calls } = makeSupabaseMock([
      makeAgreement({ id: "overdue", next_due_date: "2026-05-10" }),
      makeAgreement({ id: "today", next_due_date: "2026-05-12" }),
      makeAgreement({ id: "future", next_due_date: "2026-05-20" }),
      makeAgreement({ id: "paused", status: "paused", next_due_date: "2026-05-09" }),
    ]);

    const rows = await listUpcomingOverdueMaintenanceAgreements({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      today: "2026-05-12",
      horizonDate: "2026-05-15",
      limit: 25,
    });

    expect(rows.map((row) => [row.id, row.due_state])).toEqual([
      ["overdue", "overdue"],
      ["today", "due_today"],
    ]);
    expect(calls).toContainEqual({ op: "eq", column: "status", value: "active" });
    expect(calls).toContainEqual({ op: "lte", column: "next_due_date", value: "2026-05-15" });
    expect(calls).toContainEqual({ op: "limit", value: 25 });
  });

  it("does not query when required scope identifiers are missing", async () => {
    const { supabase, calls } = makeSupabaseMock([makeAgreement({ id: "a-1" })]);

    await expect(
      listMaintenanceAgreementsForCustomer({
        supabase,
        accountOwnerUserId: "",
        customerId: CUSTOMER_ID,
      }),
    ).resolves.toEqual([]);

    expect(calls).toEqual([]);
  });

  it("summarizes status counts and due buckets for active agreements only", async () => {
    const { supabase, calls } = makeSupabaseMock([
      makeAgreement({ id: "active-overdue", status: "active", next_due_date: "2026-05-11" }),
      makeAgreement({ id: "active-today", status: "active", next_due_date: "2026-05-12" }),
      makeAgreement({ id: "active-next-7", status: "active", next_due_date: "2026-05-19" }),
      makeAgreement({ id: "active-next-30", status: "active", next_due_date: "2026-06-11" }),
      makeAgreement({ id: "active-beyond-30", status: "active", next_due_date: "2026-06-12" }),
      makeAgreement({ id: "active-no-date", status: "active", next_due_date: null }),
      makeAgreement({ id: "draft", status: "draft", next_due_date: "2026-05-10" }),
      makeAgreement({ id: "paused", status: "paused", next_due_date: "2026-05-10" }),
      makeAgreement({ id: "expired", status: "expired", next_due_date: "2026-05-10" }),
      makeAgreement({ id: "cancelled", status: "cancelled", next_due_date: "2026-05-10" }),
    ]);

    const summary = await summarizeMaintenanceAgreementsForAccount({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      today: "2026-05-12",
    });

    expect(summary).toEqual({
      as_of_date: "2026-05-12",
      total_count: 10,
      status_counts: {
        active: 6,
        draft: 1,
        paused: 1,
        expired: 1,
        cancelled: 1,
      },
      due_counts: {
        overdue: 1,
        due_today: 1,
        due_in_next_7_days: 1,
        due_in_next_30_days: 2,
        not_scheduled_active: 1,
      },
    });

    expect(calls).toContainEqual({ op: "eq", column: "account_owner_user_id", value: ACCOUNT_OWNER });
  });

  it("returns safe empty summary and avoids querying when account scope is missing", async () => {
    const { supabase, calls } = makeSupabaseMock([makeAgreement({ id: "a-1" })]);

    const summary = await summarizeMaintenanceAgreementsForAccount({
      supabase,
      accountOwnerUserId: " ",
      today: "2026-05-12",
    });

    expect(summary).toEqual({
      as_of_date: "2026-05-12",
      total_count: 0,
      status_counts: {
        active: 0,
        draft: 0,
        paused: 0,
        expired: 0,
        cancelled: 0,
      },
      due_counts: {
        overdue: 0,
        due_today: 0,
        due_in_next_7_days: 0,
        due_in_next_30_days: 0,
        not_scheduled_active: 0,
      },
    });
    expect(calls).toEqual([]);
  });

  it("resolves scoped prefill for jobs/new and sanitizes summary and items", async () => {
    const { supabase } = makeSupabaseMock([
      makeAgreement({
        id: "prefill-1",
        agreement_name: "Spring Service Plan",
        next_due_date: "2026-05-20",
        default_visit_scope_summary: "  Seasonal tune-up and safety check  ",
        default_visit_scope_items: [
          {
            title: " Inspect condenser coil ",
            details: " Clean as needed ",
            kind: "primary",
          },
        ],
      }),
    ]);

    const prefill = await resolveScopedMaintenanceAgreementJobPrefill({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      customerId: CUSTOMER_ID,
      agreementId: "prefill-1",
    });

    expect(prefill).toMatchObject({
      agreement_id: "prefill-1",
      agreement_name: "Spring Service Plan",
      customer_id: CUSTOMER_ID,
      primary_location_id: LOCATION_ID,
      next_due_date: "2026-05-20",
      default_visit_scope_summary: "Seasonal tune-up and safety check",
    });
    expect(prefill?.default_visit_scope_items).toHaveLength(1);
    expect(prefill?.default_visit_scope_items[0]?.title).toBe("Inspect condenser coil");
  });

  it("fails safe for invalid prefill work items and returns empty items", async () => {
    const { supabase } = makeSupabaseMock([
      makeAgreement({
        id: "prefill-bad-items",
        default_visit_scope_items: [
          {
            title: "",
            details: "Only details triggers validation error",
          },
        ],
      }),
    ]);

    const prefill = await resolveScopedMaintenanceAgreementJobPrefill({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      customerId: CUSTOMER_ID,
      agreementId: "prefill-bad-items",
    });

    expect(prefill?.default_visit_scope_items).toEqual([]);
  });

  it("returns null when scoped prefill cannot be found", async () => {
    const { supabase } = makeSupabaseMock([makeAgreement({ id: "other" })]);

    const prefill = await resolveScopedMaintenanceAgreementJobPrefill({
      supabase,
      accountOwnerUserId: ACCOUNT_OWNER,
      customerId: CUSTOMER_ID,
      agreementId: "missing",
    });

    expect(prefill).toBeNull();
  });
});
