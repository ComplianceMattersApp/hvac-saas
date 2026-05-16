export const SMS_SANDBOX_TEST_RECIPIENT_SELECT = [
  "id",
  "account_owner_user_id",
  "phone_e164",
  "phone_label",
  "is_active",
  "verified_at",
  "verified_by_user_id",
  "created_at",
  "updated_at",
].join(", ");

type SupabaseLike = {
  from(table: string): any;
};

export type SmsSandboxTestRecipientRow = {
  id: string;
  account_owner_user_id: string;
  phone_e164: string;
  phone_label: string | null;
  is_active: boolean;
  verified_at: string | null;
  verified_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export async function readSmsSandboxTestRecipientForPhone(params: {
  supabase: SupabaseLike;
  accountOwnerUserId: string;
  phoneE164: string;
}): Promise<SmsSandboxTestRecipientRow | null> {
  const response = await params.supabase
    .from("sms_sandbox_test_recipients")
    .select(SMS_SANDBOX_TEST_RECIPIENT_SELECT)
    .eq("account_owner_user_id", params.accountOwnerUserId)
    .eq("phone_e164", params.phoneE164)
    .maybeSingle();

  if (response?.error) {
    throw response.error;
  }

  return (response?.data as SmsSandboxTestRecipientRow | null) ?? null;
}
