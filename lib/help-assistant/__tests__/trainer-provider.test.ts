import { describe, expect, it, vi } from "vitest";
import { generateTrainerAnswer } from "../trainer-provider";

const context = { pathname: "/training", pageFamily: "training_room" as const, internalRole: "tech" as const, roleLabel: "Technician / Field User", productMode: "hvac_service" as const, canViewFinancialRegister: false, canCollectFieldPayment: false };
const sources = [{ slug: "first-job", title: "First job", body: "Create and schedule the job.", sourceLabel: "App knowledge", sourcePath: "/training", rank: 1 }];

describe("trainer provider", () => {
  it("keeps only citations that came from retrieved knowledge", async () => {
    const parse = vi.fn().mockResolvedValue({ output_parsed: { supported: true, answer: "Use the first-job path.", citationSlugs: ["first-job", "invented"], draftArticle: null }, usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 0 } } });
    const result = await generateTrainerAnswer({ question: "How do I run my first job?", context, sources, client: { responses: { parse } } as any });
    expect(result.answer.supported).toBe(true);
    expect(result.answer.citationSlugs).toEqual(["first-job"]);
    expect(result.answer.citations).toHaveLength(1);
  });

  it("fails closed and produces a review draft when knowledge does not support an answer", async () => {
    const parse = vi.fn().mockResolvedValue({ output_parsed: { supported: true, answer: "Not documented.", citationSlugs: [], draftArticle: null }, usage: {} });
    const result = await generateTrainerAnswer({ question: "How does an undocumented feature work?", context, sources: [], client: { responses: { parse } } as any });
    expect(result.answer.supported).toBe(false);
    expect(result.answer.draftArticle?.body).toContain("Knowledge gap to review");
  });
});
