import type { FieldBillingCapabilities } from '@/lib/auth/field-billing-access';

type SupabaseLikeClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => any;
    };
  };
};

type CapabilityRow = {
  capability_key?: string | null;
};

const FIELD_BILLING_CAPABILITY_KEYS = [
  'field_billing_enabled',
  'can_view_field_billing_summary',
  'can_collect_field_payment',
  'can_report_non_card_collection',
  'can_collect_card_payment',
  'can_verify_non_card_collection',
] as const satisfies ReadonlyArray<keyof FieldBillingCapabilities>;

const FIELD_BILLING_CAPABILITY_KEY_SET = new Set<string>(FIELD_BILLING_CAPABILITY_KEYS);

function cleanId(value: unknown) {
  return String(value ?? '').trim();
}

function mapCapabilityRows(rows: CapabilityRow[] | null | undefined): Partial<FieldBillingCapabilities> {
  const capabilities: Partial<FieldBillingCapabilities> = {};

  for (const row of rows ?? []) {
    const key = cleanId(row?.capability_key);
    if (!FIELD_BILLING_CAPABILITY_KEY_SET.has(key)) continue;
    capabilities[key as keyof FieldBillingCapabilities] = true;
  }

  return capabilities;
}

export async function loadFieldBillingExplicitCapabilitiesForUser(params: {
  supabase: SupabaseLikeClient;
  accountOwnerUserId?: string | null;
  internalUserId?: string | null;
}): Promise<Partial<FieldBillingCapabilities>> {
  const accountOwnerUserId = cleanId(params.accountOwnerUserId);
  const internalUserId = cleanId(params.internalUserId);

  if (!accountOwnerUserId || !internalUserId) {
    return {};
  }

  const { data, error } = await params.supabase
    .from('internal_user_access_capabilities')
    .select('capability_key')
    .eq('account_owner_user_id', accountOwnerUserId)
    .eq('internal_user_id', internalUserId)
    .eq('enabled', true);

  if (error) {
    console.warn('Failed to load internal user field billing capabilities', {
      accountOwnerUserId,
      internalUserId,
      error: error instanceof Error ? error.message : String((error as any)?.message ?? error),
    });
    return {};
  }

  return mapCapabilityRows(data as CapabilityRow[] | null | undefined);
}
