export const DEFAULT_AI_MONTHLY_LIMIT_MICROUSD = 25_000_000;

export type AiFeatureKey = "estimate_coach" | "trainer" | "future_internal_assistant";

export type AiBudgetSnapshot = {
  available: boolean;
  enabled: boolean;
  monthlyLimitMicrousd: number;
  completedCostMicrousd: number;
  reservedCostMicrousd: number;
  remainingMicrousd: number;
  completedRequests: number;
  rejectedRequests: number;
  byFeature: Record<string, number>;
  byAccount: Record<string, number>;
};

export function formatMicrousd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Math.max(0, value) / 1_000_000
  );
}

export function dollarsToMicrousd(value: unknown): number | null {
  const dollars = Number(value);
  if (!Number.isFinite(dollars) || dollars < 1 || dollars > 1000) return null;
  return Math.round(dollars * 1_000_000);
}

export async function loadAiBudgetSnapshot(params: {
  admin: any;
  now?: Date;
}): Promise<AiBudgetSnapshot> {
  const now = params.now ?? new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const unavailable: AiBudgetSnapshot = {
    available: false,
    enabled: false,
    monthlyLimitMicrousd: DEFAULT_AI_MONTHLY_LIMIT_MICROUSD,
    completedCostMicrousd: 0,
    reservedCostMicrousd: 0,
    remainingMicrousd: 0,
    completedRequests: 0,
    rejectedRequests: 0,
    byFeature: {},
    byAccount: {},
  };

  const [settingsResult, usageResult] = await Promise.all([
    params.admin.from("ai_global_budget_settings").select("monthly_limit_microusd, is_enabled").eq("singleton_key", "global").maybeSingle(),
    params.admin.from("ai_usage_events").select("feature_key, account_owner_user_id, status, estimated_cost_microusd, actual_cost_microusd").gte("created_at", monthStart),
  ]);

  if (settingsResult.error || usageResult.error || !settingsResult.data) return unavailable;

  let completedCostMicrousd = 0;
  let reservedCostMicrousd = 0;
  let completedRequests = 0;
  let rejectedRequests = 0;
  const byFeature: Record<string, number> = {};
  const byAccount: Record<string, number> = {};

  for (const row of usageResult.data ?? []) {
    const actual = Math.max(0, Number(row.actual_cost_microusd ?? 0));
    if (row.status === "completed") {
      completedCostMicrousd += actual;
      completedRequests += 1;
      const feature = String(row.feature_key ?? "unknown");
      byFeature[feature] = (byFeature[feature] ?? 0) + actual;
      const account = String(row.account_owner_user_id ?? "unattributed");
      byAccount[account] = (byAccount[account] ?? 0) + actual;
    } else if (row.status === "reserved") {
      reservedCostMicrousd += Math.max(0, Number(row.estimated_cost_microusd ?? 0));
    } else if (row.status === "rejected") {
      rejectedRequests += 1;
    }
  }

  const monthlyLimitMicrousd = Math.max(0, Number(settingsResult.data.monthly_limit_microusd));
  return {
    available: true,
    enabled: settingsResult.data.is_enabled === true,
    monthlyLimitMicrousd,
    completedCostMicrousd,
    reservedCostMicrousd,
    remainingMicrousd: Math.max(0, monthlyLimitMicrousd - completedCostMicrousd - reservedCostMicrousd),
    completedRequests,
    rejectedRequests,
    byFeature,
    byAccount,
  };
}

export async function reserveAiUsage(params: {
  admin: any;
  requestId: string;
  featureKey: AiFeatureKey;
  accountOwnerUserId?: string | null;
  actorUserId?: string | null;
  model: string;
  estimatedCostMicrousd: number;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await params.admin.rpc("reserve_ai_usage_budget", {
    p_request_id: params.requestId,
    p_feature_key: params.featureKey,
    p_account_owner_user_id: params.accountOwnerUserId ?? null,
    p_actor_user_id: params.actorUserId ?? null,
    p_model: params.model,
    p_estimated_cost_microusd: params.estimatedCostMicrousd,
    p_metadata: params.metadata ?? {},
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    accepted: row?.accepted === true,
    reason: String(row?.reason ?? "budget_unavailable"),
    remainingMicrousd: Math.max(0, Number(row?.remaining_microusd ?? 0)),
  };
}

export async function settleAiUsage(params: {
  admin: any;
  requestId: string;
  actualCostMicrousd: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}) {
  const { data, error } = await params.admin.rpc("settle_ai_usage_budget", {
    p_request_id: params.requestId,
    p_actual_cost_microusd: params.actualCostMicrousd,
    p_input_tokens: params.inputTokens,
    p_cached_input_tokens: params.cachedInputTokens,
    p_output_tokens: params.outputTokens,
  });
  if (error) throw error;
  return data === true;
}

export async function releaseAiUsage(params: { admin: any; requestId: string }) {
  const { data, error } = await params.admin.rpc("release_ai_usage_budget", {
    p_request_id: params.requestId,
  });
  if (error) throw error;
  return data === true;
}
