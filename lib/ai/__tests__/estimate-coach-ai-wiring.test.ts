import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const actions = readFileSync(join(process.cwd(), "app/estimates/[id]/actions.ts"), "utf8");
const panel = readFileSync(join(process.cwd(), "app/estimates/[id]/EstimateCoachAiSuggestions.tsx"), "utf8");
const provider = readFileSync(join(process.cwd(), "lib/ai/estimate-coach-provider.ts"), "utf8");

describe("Estimate Coach live AI wiring", () => {
  it("fails closed before auth/provider work and reloads the account-scoped estimate server-side", () => {
    expect(actions).toContain("!isEstimatesEnabled() || !isEstimateCoachAiEnabled()");
    expect(actions.indexOf("!isEstimatesEnabled() || !isEstimateCoachAiEnabled()")).toBeLessThan(actions.indexOf("await requireInternalUser"));
    expect(actions).toContain("getEstimateById({ estimateId, internalUser, supabase })");
  });

  it("reserves before provider execution and settles measured usage", () => {
    const coachAction = actions.slice(actions.indexOf("export async function generateEstimateCoachSuggestionsAction"));
    expect(coachAction.indexOf("await reserveAiUsage")).toBeLessThan(coachAction.indexOf("await generateEstimateCoachAiSuggestions"));
    expect(coachAction.indexOf("await generateEstimateCoachAiSuggestions")).toBeLessThan(coachAction.indexOf("await settleAiUsage"));
    expect(coachAction).toContain("await releaseAiUsage");
  });

  it("keeps suggestions operator-triggered and has no apply action", () => {
    expect(panel).toContain("Review whole estimate");
    expect(panel).toContain("Nothing was changed");
    expect(panel).not.toContain("Apply suggestion");
    expect(provider).toContain("store: false");
    expect(provider).not.toContain("tools:");
  });
});
