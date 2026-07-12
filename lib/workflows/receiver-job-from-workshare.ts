import type { SupabaseClient } from "@supabase/supabase-js";

import { createJob } from "@/lib/actions/job-actions";
import { findOrCreateCustomer } from "@/lib/customers/findOrCreateCustomer";
import type { AccountWorkshareRequestRow } from "@/lib/workflows/account-workshare-requests-read";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nullable(value: unknown) {
  const normalized = clean(value);
  return normalized.length > 0 ? normalized : null;
}

// The snapshot only carries a display name; split it into first/last for the
// rater-account customer record (whole string as first name when single-token).
function splitName(full: string | null): { first: string | null; last: string | null } {
  const normalized = clean(full);
  if (!normalized) return { first: null, last: null };
  const parts = normalized.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function scopeText(snapshot: AccountWorkshareRequestRow["requested_scope_snapshot"]): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const text = clean((snapshot as Record<string, unknown>).requested_scope_text);
  return text || null;
}

// P1-E: create an ECC job owned by the RECEIVER (rater) account from an accepted
// workshare request's snapshot. Reuse-first: matches an existing rater-account
// customer (by name+phone) and reuses an existing same-address location before
// creating fresh, then a root ECC job. Ownership is stamped by the jobs trigger
// via the customer's owner_user_id. Returns the new job id. Throws on any
// failure so the caller can compensate.
export async function createReceiverJobFromWorkshareSnapshot(params: {
  admin: SupabaseClient;
  receiverAccountOwnerUserId: string;
  request: AccountWorkshareRequestRow;
}): Promise<{ jobId: string }> {
  const { admin, receiverAccountOwnerUserId, request } = params;

  const { first, last } = splitName(
    request.customer_name_snapshot || request.customer_contact_name_snapshot,
  );
  const fullName = [first, last].filter(Boolean).join(" ") || null;
  const email = nullable(request.customer_email_snapshot);
  const phone = nullable(request.customer_phone_snapshot);

  // Reuse-first customer match within the rater's account (phone + name).
  const { customerId } = await findOrCreateCustomer({
    supabase: admin,
    firstName: first,
    lastName: last,
    phone,
    email,
    ownerUserId: receiverAccountOwnerUserId,
  });

  const addressLine1 =
    nullable(request.location_address_line1_snapshot) || nullable(request.location_address_snapshot);
  const addressLine2 = nullable(request.location_address_line2_snapshot);
  const city = nullable(request.location_city_snapshot);
  const state = nullable(request.location_state_snapshot) || "CA";
  const zip = nullable(request.location_zip_snapshot);

  // Reuse an existing same-address location for this customer before creating one.
  let locationId: string | null = null;
  if (addressLine1) {
    const { data: existingLocation } = await admin
      .from("locations")
      .select("id")
      .eq("customer_id", customerId)
      .eq("owner_user_id", receiverAccountOwnerUserId)
      .eq("address_line1", addressLine1)
      .limit(1)
      .maybeSingle();
    if (existingLocation?.id) locationId = String(existingLocation.id);
  }

  if (!locationId) {
    const { data: locationData, error: locationError } = await admin
      .from("locations")
      .insert({
        customer_id: customerId,
        owner_user_id: receiverAccountOwnerUserId,
        address_line1: addressLine1,
        address_line2: addressLine2,
        city,
        state,
        zip,
        postal_code: zip,
      })
      .select("id")
      .single();
    if (locationError) throw locationError;
    locationId = String((locationData as { id: string }).id);
  }

  const title =
    nullable(request.source_job_title_snapshot)
    || (fullName ? `ECC/HERS Testing — ${fullName}` : "ECC/HERS Testing");

  const jobNotes =
    nullable(request.sender_notes_snapshot)
    || scopeText(request.requested_scope_snapshot)
    || nullable(request.source_job_description_snapshot);

  const created = await createJob(
    {
      job_type: "ecc",
      title,
      city: city ?? "",
      job_address: addressLine1,
      scheduled_date: null,
      status: "open",
      ops_status: "need_to_schedule",
      customer_id: customerId,
      location_id: locationId,
      customer_first_name: first,
      customer_last_name: last,
      customer_email: email,
      customer_phone: phone,
      job_notes: jobNotes,
      permit_number: nullable(request.permit_number_snapshot),
    },
    { serviceCaseWriteClient: admin },
  );

  return { jobId: created.id };
}
