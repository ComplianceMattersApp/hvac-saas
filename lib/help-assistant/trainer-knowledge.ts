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

const STOP_WORDS = new Set(["a", "an", "and", "are", "can", "do", "does", "for", "how", "i", "in", "is", "it", "my", "of", "on", "the", "to", "what", "when", "where", "why", "with"]);
const TERM_ALIASES: Record<string, string[]> = {
  quote: ["estimate", "proposal"],
  bid: ["estimate", "proposal"],
  tech: ["technician", "field"],
  client: ["customer"],
  homeowner: ["customer"],
  address: ["location"],
  bill: ["invoice", "billing"],
  money: ["payment", "billing"],
  card: ["payment"],
  unit: ["equipment", "system"],
  photo: ["attachment", "evidence"],
};

function searchTerms(value: string) {
  const base = value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const terms = base.filter((term) => term.length > 1 && !STOP_WORDS.has(term));
  return [...new Set(terms.flatMap((term) => [term, ...(TERM_ALIASES[term] ?? [])]))];
}

function lexicalRank(question: string, row: any, context: HelpAssistantSafeContext) {
  const terms = searchTerms(question);
  if (terms.length === 0) return 0;
  const title = cleanText(row.title, 200).toLowerCase();
  const corpus = `${title} ${cleanText(row.body, 4_000)} ${cleanText(row.keywords, 2_000)}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += 5;
    if (corpus.includes(term)) score += 1;
  }
  if (cleanText(row.source_path, 300) === context.pathname) score += 2;
  return score / terms.length;
}

function mapSource(row: any, rank = Number(row.rank ?? 0)): TrainerKnowledgeSource {
  const sourcePath = cleanText(row.source_path, 300);
  return {
    slug: cleanText(row.slug, 120),
    title: cleanText(row.title, 200),
    body: cleanText(row.body, 4_000),
    sourceLabel: cleanText(row.source_label, 200),
    sourcePath: sourcePath.startsWith("/") ? sourcePath : "/training",
    rank,
  };
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
  const ranked = new Map<string, TrainerKnowledgeSource>();
  for (const row of data ?? []) {
    const source = mapSource(row, Number(row.rank ?? 0) + 10);
    if (source.slug && source.title && source.body) ranked.set(source.slug, source);
  }

  if (typeof params.admin?.from === "function") {
    const catalogResult = await params.admin
      .from("assistant_knowledge_articles")
      .select("slug, title, body, keywords, source_label, source_path, audience_roles, product_modes")
      .eq("status", "published")
      .limit(100);
    if (!catalogResult.error) {
      for (const row of catalogResult.data ?? []) {
        const roles = Array.isArray(row.audience_roles) ? row.audience_roles : ["all"];
        const modes = Array.isArray(row.product_modes) ? row.product_modes : ["all"];
        if (!roles.includes("all") && !roles.includes(params.context.internalRole)) continue;
        if (!modes.includes("all") && !modes.includes(params.context.productMode)) continue;
        const rank = lexicalRank(question, row, params.context);
        if (rank <= 0) continue;
        const source = mapSource(row, rank);
        const existing = ranked.get(source.slug);
        if (!existing || source.rank > existing.rank) ranked.set(source.slug, source);
      }
    }
  }

  return [...ranked.values()]
    .sort((a, b) => b.rank - a.rank || a.title.localeCompare(b.title))
    .slice(0, Math.min(10, Math.max(1, params.limit ?? 6)));
}
