import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { retrieveTrainerKnowledge } from "../trainer-knowledge";

const migration = readFileSync(resolve(__dirname, "../../../supabase/migrations/20260719230000_trainer_knowledge_foundation.sql"), "utf8");

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
});
