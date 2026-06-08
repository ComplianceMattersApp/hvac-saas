import type { FieldBillingCapabilities } from '@/lib/auth/field-billing-access';

type SupabaseLikeClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => any;
      in?: (column: string, values: unknown[]) => any;
    };
  };
};

type CapabilityRow = {
  internal_user_id?: string | null;
  capability_key?: string | null;
  enabled?: boolean | null;
};

export const FIELD_BILLING_ACCESS_CAPABILITY_KEYS = [
  'field_billing_enabled',
  'can_view_field_billing_summary',
  'can_collect_field_payment',
  'can_report_non_card_collection',
  'can_collect_card_payment',
  'can_verify_non_card_collection',
] as const satisfies ReadonlyArray<keyof FieldBillingCapabilities>;

export type FieldBillingAccessCapabilityKey = (typeof FIELD_BILLING_ACCESS_CAPABILITY_KEYS)[number];

const FIELD_BILLING_CAPABILITY_KEY_SET = new Set<string>(FIELD_BILLING_ACCESS_CAPABILITY_KEYS);

function cleanId(value: unknown) {
  return String(value ?? '').trim();
}

function isMissingInternalUserAccessCapabilitiesError(error: unknown) {
  const code = String((error as any)?.code ?? '').trim();
  const message = String((error as any)?.message ?? error ?? '').toLowerCase();

  if (code !== '42P01' && code !== 'PGRST205') return false;
  return message.includes('internal_user_access_capabilities')
    && (
      message.includes('schema cache')
      || message.includes('does not exist')
      || message.includes('could not find the table')
    );
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
    if (!isMissingInternalUserAccessCapabilitiesError(error)) {
      throw error;
    }

    console.warn('Failed to load internal user field billing capabilities', {
      accountOwnerUserId,
      internalUserId,
      error: error instanceof Error ? error.message : String((error as any)?.message ?? error),
    });
    return {};
  }

  return mapCapabilityRows(data as CapabilityRow[] | null | undefined);
}

export async function loadFieldBillingCapabilityStatesForUsers(params: {
  supabase: SupabaseLikeClient;
  accountOwnerUserId?: string | null;
  internalUserIds?: Array<string | null | undefined> | null;
}): Promise<Record<string, Partial<Record<FieldBillingAccessCapabilityKey, boolean>>>> {
  const accountOwnerUserId = cleanId(params.accountOwnerUserId);
  const internalUserIds = Array.from(
    new Set((params.internalUserIds ?? []).map(cleanId).filter(Boolean)),
  );

  if (!accountOwnerUserId || internalUserIds.length === 0) {
    return {};
  }

  const query = params.supabase
    .from('internal_user_access_capabilities')
    .select('internal_user_id, capability_key, enabled')
    .eq('account_owner_user_id', accountOwnerUserId);

  const { data, error } = await (typeof query.in === 'function'
    ? query.in('internal_user_id', internalUserIds)
    : query);

  if (error) {
    if (!isMissingInternalUserAccessCapabilitiesError(error)) {
      throw error;
    }

    console.warn('Failed to load internal user field billing capability states', {
      accountOwnerUserId,
      internalUserIds,
      error: error instanceof Error ? error.message : String((error as any)?.message ?? error),
    });
    return {};
  }

  const states: Record<string, Partial<Record<FieldBillingAccessCapabilityKey, boolean>>> = {};
  for (const row of (data ?? []) as CapabilityRow[]) {
    const internalUserId = cleanId(row.internal_user_id);
    const capabilityKey = cleanId(row.capability_key);
    if (!internalUserId || !FIELD_BILLING_CAPABILITY_KEY_SET.has(capabilityKey)) continue;
    states[internalUserId] ??= {};
    states[internalUserId][capabilityKey as FieldBillingAccessCapabilityKey] = row.enabled === true;
  }

  return states;
}
