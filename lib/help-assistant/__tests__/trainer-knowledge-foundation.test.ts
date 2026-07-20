import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { retrieveTrainerKnowledge } from "../trainer-knowledge";

const migration = readFileSync(resolve(__dirname, "../../../supabase/migrations/20260719230000_trainer_knowledge_foundation.sql"), "utf8");
const expansion = readFileSync(resolve(__dirname, "../../../supabase/migrations/20260720110000_trainer_knowledge_catalog_expansion.sql"), "utf8");

describe("trainer knowledge foundation", () => {
  it("keeps articles service-role-only and searches published role-safe knowledge", () => {
    expect(migration).toContain("assistant_knowledge_articles");
    expect(migration).toContain("status = 'published'");
    expect(migration).toContain("REVOKE ALL ON TABLE public.assistant_knowledge_articles FROM anon, authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.search_assistant_knowledge");
    expect(migration).toContain("audience_roles");
    expect(migration).toContain("product_modes");
  });

  it("retrieves bounded knowledge through the server RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ slug: "training-room", title: "Training", body: "Approved", source_label: "App", source_path: "/training", rank: 1 }], error: null });
    const rows = await retrieveTrainerKnowledge({
      admin: { rpc },
      question: "How do I train?",
      context: { pathname: "/training", pageFamily: "training_room", internalRole: "tech", roleLabel: "Technician / Field User", productMode: "hvac_service", canViewFinancialRegister: false, canCollectFieldPayment: false },
    });
    expect(rpc).toHaveBeenCalledWith("search_assistant_knowledge", expect.objectContaining({ p_role: "tech", p_limit: 6 }));
    expect(rows[0]).toMatchObject({ slug: "training-room", sourcePath: "/training" });
  });

  it("expands published knowledge across core app workflows", () => {
    for (const slug of ["customers-and-locations", "job-intake", "field-finish-outcomes", "pricebook", "estimate-options", "invoice-workflow", "payments", "equipment-and-systems", "ecc-testing", "permits", "reports"]) {
      expect(expansion).toContain(`('${slug}'`);
    }
    expect(expansion).toContain("ADD COLUMN IF NOT EXISTS keywords");
    expect(expansion).toContain("ON CONFLICT (slug) DO UPDATE");
  });

  it("uses lexical and alias fallback for natural field questions", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const builder: any = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.limit = vi.fn().mockResolvedValue({
      data: [
        { slug: "estimate-building", title: "Building an estimate", body: "Add clear proposal lines.", keywords: "quote bid proposal", source_label: "App", source_path: "/estimates", audience_roles: ["all"], product_modes: ["all"] },
        { slug: "payments", title: "Payments", body: "Review collected money.", keywords: "card payment", source_label: "App", source_path: "/reports/payments", audience_roles: ["owner", "billing"], product_modes: ["all"] },
      ],
      error: null,
    });
    const rows = await retrieveTrainerKnowledge({
      admin: { rpc, from: vi.fn(() => builder) },
      question: "How do I make a quote for a homeowner?",
      context: { pathname: "/training", pageFamily: "training_room", internalRole: "tech", roleLabel: "Technician / Field User", productMode: "hvac_service", canViewFinancialRegister: false, canCollectFieldPayment: false },
    });
    expect(rows.map((row) => row.slug)).toEqual(["estimate-building"]);
  });
});
