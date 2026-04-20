import { createAdminClient } from "@/lib/supabase/server";

type ResolveNotificationAccountOwnerUserIdInput = {
  accountOwnerUserId?: string | null;
  jobId?: string | null;
};

export async function resolveNotificationAccountOwnerUserId(
  input: ResolveNotificationAccountOwnerUserIdInput,
): Promise<string | null> {
  const explicitAccountOwnerUserId = String(input.accountOwnerUserId ?? "").trim();
  if (explicitAccountOwnerUserId) return explicitAccountOwnerUserId;

  const jobId = String(input.jobId ?? "").trim();
  if (!jobId) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("jobs")
    .select(
      `
      id,
      contractors:contractor_id ( owner_user_id ),
      customers:customer_id ( owner_user_id ),
      locations:location_id ( owner_user_id )
      `,
    )
    .eq("id", jobId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return null;

  const contractorOwnerUserId = String((data as any)?.contractors?.owner_user_id ?? "").trim();
  if (contractorOwnerUserId) return contractorOwnerUserId;

  const customerOwnerUserId = String((data as any)?.customers?.owner_user_id ?? "").trim();
  if (customerOwnerUserId) return customerOwnerUserId;

  const locationOwnerUserId = String((data as any)?.locations?.owner_user_id ?? "").trim();
  return locationOwnerUserId || null;
}