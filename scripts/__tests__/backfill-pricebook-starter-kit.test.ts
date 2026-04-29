import { describe, expect, it, vi } from "vitest";
import {
  parseBackfillArgs,
  runBackfillScript,
  type BackfillScriptDeps,
} from "../../scripts/backfill-pricebook-starter-kit";
import {
  STARTER_KIT_V2_SEEDS,
  STARTER_KIT_V3_SEEDS,
  type ExistingAccountStarterKitBackfillPlan,
  type ExistingAccountStarterKitBackfillApplyResult,
} from "../../lib/business/pricebook-seeding";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makePlanResult(
  overrides?: Partial<ExistingAccountStarterKitBackfillPlan>,
): ExistingAccountStarterKitBackfillPlan {
  const starterKitVersion = overrides?.starter_kit_version ?? "v2";
  const seeds = starterKitVersion === "v3" ? STARTER_KIT_V3_SEEDS : STARTER_KIT_V2_SEEDS;
  const activeSeedCount = seeds.filter((seed) => seed.is_active).length;
  const inactiveSeedCount = seeds.length - activeSeedCount;

  return {
    mode: "dry_run",
    account_owner_user_id: "test-account-id",
    starter_kit_version: starterKitVersion,
    seed_count: seeds.length,
    active_seed_count: activeSeedCount,
    inactive_seed_count: inactiveSeedCount,
    would_insert_count: seeds.length,
    would_skip_existing_seed_key_count: 0,
    would_skip_existing_equivalent_count: 0,
    possible_collision_count: 0,
    preview_insert_rows: seeds.slice(0, 10).map((s) => ({
      seed_key: s.seed_key,
      item_name: s.item_name,
    })),
    preview_skip_rows: [],
    preview_existing_equivalent_rows: [],
    possible_collisions: [],
    warnings: ["2 deferred/inactive starter rows are included in planning output."],
    errors: [],
    ...overrides,
  };
}

function makeApplyResult(
  overrides?: Partial<ExistingAccountStarterKitBackfillApplyResult>,
): ExistingAccountStarterKitBackfillApplyResult {
  const starterKitVersion = overrides?.starter_kit_version ?? "v2";
  const seeds = starterKitVersion === "v3" ? STARTER_KIT_V3_SEEDS : STARTER_KIT_V2_SEEDS;
  const activeSeedCount = seeds.filter((seed) => seed.is_active).length;
  const inactiveSeedCount = seeds.length - activeSeedCount;

  return {
    mode: "apply",
    account_owner_user_id: "test-account-id",
    starter_kit_version: starterKitVersion,
    seed_count: seeds.length,
    active_seed_count: activeSeedCount,
    inactive_seed_count: inactiveSeedCount,
    inserted_count: seeds.length,
    skipped_existing_seed_key_count: 0,
    skipped_existing_equivalent_count: 0,
    possible_collision_count: 0,
    inserted_rows: seeds.map((s) => ({
      seed_key: s.seed_key,
      item_name: s.item_name,
    })),
    skipped_rows: [],
    equivalent_rows: [],
    possible_collisions: [],
    warnings: [],
    errors: [],
    ...overrides,
  };
}

function makeDeps(
  overrides?: Partial<BackfillScriptDeps>,
): BackfillScriptDeps {
  return {
    env: {
      NODE_ENV: "test",
      ALLOW_FIRST_OWNER_PROVISIONING: "true",
      ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING: "true",
      NEXT_PUBLIC_SUPABASE_URL: "https://sandbox.example.test",
      ...(overrides?.env ?? {}),
    } as NodeJS.ProcessEnv,
    planBackfill: vi.fn(async () => makePlanResult()),
    applyBackfill: vi.fn(async () => makeApplyResult()),
    ...overrides,
  };
}

const baseArgs = {
  accountOwnerUserId: "test-account-id",
  starterKitVersion: "v2" as const,
  apply: false,
  allowCollisions: false,
  previewLimit: 10,
  jsonOutput: false,
};

// ---------------------------------------------------------------------------
// Parser tests
// ---------------------------------------------------------------------------

describe("parseBackfillArgs", () => {
  it("1: throws when --account-owner-user-id is missing", () => {
    expect(() => parseBackfillArgs([])).toThrow(
      "Missing required --account-owner-user-id",
    );
  });

  it("2: defaults to dry-run (apply is false by default)", () => {
    const parsed = parseBackfillArgs(["--account-owner-user-id", "test-id"]);
    expect(parsed.apply).toBe(false);
  });

  it("3: defaults starter-kit-version to v2", () => {
    const parsed = parseBackfillArgs(["--account-owner-user-id", "test-id"]);
    expect(parsed.starterKitVersion).toBe("v2");
  });

  it("3b: accepts --starter-kit-version v2 explicitly", () => {
    const parsed = parseBackfillArgs([
      "--account-owner-user-id",
      "test-id",
      "--starter-kit-version",
      "v2",
    ]);
    expect(parsed.starterKitVersion).toBe("v2");
  });

  it("4: rejects v1 starter kit version", () => {
    expect(() =>
      parseBackfillArgs([
        "--account-owner-user-id",
        "test-id",
        "--starter-kit-version",
        "v1",
      ]),
    ).toThrow("supported: v2|v3");
  });

  it("4b: rejects unknown starter kit version string", () => {
    expect(() =>
      parseBackfillArgs([
        "--account-owner-user-id",
        "test-id",
        "--starter-kit-version",
        "v4",
      ]),
    ).toThrow("supported: v2|v3");
  });

  it("4c: accepts --starter-kit-version v3", () => {
    const parsed = parseBackfillArgs([
      "--account-owner-user-id",
      "test-id",
      "--starter-kit-version",
      "v3",
    ]);

    expect(parsed.starterKitVersion).toBe("v3");
  });

  it("5: accepts --apply flag", () => {
    const parsed = parseBackfillArgs([
      "--account-owner-user-id",
      "test-id",
      "--apply",
    ]);
    expect(parsed.apply).toBe(true);
  });

  it("6: accepts --allow-collisions flag", () => {
    const parsed = parseBackfillArgs([
      "--account-owner-user-id",
      "test-id",
      "--allow-collisions",
    ]);
    expect(parsed.allowCollisions).toBe(true);
  });

  it("7: parses --preview-limit as integer", () => {
    const parsed = parseBackfillArgs([
      "--account-owner-user-id",
      "test-id",
      "--preview-limit",
      "5",
    ]);
    expect(parsed.previewLimit).toBe(5);
  });

  it("7b: rejects non-numeric --preview-limit", () => {
    expect(() =>
      parseBackfillArgs([
        "--account-owner-user-id",
        "test-id",
        "--preview-limit",
        "bad",
      ]),
    ).toThrow("Invalid --preview-limit");
  });

  it("7c: rejects zero --preview-limit", () => {
    expect(() =>
      parseBackfillArgs([
        "--account-owner-user-id",
        "test-id",
        "--preview-limit",
        "0",
      ]),
    ).toThrow("Invalid --preview-limit");
  });
});

// ---------------------------------------------------------------------------
// Script runner tests
// ---------------------------------------------------------------------------

describe("runBackfillScript", () => {
  it("8: dry-run calls planBackfill, does not call applyBackfill", async () => {
    const deps = makeDeps();
    const result = await runBackfillScript(baseArgs, deps);

    expect(result.mode).toBe("dry_run");
    expect(deps.planBackfill).toHaveBeenCalledOnce();
    expect(deps.planBackfill).toHaveBeenCalledWith(
      expect.objectContaining({
        account_owner_user_id: "test-account-id",
        starter_kit_version: "v2",
      }),
    );
    expect(deps.applyBackfill).not.toHaveBeenCalled();
    expect(result.planResult).toBeDefined();
    expect(result.applyResult).toBeNull();
  });

  it("8b: dry-run passes previewLimit to planBackfill", async () => {
    const deps = makeDeps();
    await runBackfillScript({ ...baseArgs, previewLimit: 5 }, deps);

    expect(deps.planBackfill).toHaveBeenCalledWith(
      expect.objectContaining({ previewLimit: 5 }),
    );
  });

  it("9: apply calls applyBackfill with confirmApply: true", async () => {
    const deps = makeDeps();
    const result = await runBackfillScript({ ...baseArgs, apply: true }, deps);

    expect(result.mode).toBe("apply");
    expect(deps.applyBackfill).toHaveBeenCalledOnce();
    expect(deps.applyBackfill).toHaveBeenCalledWith(
      expect.objectContaining({
        account_owner_user_id: "test-account-id",
        starter_kit_version: "v2",
        confirmApply: true,
      }),
    );
    expect(deps.planBackfill).not.toHaveBeenCalled();
    expect(result.applyResult).toBeDefined();
    expect(result.planResult).toBeNull();
  });

  it("9b: apply passes allowCollisions: true when flag is set", async () => {
    const deps = makeDeps();
    await runBackfillScript({ ...baseArgs, apply: true, allowCollisions: true }, deps);

    expect(deps.applyBackfill).toHaveBeenCalledWith(
      expect.objectContaining({ allowCollisions: true }),
    );
  });

  it("9c: apply does not pass allowCollisions when flag is not set", async () => {
    const deps = makeDeps();
    await runBackfillScript({ ...baseArgs, apply: true, allowCollisions: false }, deps);

    const callArg = (deps.applyBackfill as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(callArg.allowCollisions).toBeUndefined();
  });

  it("9d: forwards starter_kit_version=v3 to plan/apply paths", async () => {
    const deps = makeDeps();

    await runBackfillScript({ ...baseArgs, starterKitVersion: "v3" }, deps);
    expect(deps.planBackfill).toHaveBeenCalledWith(
      expect.objectContaining({ starter_kit_version: "v3" }),
    );

    await runBackfillScript({ ...baseArgs, starterKitVersion: "v3", apply: true }, deps);
    expect(deps.applyBackfill).toHaveBeenCalledWith(
      expect.objectContaining({ starter_kit_version: "v3" }),
    );
  });

  it("10: apply on hosted target fails closed without ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING", async () => {
    const deps = makeDeps({
      env: {
        NODE_ENV: "test",
        ALLOW_FIRST_OWNER_PROVISIONING: "true",
        ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING: "false",
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefg.supabase.co",
      } as NodeJS.ProcessEnv,
    });

    const result = await runBackfillScript({ ...baseArgs, apply: true }, deps);

    expect(result.guardrailErrors.some((e) => e.code === "PRODUCTION_ALLOW_FLAG_REQUIRED")).toBe(true);
    expect(result.applyResult).toBeNull();
    expect(deps.applyBackfill).not.toHaveBeenCalled();
  });

  it("10b: dry-run on hosted target also requires both allow flags", async () => {
    const deps = makeDeps({
      env: {
        NODE_ENV: "test",
        ALLOW_FIRST_OWNER_PROVISIONING: "true",
        ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING: "false",
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefg.supabase.co",
      } as NodeJS.ProcessEnv,
    });

    const result = await runBackfillScript(baseArgs, deps);

    expect(result.guardrailErrors.some((e) => e.code === "PRODUCTION_ALLOW_FLAG_REQUIRED")).toBe(true);
    expect(deps.planBackfill).not.toHaveBeenCalled();
  });

  it("11: missing ALLOW_FIRST_OWNER_PROVISIONING blocks both planBackfill and applyBackfill", async () => {
    const deps = makeDeps({
      env: {
        NODE_ENV: "test",
        ALLOW_FIRST_OWNER_PROVISIONING: "false",
        NEXT_PUBLIC_SUPABASE_URL: "https://sandbox.example.test",
      } as NodeJS.ProcessEnv,
    });

    const result = await runBackfillScript(baseArgs, deps);

    expect(result.guardrailErrors.length).toBeGreaterThan(0);
    expect(result.guardrailErrors.some((e) => e.code === "ALLOW_FLAG_REQUIRED")).toBe(true);
    expect(deps.planBackfill).not.toHaveBeenCalled();
    expect(deps.applyBackfill).not.toHaveBeenCalled();
  });

  it("11b: apply with guardrail errors returns no applyResult", async () => {
    const deps = makeDeps({
      env: {
        NODE_ENV: "test",
        ALLOW_FIRST_OWNER_PROVISIONING: "false",
      } as NodeJS.ProcessEnv,
    });

    const result = await runBackfillScript({ ...baseArgs, apply: true }, deps);

    expect(result.applyResult).toBeNull();
    expect(result.planResult).toBeNull();
    expect(result.guardrailErrors.length).toBeGreaterThan(0);
  });

  it("12: dry-run result is valid parseable JSON with expected fields", async () => {
    const deps = makeDeps();
    const result = await runBackfillScript(baseArgs, deps);

    const jsonString = JSON.stringify(result.planResult);
    expect(() => JSON.parse(jsonString)).not.toThrow();

    const parsed = JSON.parse(jsonString);
    expect(parsed.mode).toBe("dry_run");
    expect(parsed.starter_kit_version).toBe("v2");
    expect(typeof parsed.seed_count).toBe("number");
    expect(typeof parsed.would_insert_count).toBe("number");
    expect(typeof parsed.would_skip_existing_equivalent_count).toBe("number");
    expect(Array.isArray(parsed.preview_insert_rows)).toBe(true);
    expect(Array.isArray(parsed.preview_existing_equivalent_rows)).toBe(true);
    expect(Array.isArray(parsed.errors)).toBe(true);
  });

  it("12b: apply result is valid parseable JSON with expected fields", async () => {
    const deps = makeDeps();
    const result = await runBackfillScript({ ...baseArgs, apply: true }, deps);

    const jsonString = JSON.stringify(result.applyResult);
    expect(() => JSON.parse(jsonString)).not.toThrow();

    const parsed = JSON.parse(jsonString);
    expect(parsed.mode).toBe("apply");
    expect(parsed.starter_kit_version).toBe("v2");
    expect(typeof parsed.inserted_count).toBe("number");
    expect(typeof parsed.skipped_existing_equivalent_count).toBe("number");
    expect(Array.isArray(parsed.inserted_rows)).toBe(true);
    expect(Array.isArray(parsed.equivalent_rows)).toBe(true);
    expect(Array.isArray(parsed.errors)).toBe(true);
  });
});
