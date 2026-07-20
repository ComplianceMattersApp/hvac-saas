import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { calculateLunaCostMicrousd, ESTIMATE_COACH_MODEL } from "@/lib/ai/estimate-coach-provider";
import type { HelpAssistantSafeContext } from "./help-assistant-context";
import type { TrainerKnowledgeSource } from "./trainer-knowledge";

export const TRAINER_MODEL = ESTIMATE_COACH_MODEL;
export const TRAINER_MAX_OUTPUT_TOKENS = 1_000;

const trainerResponseSchema = z.object({
  supported: z.boolean(),
  answer: z.string().min(1).max(2_500),
  citationSlugs: z.array(z.string().min(1).max(120)).max(6),
  draftArticle: z.object({
    title: z.string().min(1).max(160),
    body: z.string().min(1).max(5_000),
  }).nullable(),
}).strict();

export type TrainerAiAnswer = z.infer<typeof trainerResponseSchema> & {
  citations: Array<Pick<TrainerKnowledgeSource, "slug" | "title" | "sourceLabel" | "sourcePath">>;
};

export function trainerReservationMicrousd(question: string, sources: TrainerKnowledgeSource[]) {
  const inputCharacters = question.length + JSON.stringify(sources).length + 4_000;
  return inputCharacters + TRAINER_MAX_OUTPUT_TOKENS * 6;
}

export async function generateTrainerAnswer(params: {
  question: string;
  context: HelpAssistantSafeContext;
  sources: TrainerKnowledgeSource[];
  client?: Pick<OpenAI, "responses">;
  apiKey?: string;
}) {
  const apiKey = String(params.apiKey ?? process.env.OPENAI_API_KEY ?? "").trim();
  if (!params.client && !apiKey) throw new Error("trainer_ai_unconfigured");
  const client = params.client ?? new OpenAI({ apiKey });
  const allowedSlugs = new Set(params.sources.map((source) => source.slug));
  const response = await client.responses.parse({
    model: TRAINER_MODEL,
    reasoning: { effort: "none" },
    store: false,
    max_output_tokens: TRAINER_MAX_OUTPUT_TOKENS,
    input: [
      {
        role: "system",
        content: [
          "You are the internal EveryStep FieldWorks trainer.",
          "Answer only from the published knowledge excerpts supplied below.",
          "Never infer app behavior from general software knowledge and never claim to inspect account records, the database, or source code.",
          "Respect the supplied role and capability context. Do not advise bypassing permissions.",
          "If the excerpts do not fully support the answer, set supported=false, clearly say the answer is not documented yet, and draft a proposed help article for owner review.",
          "When supported=true, cite only supplied source slugs and set draftArticle=null.",
          "Guidance only: do not claim to change settings or perform workflow actions.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({ question: params.question, context: params.context, publishedKnowledge: params.sources }),
      },
    ],
    text: { format: zodTextFormat(trainerResponseSchema, "trainer_answer") },
  });
  if (!response.output_parsed) throw new Error("trainer_ai_no_structured_output");
  const parsed = trainerResponseSchema.parse(response.output_parsed);
  const citationSlugs = parsed.citationSlugs.filter((slug) => allowedSlugs.has(slug));
  const supported = parsed.supported && citationSlugs.length > 0 && params.sources.length > 0;
  const draftArticle = supported
    ? null
    : parsed.draftArticle ?? {
        title: `Document: ${params.question.slice(0, 140)}`,
        body: `Knowledge gap to review\n\nQuestion: ${params.question}\n\nAdd an owner-approved explanation of the correct EveryStep workflow, permissions, limitations, and related app location.`,
      };
  const citations = params.sources
    .filter((source) => citationSlugs.includes(source.slug))
    .map(({ slug, title, sourceLabel, sourcePath }) => ({ slug, title, sourceLabel, sourcePath }));
  const inputTokens = Number(response.usage?.input_tokens ?? 0);
  const cachedInputTokens = Number(response.usage?.input_tokens_details?.cached_tokens ?? 0);
  const outputTokens = Number(response.usage?.output_tokens ?? 0);
  return {
    answer: { ...parsed, supported, citationSlugs, citations, draftArticle },
    usage: {
      inputTokens,
      cachedInputTokens,
      outputTokens,
      actualCostMicrousd: calculateLunaCostMicrousd({ inputTokens, cachedInputTokens, outputTokens }),
    },
  };
}
