import {
  planExistingAccountStarterKitBackfill,
  applyExistingAccountStarterKitBackfill,
  createPricebookSeedingStoreFromSupabase,
  type ExistingAccountStarterKitBackfillPlan,
  type ExistingAccountStarterKitBackfillApplyResult,
} from "../lib/business/pricebook-seeding";
import { createAdminClient } from "../lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParsedBackfillArgs = {
  accountOwnerUserId: string;
  starterKitVersion: "v2" | "v3";
  apply: boolean;
  allowCollisions: boolean;
  previewLimit: number;
  jsonOutput: boolean;
};

type GuardrailError = {
  code: string;
  message: string;
};

export type BackfillScriptResult = {
  mode: "dry_run" | "apply";
  guardrailErrors: GuardrailError[];
  planResult: ExistingAccountStarterKitBackfillPlan | null;
  applyResult: ExistingAccountStarterKitBackfillApplyResult | null;
};

export type BackfillScriptDeps = {
  env: NodeJS.ProcessEnv;
  planBackfill: (params: {
    account_owner_user_id: string;
    starter_kit_version?: "v2" | "v3";
    previewLimit?: number;
  }) => Promise<ExistingAccountStarterKitBackfillPlan>;
  applyBackfill: (params: {
    account_owner_user_id: string;
    starter_kit_version?: "v2" | "v3";
    confirmApply: true;
    allowCollisions?: true;
  }) => Promise<ExistingAccountStarterKitBackfillApplyResult>;
};

// ---------------------------------------------------------------------------
// Utilities (local — mirrors provision-first-owner pattern)
// ---------------------------------------------------------------------------

function toCleanString(value: unknown) {
  return String(value ?? "").trim();
}

function toLower(value: unknown) {
  return toCleanString(value).toLowerCase();
}

function normalizeBooleanFlag(value: string | undefined | null) {
  return toLower(value) === "true";
}

function parseArgValue(argv: string[], key: string): string | undefined {
  const i = argv.indexOf(key);
  if (i === -1) return undefined;
  const next = argv[i + 1];
  if (!next || next.startsWith("--")) return undefined;
  return next;
}

function hasFlag(argv: string[], key: string) {
  return argv.includes(key);
}

function isProductionLikeEnvironment(env: NodeJS.ProcessEnv) {
  const rawUrl = toCleanString(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL);
  const nodeEnv = toLower(env.NODE_ENV);

  if (nodeEnv === "production") return true;
  if (!rawUrl) return true;

  try {
    const parsed = new URL(rawUrl);
    const host = toLower(parsed.hostname);
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return false;
    }
    if (host.endsWith(".local")) return false;
    if (host.includes("sandbox") || host.includes("staging") || host.includes("dev")) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

function collectGuardrailErrors(params: {
  env: NodeJS.ProcessEnv;
}): GuardrailError[] {
  const errors: GuardrailError[] = [];
  const allowProvision = normalizeBooleanFlag(params.env.ALLOW_FIRST_OWNER_PROVISIONING);
  const allowProductionProvision = normalizeBooleanFlag(
    params.env.ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING,
  );

  if (!allowProvision) {
    errors.push({
      code: "ALLOW_FLAG_REQUIRED",
      message: "Backfill is blocked. Set ALLOW_FIRST_OWNER_PROVISIONING=true to continue.",
    });
  }

  if (isProductionLikeEnvironment(params.env) && !allowProductionProvision) {
    errors.push({
      code: "PRODUCTION_ALLOW_FLAG_REQUIRED",
      message:
        "Production-like target detected. Set ALLOW_PRODUCTION_FIRST_OWNER_PROVISIONING=true to continue.",
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Arg parser
// ---------------------------------------------------------------------------

export function parseBackfillArgs(argv: string[]): ParsedBackfillArgs {
  const accountOwnerUserId = toCleanString(parseArgValue(argv, "--account-owner-user-id"));
  const starterKitVersionRaw = toLower(parseArgValue(argv, "--starter-kit-version") ?? "");
  const apply = hasFlag(argv, "--apply");
  const allowCollisions = hasFlag(argv, "--allow-collisions");
  const jsonOutput = hasFlag(argv, "--json");
  const previewLimitRaw = parseArgValue(argv, "--preview-limit");

  if (!accountOwnerUserId) {
    throw new Error("Missing required --account-owner-user-id");
  }

  if (starterKitVersionRaw && starterKitVersionRaw !== "v2" && starterKitVersionRaw !== "v3") {
    throw new Error(
      `Invalid --starter-kit-version: "${starterKitVersionRaw}" (supported: v2|v3)`,
    );
  }

  let previewLimit = 10;
  if (previewLimitRaw != null) {
    const n = parseInt(previewLimitRaw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(
        `Invalid --preview-limit: "${previewLimitRaw}" (must be a positive integer)`,
      );
    }
    previewLimit = n;
  }

  return {
    accountOwnerUserId,
    starterKitVersion: starterKitVersionRaw === "v3" ? "v3" : "v2",
    apply,
    allowCollisions,
    previewLimit,
    jsonOutput,
  };
}

// ---------------------------------------------------------------------------
// Script runner (injectable deps for testability)
// ---------------------------------------------------------------------------

export async function runBackfillScript(
  args: ParsedBackfillArgs,
  deps: BackfillScriptDeps,
): Promise<BackfillScriptResult> {
  const mode: BackfillScriptResult["mode"] = args.apply ? "apply" : "dry_run";

  const guardrailErrors = collectGuardrailErrors({ env: deps.env });
  if (guardrailErrors.length > 0) {
    return {
      mode,
      guardrailErrors,
      planResult: null,
      applyResult: null,
    };
  }

  if (!args.apply) {
    const planResult = await deps.planBackfill({
      account_owner_user_id: args.accountOwnerUserId,
      starter_kit_version: args.starterKitVersion,
      previewLimit: args.previewLimit,
    });
    return {
      mode: "dry_run",
      guardrailErrors: [],
      planResult,
      applyResult: null,
    };
  }

  const applyResult = await deps.applyBackfill({
    account_owner_user_id: args.accountOwnerUserId,
    starter_kit_version: args.starterKitVersion,
    confirmApply: true,
    allowCollisions: args.allowCollisions ? true : undefined,
  });

  return {
    mode: "apply",
    guardrailErrors: [],
    planResult: null,
    applyResult,
  };
}

// ---------------------------------------------------------------------------
// Real deps wiring (Supabase-backed, used by main entrypoint)
// ---------------------------------------------------------------------------

function createRealDeps(): BackfillScriptDeps {
  const admin = createAdminClient();
  const store = createPricebookSeedingStoreFromSupabase(admin);

  return {
    env: process.env,
    planBackfill: ({ account_owner_user_id, starter_kit_version, previewLimit }) =>
      planExistingAccountStarterKitBackfill({
        store,
        account_owner_user_id,
        starter_kit_version: starter_kit_version ?? "v2",
        previewLimit,
      }),
    applyBackfill: ({ account_owner_user_id, starter_kit_version, allowCollisions }) =>
      applyExistingAccountStarterKitBackfill({
        store,
        account_owner_user_id,
        starter_kit_version: starter_kit_version ?? "v2",
        confirmApply: true,
        ...(allowCollisions === true ? { allowCollisions: true } : {}),
      }),
  };
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

export async function main(argv = process.argv.slice(2)) {
  let args: ParsedBackfillArgs;
  try {
    args = parseBackfillArgs(argv);
  } catch (parseErr) {
    const message = parseErr instanceof Error ? parseErr.message : String(parseErr);
    console.error(JSON.stringify({ mode: "error", errors: [message] }, null, 2));
    process.exitCode = 1;
    return;
  }

  const result = await runBackfillScript(args, createRealDeps());

  if (result.guardrailErrors.length > 0) {
    console.log(
      JSON.stringify(
        {
          mode: result.mode,
          errors: result.guardrailErrors.map((e) => e.message),
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const output = result.planResult ?? result.applyResult;
  console.log(JSON.stringify(output, null, 2));

  const errors = output?.errors ?? [];
  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

if (!process.env.VITEST) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Unexpected script failure";
    console.error(
      JSON.stringify({ mode: "error", errors: [message] }, null, 2),
    );
    process.exitCode = 1;
  });
}
