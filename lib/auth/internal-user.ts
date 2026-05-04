import { createClient } from "@/lib/supabase/server";

export type InternalRole = "admin" | "office" | "tech";

export type InternalUserRow = {
  user_id: string;
  role: InternalRole;
  is_active: boolean;
  account_owner_user_id: string;
  created_by: string | null;
};

type InternalAccessErrorCode =
  | "AUTH_REQUIRED"
  | "INTERNAL_USER_REQUIRED"
  | "INTERNAL_ROLE_REQUIRED";

export class InternalAccessError extends Error {
  code: InternalAccessErrorCode;

  constructor(code: InternalAccessErrorCode, message: string) {
    super(message);
    this.name = "InternalAccessError";
    this.code = code;
    Object.setPrototypeOf(this, InternalAccessError.prototype);
  }
}

export function isInternalAccessError(
  error: unknown,
): error is InternalAccessError {
  return error instanceof InternalAccessError;
}

type InternalUserLookupParams = {
  supabase?: any;
  userId?: string | null;
  timing?: (phase: string, elapsedMs: number) => void;
};

async function timeInternalUserPhase<T>(
  timing: ((phase: string, elapsedMs: number) => void) | undefined,
  phase: string,
  work: () => Promise<T>,
): Promise<T> {
  if (!timing) return work();
  const startedAt = Date.now();
  try {
    return await work();
  } finally {
    timing(phase, Date.now() - startedAt);
  }
}

function parseInternalRole(value: unknown): InternalRole | null {
  if (value === "admin" || value === "office" || value === "tech") {
    return value;
  }

  return null;
}

export async function getInternalUser(
  params: InternalUserLookupParams = {},
): Promise<InternalUserRow | null> {
  const supabase = params.supabase ?? (await createClient());
  let userId = params.userId ?? null;

  if (!userId) {
    const {
      data: { user },
      error,
    } = await timeInternalUserPhase(params.timing, "auth.getUser", async () =>
      supabase.auth.getUser(),
    );

    if (error) throw error;
    userId = user?.id ?? null;
  }

  if (!userId) return null;

  const { data, error } = await timeInternalUserPhase(
    params.timing,
    "internalUserLookup",
    async () =>
      supabase
        .from("internal_users")
        .select("user_id, role, is_active, account_owner_user_id, created_by")
        .eq("user_id", userId)
        .maybeSingle(),
  );

  if (error) throw error;
  if (!data?.user_id || !data?.account_owner_user_id) return null;

  const role = parseInternalRole(data.role);
  if (!role) return null;

  return {
    user_id: data.user_id,
    role,
    is_active: Boolean(data.is_active),
    account_owner_user_id: data.account_owner_user_id,
    created_by: data.created_by ?? null,
  };
}

export async function requireInternalUser(
  params: InternalUserLookupParams = {},
) {
  const supabase = params.supabase ?? (await createClient());
  let userId = params.userId ?? null;

  if (!userId) {
    const {
      data: { user },
      error,
    } = await timeInternalUserPhase(params.timing, "auth.getUser", async () =>
      supabase.auth.getUser(),
    );

    if (error) throw error;
    userId = user?.id ?? null;
  }

  if (!userId) {
    throw new InternalAccessError("AUTH_REQUIRED", "Authentication required.");
  }

  const internalUser = await getInternalUser({
    supabase,
    userId,
    timing: params.timing,
  });

  if (!internalUser?.is_active) {
    throw new InternalAccessError(
      "INTERNAL_USER_REQUIRED",
      "Active internal user required.",
    );
  }

  return { userId, internalUser };
}

export async function requireInternalRole(
  roles: InternalRole | InternalRole[],
  params: InternalUserLookupParams = {},
) {
  const allowedRoles = Array.isArray(roles) ? roles : [roles];
  const { userId, internalUser } = await requireInternalUser(params);

  if (!allowedRoles.includes(internalUser.role)) {
    throw new InternalAccessError(
      "INTERNAL_ROLE_REQUIRED",
      `Required internal role: ${allowedRoles.join(", ")}`,
    );
  }

  return { userId, internalUser };
}