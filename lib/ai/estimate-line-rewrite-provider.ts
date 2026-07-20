import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { calculateLunaCostMicrousd, ESTIMATE_COACH_MODEL } from "./estimate-coach-provider";

export const ESTIMATE_LINE_REWRITE_MODEL = ESTIMATE_COACH_MODEL;
export const ESTIMATE_LINE_REWRITE_MAX_OUTPUT_TOKENS = 500;

export const estimateLineRewriteSchema = z.object({
  rewrittenDescription: z.string().min(1).max(1_200),
  missingSpecifics: z.array(z.string().min(1).max(160)).max(4),
}).strict();

export type EstimateLineRewrite = z.infer<typeof estimateLineRewriteSchema>;

export function estimateLineRewriteReservationMicrousd(input: { itemName: string; itemType: string; roughDescription: string }) {
  return JSON.stringify(input).length + 3_000 + ESTIMATE_LINE_REWRITE_MAX_OUTPUT_TOKENS * 6;
}

export async function rewriteEstimateLineDescription(params: {
  itemName: string;
  itemType: string;
  roughDescription: string;
  client?: Pick<OpenAI, "responses">;
  apiKey?: string;
}) {
  const apiKey = String(params.apiKey ?? process.env.OPENAI_API_KEY ?? "").trim();
  if (!params.client && !apiKey) throw new Error("estimate_line_rewrite_unconfigured");
  const client = params.client ?? new OpenAI({ apiKey });
  const response = await client.responses.parse({
    model: ESTIMATE_LINE_REWRITE_MODEL,
    reasoning: { effort: "none" },
    store: false,
    max_output_tokens: ESTIMATE_LINE_REWRITE_MAX_OUTPUT_TOKENS,
    input: [
      {
        role: "system",
        content: [
          "Rewrite rough HVAC technician notes as one concise, customer-ready estimate scope description.",
          "Preserve every supplied fact, but do not invent equipment capacity, efficiency, brand, model, warranty, code requirement, included work, price, or completed work.",
          "Use plain professional language and active proposal wording such as furnish and install; never claim work is complete.",
          "Return only the useful rewrite plus up to four short missing specifics that would materially improve accuracy.",
          "Do not lecture, repeat warnings, or add generic coaching. Missing specifics must appear after the rewrite.",
        ].join(" "),
      },
      { role: "user", content: JSON.stringify({ itemName: params.itemName, itemType: params.itemType, roughDescription: params.roughDescription }) },
    ],
    text: { format: zodTextFormat(estimateLineRewriteSchema, "estimate_line_rewrite") },
  });
  if (!response.output_parsed) throw new Error("estimate_line_rewrite_no_output");
  const rewrite = estimateLineRewriteSchema.parse(response.output_parsed);
  const inputTokens = Number(response.usage?.input_tokens ?? 0);
  const cachedInputTokens = Number(response.usage?.input_tokens_details?.cached_tokens ?? 0);
  const outputTokens = Number(response.usage?.output_tokens ?? 0);
  return {
    rewrite,
    usage: {
      inputTokens,
      cachedInputTokens,
      outputTokens,
      actualCostMicrousd: calculateLunaCostMicrousd({ inputTokens, cachedInputTokens, outputTokens }),
    },
  };
}
