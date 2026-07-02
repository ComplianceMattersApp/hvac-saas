// app/jobs/new/page.tsx

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NewJobForm from "./NewJobForm";
import {
  landingPathForDualContextAccess,
  resolveDualContextAccess,
} from "@/lib/auth/dual-context-access";
import {
  resolveDefaultJobTypeForAccountOwnerId,
  resolveProductModeForAccountOwnerId,
  type ProductMode,
} from "@/lib/business/product-mode-defaults";
import { isMaintenanceAgreementsEnabled } from "@/lib/maintenance-agreements/agreement-exposure";
import { resolveScopedMaintenanceAgreementJobPrefill } from "@/lib/maintenance-agreements/read-model";

type ExistingCustomerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

type CustomerLookupRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

type LocationRow = {
  id: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  nickname: string | null;
};

type LocationLookupRow = {
  id: string;
  customer_id: string;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  postal_code: string | null;
  nickname: string | null;
};

type LocationSiteAccessHintRow = {
  linked_entity_id: string | null;
  display_name: string | null;
  phone_e164: string | null;
  email: string | null;
  notes: string | null;
  updated_at: string | null;
};

type PricebookTemplateRow = {
  id: string | null;
  item_name: string | null;
  item_type: string | null;
  category: string | null;
  default_description: string | null;
  default_unit_price: number | null;
  unit_label: string | null;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default async function NewJobPage(props: {
  searchParams?: Promise<{
    customer_id?: string;
    source?: string;
    err?: string;
    proposal_id?: string;
    maintenance_agreement_id?: string;
    create_customer?: string;
    context?: string;
  }>;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/login");
  
  const user = userData.user;
  const sp = props.searchParams ? await props.searchParams : undefined;
  const requestedContext = String(sp?.context ?? "").trim().toLowerCase();
  const explicitPortalContext = requestedContext === "portal";
  const access = await resolveDualContextAccess({ supabase, user });

  if (explicitPortalContext) {
    if (!access.hasPortalAccess || !access.portal) redirect("/portal");
  } else if (!access.hasActiveAppAccess) {
    redirect(landingPathForDualContextAccess(access));
  }

  // Identify contractor user (multi-user per contractor)
  let myContractor: { id: string; name: string } | null = null;
  let initialJobType: "ecc" | "service" = "ecc";

  if (explicitPortalContext && access.portal?.contractorId) {
    myContractor = {
      id: access.portal.contractorId,
      name: access.portal.contractorName ?? "Contractor",
    };
  }

  let contractors: Array<{ id: string; name: string }> = [];
  let productMode: ProductMode = "hybrid";
  let accountOwnerUserId: string | null = null;
  let pricebookTemplateItems: Array<{
    id: string;
    item_name: string;
    item_type: string | null;
    category: string | null;
    default_description: string | null;
    default_unit_price: number | null;
    unit_label: string | null;
  }> = [];
  if (!myContractor?.id) {
    const { data: contractorRows, error } = await supabase
      .from("contractors")
      .select("id, name")
      .eq("lifecycle_state", "active")
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);
    contractors = contractorRows ?? [];

    const { data: internalUserRow, error: internalUserErr } = await supabase
      .from("internal_users")
      .select("account_owner_user_id, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (internalUserErr) throw new Error(internalUserErr.message);

    accountOwnerUserId = String(internalUserRow?.account_owner_user_id ?? "").trim() || null;
    if (accountOwnerUserId) {
      const [resolvedJobType, resolvedProductMode] = await Promise.all([
        resolveDefaultJobTypeForAccountOwnerId({
          supabase,
          accountOwnerUserId,
        }),
        resolveProductModeForAccountOwnerId({
          supabase,
          accountOwnerUserId,
        }),
      ]);
      initialJobType = resolvedJobType;
      productMode = resolvedProductMode;
    }
    if (accountOwnerUserId && internalUserRow?.is_active !== false) {
      const { data: pricebookRows, error: pricebookRowsErr } = await supabase
        .from("pricebook_items")
        .select("id, item_name, item_type, category, default_description, default_unit_price, unit_label")
        .eq("account_owner_user_id", accountOwnerUserId)
        .eq("is_active", true)
        .order("item_name", { ascending: true });

      if (pricebookRowsErr) throw new Error(pricebookRowsErr.message);

      pricebookTemplateItems = (pricebookRows as PricebookTemplateRow[] | null ?? [])
        .map((row) => ({
          id: String(row?.id ?? "").trim(),
          item_name: String(row?.item_name ?? "").trim(),
          item_type: String(row?.item_type ?? "").trim() || null,
          category: String(row?.category ?? "").trim() || null,
          default_description: String(row?.default_description ?? "").trim() || null,
          default_unit_price:
            row?.default_unit_price === null || row?.default_unit_price === undefined
              ? null
              : Number(row.default_unit_price),
          unit_label: String(row?.unit_label ?? "").trim() || null,
        }))
        .filter((row) => row.id && row.item_name);
    }
  }

  const customerId = String(sp?.customer_id ?? "").trim();
  const source = String(sp?.source ?? "").trim().toLowerCase();
  const errorCode = String(sp?.err ?? "").trim() || null;
  const submittedProposalId = String(sp?.proposal_id ?? "").trim() || null;
  const maintenanceAgreementId = String(sp?.maintenance_agreement_id ?? "").trim();
  const initialCreateNewCustomer = String(sp?.create_customer ?? "").trim() === "1";
  const requestedCustomerContext = source === "customer";

  // Optional: existing customer mode
  let existingCustomer: ExistingCustomerRow | null = null;
  let customerLocations: LocationRow[] = [];
  let customerContextMode = false;

  // Internal guided mode lookup data
  let customerLookupRows: CustomerLookupRow[] = [];
  let locationLookupRows: LocationLookupRow[] = [];
  let locationSiteAccessHints: Array<{
    location_id: string;
    display_name: string;
    phone_e164: string | null;
    email: string | null;
    notes: string | null;
  }> = [];
  let maintenanceAgreementPrefill = null as Awaited<
    ReturnType<typeof resolveScopedMaintenanceAgreementJobPrefill>
  >;
  let maintenanceAgreementPrefillStatus: "unavailable" | null = null;

  if (customerId && isUuid(customerId)) {
    const { data: cRow, error: cErr } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone, email")
      .eq("id", customerId)
      .maybeSingle();

    if (cErr) throw cErr;
    existingCustomer = cRow;

    const { data: locs, error: locErr } = await supabase
      .from("locations")
      .select("id, address_line1, city, state, zip, nickname")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (locErr) throw locErr;
    customerLocations = locs ?? [];
  }

  customerContextMode =
    !myContractor?.id &&
    requestedCustomerContext &&
    Boolean(existingCustomer?.id);

  if (!myContractor?.id && !customerContextMode) {
    const { data: lookupCustomers, error: lookupCustomerErr } = await supabase
      .from("customers")
      .select("id, full_name, first_name, last_name, phone, email")
      .order("full_name", { ascending: true })
      .limit(500);

    if (lookupCustomerErr) throw lookupCustomerErr;
    customerLookupRows = (lookupCustomers ?? []) as CustomerLookupRow[];

    const customerIds = customerLookupRows.map((c) => c.id).filter(Boolean);

    if (customerIds.length > 0) {
      const { data: lookupLocations, error: lookupLocationErr } = await supabase
        .from("locations")
        .select("id, customer_id, address_line1, city, state, zip, postal_code, nickname")
        .in("customer_id", customerIds)
        .order("created_at", { ascending: false })
        .limit(1200);

      if (lookupLocationErr) throw lookupLocationErr;
      locationLookupRows = (lookupLocations ?? []) as LocationLookupRow[];
    }
  }

  if (!myContractor?.id && maintenanceAgreementId) {
    const prefillEligible =
      isMaintenanceAgreementsEnabled() &&
      isUuid(customerId) &&
      isUuid(maintenanceAgreementId) &&
      Boolean(accountOwnerUserId);

    if (!prefillEligible) {
      maintenanceAgreementPrefillStatus = "unavailable";
    } else {
      try {
        maintenanceAgreementPrefill = await resolveScopedMaintenanceAgreementJobPrefill({
          supabase,
          accountOwnerUserId,
          customerId,
          agreementId: maintenanceAgreementId,
        });
      } catch {
        maintenanceAgreementPrefill = null;
      }

      if (!maintenanceAgreementPrefill) {
        maintenanceAgreementPrefillStatus = "unavailable";
      }
    }
  }

  if (!myContractor?.id && accountOwnerUserId) {
    const scopedLocationIds = customerContextMode
      ? customerLocations.map((row) => String(row.id ?? "").trim()).filter(Boolean)
      : locationLookupRows.map((row) => String(row.id ?? "").trim()).filter(Boolean);

    if (scopedLocationIds.length > 0) {
      const { data: siteAccessRows, error: siteAccessErr } = await supabase
        .from("contact_recipients")
        .select("linked_entity_id, display_name, phone_e164, email, notes, updated_at")
        .eq("account_owner_user_id", accountOwnerUserId)
        .eq("linked_entity_type", "location")
        .eq("recipient_role", "site_access_contact")
        .eq("status", "active")
        .in("linked_entity_id", scopedLocationIds)
        .order("updated_at", { ascending: false })
        .limit(1500);

      if (siteAccessErr) throw siteAccessErr;

      const dedupedByLocation = new Map<string, {
        location_id: string;
        display_name: string;
        phone_e164: string | null;
        email: string | null;
        notes: string | null;
      }>();

      (siteAccessRows as LocationSiteAccessHintRow[] | null ?? []).forEach((row) => {
        const locationId = String(row.linked_entity_id ?? "").trim();
        const displayName = String(row.display_name ?? "").trim();
        if (!locationId || !displayName || dedupedByLocation.has(locationId)) return;
        dedupedByLocation.set(locationId, {
          location_id: locationId,
          display_name: displayName,
          phone_e164: row.phone_e164 ?? null,
          email: row.email ?? null,
          notes: row.notes ?? null,
        });
      });

      locationSiteAccessHints = Array.from(dedupedByLocation.values());
    }
  }

  return (
    <NewJobForm
      contractors={contractors}
      existingCustomer={existingCustomer}
      locations={customerLocations}
      customerLookupRows={customerLookupRows}
      locationLookupRows={locationLookupRows}
      myContractor={myContractor}
      errorCode={errorCode}
      submittedProposalId={submittedProposalId}
      customerContextMode={customerContextMode}
      customerContextSource={customerContextMode ? "customer" : null}
      initialJobType={initialJobType}
      productMode={productMode}
      pricebookTemplateItems={pricebookTemplateItems}
      locationSiteAccessHints={locationSiteAccessHints}
      maintenanceAgreementPrefill={maintenanceAgreementPrefill}
      maintenanceAgreementPrefillStatus={maintenanceAgreementPrefillStatus}
      initialCreateNewCustomer={initialCreateNewCustomer}
    />
  );
}
