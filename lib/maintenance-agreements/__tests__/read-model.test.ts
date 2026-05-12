import { describe, expect, it } from "vitest";

import {
  classifyMaintenanceAgreementDueState,
  isMaintenanceAgreementFrequency,
  isMaintenanceAgreementStatus,
  isMaintenanceAgreementType,
  listMaintenanceAgreementsForCustomer,
  listMaintenanceAgreementsForLocation,
  listUpcomingOverdueMaintenanceAgreements,
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
});
