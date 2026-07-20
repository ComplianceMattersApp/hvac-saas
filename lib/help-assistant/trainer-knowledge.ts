import type { HelpAssistantSafeContext } from "./help-assistant-context";

export type TrainerKnowledgeSource = {
  slug: string;
  title: string;
  body: string;
  sourceLabel: string;
  sourcePath: string;
  rank: number;
};

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\0/g, "").trim().slice(0, maxLength);
}

export async function retrieveTrainerKnowledge(params: {
  admin: any;
  question: string;
  context: HelpAssistantSafeContext;
  limit?: number;
}): Promise<TrainerKnowledgeSource[]> {
  const question = cleanText(params.question, 500);
  if (!question) return [];
  const { data, error } = await params.admin.rpc("search_assistant_knowledge", {
    p_query: question,
    p_role: params.context.internalRole,
    p_product_mode: params.context.productMode,
    p_limit: Math.min(10, Math.max(1, params.limit ?? 6)),
  });
  if (error) throw new Error("trainer_knowledge_search_failed");
  return (data ?? []).map((row: any) => ({
    slug: cleanText(row.slug, 120),
    title: cleanText(row.title, 200),
    body: cleanText(row.body, 4_000),
    sourceLabel: cleanText(row.source_label, 200),
    sourcePath: cleanText(row.source_path, 300).startsWith("/") ? cleanText(row.source_path, 300) : "/training",
    rank: Number(row.rank ?? 0),
  })).filter((row: TrainerKnowledgeSource) => row.slug && row.title && row.body);
}
