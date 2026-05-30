import { describe, expect, it } from "vitest";

import {
  listMaintenanceAgreementTemplatesForAccount,
  normalizeMaintenanceAgreementTemplateLifecycleStatus,
  normalizeMaintenanceAgreementTemplateName,
} from "@/lib/maintenance-agreements/template-read-model";

type MockTemplate = {
  id: string;
  account_owner_user_id: string;
  template_name: string;
  agreement_type: string;
  frequency: string;
  default_visit_scope_summary: string | null;
  default_visit_scope_items: unknown;
  internal_notes_default: string | null;
  lifecycle_status: string;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: string;
  updated_at: string;
};

function makeTemplate(input: Partial<MockTemplate> & { id: string }): MockTemplate {
  return {
    account_owner_user_id: "owner-1",
    template_name: `Template ${input.id}`,
    agreement_type: "maintenance",
    frequency: "quarterly",
    default_visit_scope_summary: null,
    default_visit_scope_items: [],
    internal_notes_default: null,
    lifecycle_status: "active",
    created_by_user_id: "user-1",
    updated_by_user_id: "user-1",
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
    ...input,
  };
}

function makeSupabaseMock(rows: MockTemplate[]) {
  const calls: Array<{ op: string; column?: string; value?: unknown }> = [];

  const supabase = {
    from(table: string) {
      calls.push({ op: "from", value: table });
      const filters: Array<[string, unknown]> = [];
      let limitValue: number | null = null;

      const exec = () => {
        let data = [...rows];
        for (const [column, value] of filters) {
          data = data.filter((row) => (row as any)[column] === value);
        }

        data.sort((a, b) =>
          String(a.template_name ?? "").localeCompare(String(b.template_name ?? "")),
        );

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

describe("maintenance agreement template read model", () => {
  it("returns safe-empty list when account scope is missing", async () => {
    const { supabase, calls } = makeSupabaseMock([makeTemplate({ id: "tpl-1" })]);

    const rows = await listMaintenanceAgreementTemplatesForAccount({
      supabase,
      accountOwnerUserId: "",
    });

    expect(rows).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("lists active templates only by default", async () => {
    const { supabase } = makeSupabaseMock([
      makeTemplate({ id: "tpl-1", lifecycle_status: "active", template_name: "B" }),
      makeTemplate({ id: "tpl-2", lifecycle_status: "archived", template_name: "A" }),
    ]);

    const rows = await listMaintenanceAgreementTemplatesForAccount({
      supabase,
      accountOwnerUserId: "owner-1",
    });

    expect(rows.map((row) => row.id)).toEqual(["tpl-1"]);
    expect(rows[0]?.lifecycle_status).toBe("active");
  });

  it("includes archived templates when requested", async () => {
    const { supabase } = makeSupabaseMock([
      makeTemplate({ id: "tpl-1", lifecycle_status: "active", template_name: "B" }),
      makeTemplate({ id: "tpl-2", lifecycle_status: "archived", template_name: "A" }),
    ]);

    const rows = await listMaintenanceAgreementTemplatesForAccount({
      supabase,
      accountOwnerUserId: "owner-1",
      includeArchived: true,
    });

    expect(rows.map((row) => row.id)).toEqual(["tpl-2", "tpl-1"]);
    expect(rows.map((row) => row.lifecycle_status)).toEqual(["archived", "active"]);
  });

  it("sanitizes summary and items in row projection", async () => {
    const { supabase } = makeSupabaseMock([
      makeTemplate({
        id: "tpl-1",
        default_visit_scope_summary: "  Spring  PM  ",
        default_visit_scope_items: [{ title: "  Inspect blower  ", details: "  Clean  " }],
      }),
    ]);

    const rows = await listMaintenanceAgreementTemplatesForAccount({
      supabase,
      accountOwnerUserId: "owner-1",
    });

    expect(rows[0]?.default_visit_scope_summary).toBe("Spring PM");
    expect(rows[0]?.default_visit_scope_items).toMatchObject([
      {
        title: "Inspect blower",
        details: "Clean",
      },
    ]);
  });

  it("normalizes lifecycle helper and name helper", () => {
    expect(normalizeMaintenanceAgreementTemplateLifecycleStatus("archived")).toBe("archived");
    expect(normalizeMaintenanceAgreementTemplateLifecycleStatus("ACTIVE")).toBe("active");
    expect(normalizeMaintenanceAgreementTemplateName("  Spring   Plan  ")).toBe("Spring Plan");
  });
});
