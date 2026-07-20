import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { EstimateReadResult } from "@/lib/estimates/estimate-read";

export const ESTIMATE_COACH_MODEL = "gpt-5.6-luna";
export const ESTIMATE_COACH_MAX_OUTPUT_TOKENS = 1_200;

const suggestionSchema = z.object({
  kind: z.enum([
    "wording_suggestion",
    "pricebook_or_manual_line_suggestion",
    "option_package_suggestion",
    "conversion_guidance",
  ]),
  title: z.string().min(1).max(120),
  detail: z.string().min(1).max(800),
  proposedText: z.string().max(1_500).nullable(),
  confidence: z.enum(["low", "medium", "high"]),
}).strict();

export const estimateCoachAiResponseSchema = z.object({
  summary: z.string().min(1).max(800),
  suggestions: z.array(suggestionSchema).max(8),
  warnings: z.array(z.string().min(1).max(500)).max(6),
}).strict();

export type EstimateCoachAiResponse = z.infer<typeof estimateCoachAiResponseSchema>;

type EstimateCoachContext = {
  title: string;
  scopeNotes: string;
  proposalMode: EstimateReadResult["proposalMode"];
  totalCents: number;
  customerPresent: boolean;
  locationPresent: boolean;
  lines: Array<{
    name: string;
    description: string;
    itemType: string;
    quantity: number;
    unitPriceCents: number;
    source: "pricebook" | "manual";
  }>;
  options: Array<{
    label: string;
    summary: string;
    totalCents: number;
    lines: Array<{
      name: string;
      description: string;
      itemType: string;
      quantity: number;
      unitPriceCents: number;
      source: "pricebook" | "manual";
    }>;
  }>;
};

function safeText(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function mapLine(line: EstimateReadResult["line_items"][number]) {
  return {
    name: safeText(line.item_name_snapshot, 180),
    description: safeText(line.description_snapshot, 700),
    itemType: safeText(line.item_type_snapshot, 80),
    quantity: Number(line.quantity),
    unitPriceCents: Number(line.unit_price_cents),
    source: line.source_pricebook_item_id ? "pricebook" as const : "manual" as const,
  };
}

export function buildEstimateCoachAiContext(estimate: EstimateReadResult): EstimateCoachContext {
  return {
    title: safeText(estimate.title, 250),
    scopeNotes: safeText(estimate.notes, 2_500),
    proposalMode: estimate.proposalMode,
    totalCents: Number(estimate.total_cents),
    customerPresent: Boolean(estimate.customer_id),
    locationPresent: Boolean(estimate.location_id),
    lines: estimate.line_items.slice(0, 60).map(mapLine),
    options: (estimate.options ?? []).slice(0, 3).map((option) => ({
      label: safeText(option.label, 120),
      summary: safeText(option.summary, 800),
      totalCents: Number(option.total_cents),
      lines: option.line_items.slice(0, 60).map(mapLine),
    })),
  };
}

export function calculateLunaCostMicrousd(params: {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}) {
  const inputTokens = Math.max(0, Math.trunc(params.inputTokens));
  const cachedTokens = Math.min(inputTokens, Math.max(0, Math.trunc(params.cachedInputTokens)));
  const uncachedTokens = inputTokens - cachedTokens;
  return Math.ceil(uncachedTokens * 1 + cachedTokens * 0.1 + Math.max(0, Math.trunc(params.outputTokens)) * 6);
}

export function estimateCoachReservationMicrousd(context: EstimateCoachContext) {
  const conservativeInputTokens = JSON.stringify(context).length + 4_000;
  return conservativeInputTokens + ESTIMATE_COACH_MAX_OUTPUT_TOKENS * 6;
}

type ResponsesClient = Pick<OpenAI, "responses">;

export async function generateEstimateCoachAiSuggestions(params: {
  context: EstimateCoachContext;
  client?: ResponsesClient;
  apiKey?: string;
}) {
  const apiKey = safeText(params.apiKey ?? process.env.OPENAI_API_KEY, 500);
  if (!params.client && !apiKey) throw new Error("estimate_coach_ai_unconfigured");
  const client = params.client ?? new OpenAI({ apiKey });

  const response = await client.responses.parse({
    model: ESTIMATE_COACH_MODEL,
    reasoning: { effort: "none" },
    store: false,
    max_output_tokens: ESTIMATE_COACH_MAX_OUTPUT_TOKENS,
    input: [
      {
        role: "system",
        content: [
          "You are the internal Estimate Coach for an HVAC field-service application.",
          "Review only the supplied estimate snapshot. Do not invent customer facts, equipment facts, prices, approvals, or completed work.",
          "Suggestions are optional and require operator review. Estimate lines are proposed commercial scope, not Work Items or Invoice Charges.",
          "Never claim that an estimate is approved, sent, converted, invoiced, or paid. Do not instruct the app to perform actions.",
          "Focus on concise proposal wording, missing commercial detail, sensible Good/Better/Best differentiation, and safe conversion guidance.",
        ].join(" "),
      },
      {
        role: "user",
        content: `Review this estimate snapshot and return suggestion-only guidance:\n${JSON.stringify(params.context)}`,
      },
    ],
    text: { format: zodTextFormat(estimateCoachAiResponseSchema, "estimate_coach_suggestions") },
  });

  if (!response.output_parsed) throw new Error("estimate_coach_ai_no_structured_output");
  const parsed = estimateCoachAiResponseSchema.parse(response.output_parsed);
  const inputTokens = Number(response.usage?.input_tokens ?? 0);
  const cachedInputTokens = Number(response.usage?.input_tokens_details?.cached_tokens ?? 0);
  const outputTokens = Number(response.usage?.output_tokens ?? 0);

  return {
    suggestions: parsed,
    usage: {
      inputTokens,
      cachedInputTokens,
      outputTokens,
      actualCostMicrousd: calculateLunaCostMicrousd({ inputTokens, cachedInputTokens, outputTokens }),
    },
  };
}
