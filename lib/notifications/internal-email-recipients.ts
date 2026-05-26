type ResolveInternalOpsRecipientEmailsInput = {
  admin: any;
  accountOwnerUserId: string;
};

export async function resolveInternalOpsRecipientEmails(
  params: ResolveInternalOpsRecipientEmailsInput,
): Promise<string[]> {
  const accountOwnerUserId = String(params.accountOwnerUserId ?? "").trim();
  if (!accountOwnerUserId) return [];

  const { data: internalRows, error: internalErr } = await params.admin
    .from("internal_users")
    .select("user_id, role, is_active")
    .eq("account_owner_user_id", accountOwnerUserId)
    .eq("is_active", true)
    .in("role", ["admin", "office"]);

  if (internalErr) throw internalErr;

  const recipientUserIds = Array.from(
    new Set(
      (internalRows ?? [])
        .map((row: any) => String(row?.user_id ?? "").trim())
        .filter(Boolean),
    ),
  );

  if (recipientUserIds.length === 0) return [];

  const { data: profileRows, error: profileErr } = await params.admin
    .from("profiles")
    .select("id, email")
    .in("id", recipientUserIds);

  if (profileErr) throw profileErr;

  return Array.from(
    new Set(
      (profileRows ?? [])
        .map((row: any) => String(row?.email ?? "").trim().toLowerCase())
        .filter((email: string) => email.includes("@")),
    ),
  );
}
