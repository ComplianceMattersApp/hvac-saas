'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { requireInternalUser } from '@/lib/auth/internal-user';
import { resolveOperationalMutationEntitlementAccess } from '@/lib/business/platform-entitlement';
import { createClient } from '@/lib/supabase/server';
import { laDateTimeToUtcIso } from '@/lib/utils/schedule-la';

type CalendarBlockMutationContext = {
  supabase: any;
  accountOwnerUserId: string;
};

function normalizeCalendarReturnTo(raw: FormDataEntryValue | null) {
  const value = String(raw ?? '').trim();
  return value.startsWith('/calendar') ? value : '/calendar';
}

function withBanner(path: string, banner: string) {
  return `${path}${path.includes('?') ? '&' : '?'}banner=${banner}`;
}

async function requireScopedInternalCalendarBlockAssignee(params: {
  context: CalendarBlockMutationContext;
  internalUserId: string;
}) {
  const { context, internalUserId } = params;

  const { data: targetUser, error: targetErr } = await context.supabase
    .from('internal_users')
    .select('user_id')
    .eq('user_id', internalUserId)
    .eq('account_owner_user_id', context.accountOwnerUserId)
    .eq('is_active', true)
    .maybeSingle();

  if (targetErr) throw targetErr;
  return targetUser?.user_id ? String(targetUser.user_id) : null;
}

async function requireScopedCalendarBlockEvent(params: {
  context: CalendarBlockMutationContext;
  eventId: string;
}) {
  const { context, eventId } = params;

  const { data: existing, error: existingErr } = await context.supabase
    .from('calendar_events')
    .select('id')
    .eq('id', eventId)
    .eq('owner_user_id', context.accountOwnerUserId)
    .eq('event_type', 'block')
    .maybeSingle();

  if (existingErr) throw existingErr;
  return existing?.id ? String(existing.id) : null;
}

async function requireOperationalCalendarBlockEntitlementAccessOrRedirect(params: {
  supabase: any;
  accountOwnerUserId: string | null | undefined;
}) {
  const access = await resolveOperationalMutationEntitlementAccess({
    accountOwnerUserId: String(params.accountOwnerUserId ?? '').trim(),
    supabase: params.supabase,
  });
  if (access.authorized) return;
  const search = new URLSearchParams({
    err: 'entitlement_blocked',
    reason: access.reason,
  });
  redirect(`/ops/admin/company-profile?${search.toString()}`);
}

export async function createCalendarBlockEventFromForm(formData: FormData) {
  const supabase = await createClient();
  const { userId, internalUser } = await requireInternalUser({ supabase });
  const context = {
    supabase,
    accountOwnerUserId: String(internalUser.account_owner_user_id ?? '').trim(),
  } satisfies CalendarBlockMutationContext;

  const returnTo = normalizeCalendarReturnTo(formData.get('return_to'));
  const internalUserId = String(formData.get('internal_user_id') ?? '').trim();
  const date = String(formData.get('date') ?? '').trim();
  const startTime = String(formData.get('start_time') ?? '').trim();
  const endTime = String(formData.get('end_time') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();

  if (!internalUserId) redirect(withBanner(returnTo, 'calendar_block_user_required'));
  if (!title || !date || !startTime || !endTime) redirect(withBanner(returnTo, 'calendar_block_invalid'));

  let startAtIso = '';
  let endAtIso = '';

  try {
    startAtIso = laDateTimeToUtcIso(date, startTime);
    endAtIso = laDateTimeToUtcIso(date, endTime);
  } catch {
    redirect(withBanner(returnTo, 'calendar_block_invalid'));
  }

  if (new Date(endAtIso).getTime() <= new Date(startAtIso).getTime()) {
    redirect(withBanner(returnTo, 'calendar_block_invalid_range'));
  }

  const scopedInternalUserId = await requireScopedInternalCalendarBlockAssignee({
    context,
    internalUserId,
  });

  if (!scopedInternalUserId) redirect(withBanner(returnTo, 'calendar_block_user_required'));

  await requireOperationalCalendarBlockEntitlementAccessOrRedirect({
    supabase: context.supabase,
    accountOwnerUserId: context.accountOwnerUserId,
  });

  const { error: insertErr } = await supabase
    .from('calendar_events')
    .insert({
      owner_user_id: context.accountOwnerUserId,
      internal_user_id: scopedInternalUserId,
      created_by_user_id: userId,
      event_type: 'block',
      title,
      description: description || null,
      start_at: startAtIso,
      end_at: endAtIso,
      status: 'scheduled',
      job_id: null,
      service_id: null,
    });

  if (insertErr) throw insertErr;

  revalidatePath('/calendar');
  redirect(withBanner(returnTo, 'calendar_block_created'));
}

export async function updateCalendarBlockEventFromForm(formData: FormData) {
  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });
  const context = {
    supabase,
    accountOwnerUserId: String(internalUser.account_owner_user_id ?? '').trim(),
  } satisfies CalendarBlockMutationContext;

  const returnTo = normalizeCalendarReturnTo(formData.get('return_to'));
  const eventId = String(formData.get('event_id') ?? '').trim();
  const internalUserId = String(formData.get('internal_user_id') ?? '').trim();
  const date = String(formData.get('date') ?? '').trim();
  const startTime = String(formData.get('start_time') ?? '').trim();
  const endTime = String(formData.get('end_time') ?? '').trim();
  const title = String(formData.get('title') ?? '').trim();
  const description = String(formData.get('description') ?? '').trim();

  if (!eventId) redirect(withBanner(returnTo, 'calendar_block_update_missing'));
  if (!internalUserId) redirect(withBanner(returnTo, 'calendar_block_user_required'));
  if (!title || !date || !startTime || !endTime) redirect(withBanner(returnTo, 'calendar_block_invalid'));

  let startAtIso = '';
  let endAtIso = '';

  try {
    startAtIso = laDateTimeToUtcIso(date, startTime);
    endAtIso = laDateTimeToUtcIso(date, endTime);
  } catch {
    redirect(withBanner(returnTo, 'calendar_block_invalid'));
  }

  if (new Date(endAtIso).getTime() <= new Date(startAtIso).getTime()) {
    redirect(withBanner(returnTo, 'calendar_block_invalid_range'));
  }

  const scopedEventId = await requireScopedCalendarBlockEvent({
    context,
    eventId,
  });
  if (!scopedEventId) redirect(withBanner(returnTo, 'calendar_block_update_missing'));

  const scopedInternalUserId = await requireScopedInternalCalendarBlockAssignee({
    context,
    internalUserId,
  });
  if (!scopedInternalUserId) redirect(withBanner(returnTo, 'calendar_block_user_required'));

  await requireOperationalCalendarBlockEntitlementAccessOrRedirect({
    supabase: context.supabase,
    accountOwnerUserId: context.accountOwnerUserId,
  });

  const { error: updateErr } = await supabase
    .from('calendar_events')
    .update({
      title,
      description: description || null,
      internal_user_id: scopedInternalUserId,
      start_at: startAtIso,
      end_at: endAtIso,
    })
    .eq('id', scopedEventId)
    .eq('owner_user_id', context.accountOwnerUserId)
    .eq('event_type', 'block');

  if (updateErr) throw updateErr;

  revalidatePath('/calendar');
  redirect(withBanner(returnTo, 'calendar_block_updated'));
}

export async function deleteCalendarBlockEventFromForm(formData: FormData) {
  const supabase = await createClient();
  const { internalUser } = await requireInternalUser({ supabase });
  const context = {
    supabase,
    accountOwnerUserId: String(internalUser.account_owner_user_id ?? '').trim(),
  } satisfies CalendarBlockMutationContext;

  const returnTo = normalizeCalendarReturnTo(formData.get('return_to'));
  const eventId = String(formData.get('event_id') ?? '').trim();

  if (!eventId) redirect(withBanner(returnTo, 'calendar_block_delete_invalid'));

  const scopedEventId = await requireScopedCalendarBlockEvent({
    context,
    eventId,
  });
  if (!scopedEventId) redirect(withBanner(returnTo, 'calendar_block_delete_missing'));

  await requireOperationalCalendarBlockEntitlementAccessOrRedirect({
    supabase: context.supabase,
    accountOwnerUserId: context.accountOwnerUserId,
  });

  const { error: deleteErr } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', scopedEventId)
    .eq('owner_user_id', context.accountOwnerUserId)
    .eq('event_type', 'block');

  if (deleteErr) throw deleteErr;

  revalidatePath('/calendar');
  redirect(withBanner(returnTo, 'calendar_block_deleted'));
}