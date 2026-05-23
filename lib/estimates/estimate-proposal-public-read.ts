import { createAdminClient } from "@/lib/supabase/server";
import { buildEstimateDocumentViewModel } from "@/lib/estimates/estimate-document";
import { isEstimateProposalLinksEnabled } from "@/lib/estimates/estimate-exposure";
import { getEstimateById } from "@/lib/estimates/estimate-read";
import { resolveOperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";
import {
  findActiveProposalLinkByRawToken,
} from "@/lib/estimates/estimate-proposal-public-shared";

export type PublicProposalShellResult =
  | { available: false }
  | {
      available: true;
      proposal: {
        business: {
          displayName: string;
          supportEmail: string | null;
          supportPhone: string | null;
          logoUrl: string | null;
        };
        identity: {
          estimateNumber: string;
          title: string;
        };
        lifecycle: {
          createdAt: string;
          sentAt: string | null;
        };
        context: {
          locationDisplay: string | null;
        };
        proposalMode: "single_option_flat" | "multi_option_packages";
        totals: {
          subtotalCents: number;
          totalCents: number;
        };
        lines: Array<{
          itemName: string;
          description: string | null;
          itemType: string;
          quantity: number;
          unitPriceCents: number;
          lineSubtotalCents: number;
        }>;
        options: Array<{
          slotIndex: number;
          label: string;
          summary: string | null;
          subtotalCents: number;
          totalCents: number;
          lines: Array<{
            itemName: string;
            description: string | null;
            itemType: string;
            quantity: number;
            unitPriceCents: number;
            lineSubtotalCents: number;
          }>;
        }>;
      };
    };


async function loadSafeLocationDisplay(params: {
  admin: any;
  locationId: string | null;
  accountOwnerUserId: string;
}) {
  const locationId = String(params.locationId ?? "").trim();
  if (!locationId) return null;

  const { data, error } = await params.admin
    .from("locations")
    .select("id, address_line1, address_line2, city, state, zip, nickname")
    .eq("id", locationId)
    .eq("owner_user_id", params.accountOwnerUserId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return null;

  return (
    String((data as { nickname?: string | null }).nickname ?? "").trim() ||
    [
      String((data as { address_line1?: string | null }).address_line1 ?? "").trim(),
      String((data as { address_line2?: string | null }).address_line2 ?? "").trim(),
      [
        String((data as { city?: string | null }).city ?? "").trim(),
        String((data as { state?: string | null }).state ?? "").trim(),
        String((data as { zip?: string | null }).zip ?? "").trim(),
      ]
        .filter(Boolean)
        .join(" "),
    ]
      .filter(Boolean)
      .join(", ") ||
    null
  );
}

function toPublicProposalShell(input: {
  documentView: ReturnType<typeof buildEstimateDocumentViewModel>;
  business: Awaited<ReturnType<typeof resolveOperationalTenantIdentity>>;
}): PublicProposalShellResult {
  return {
    available: true,
    proposal: {
      business: {
        displayName: input.business.displayName,
        supportEmail: input.business.supportEmail,
        supportPhone: input.business.supportPhone,
        logoUrl: input.business.logoUrl,
      },
      identity: {
        estimateNumber: input.documentView.identity.estimateNumber,
        title: input.documentView.identity.title,
      },
      lifecycle: {
        createdAt: input.documentView.lifecycle.createdAt,
        sentAt: input.documentView.lifecycle.sentAt,
      },
      context: {
        locationDisplay: input.documentView.context.locationDisplay,
      },
      proposalMode: input.documentView.proposalMode,
      totals: {
        subtotalCents: input.documentView.totals.subtotalCents,
        totalCents: input.documentView.totals.totalCents,
      },
      lines: input.documentView.lines.map((line) => ({
        itemName: line.itemName,
        description: line.description,
        itemType: line.itemType,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        lineSubtotalCents: line.lineSubtotalCents,
      })),
      options: input.documentView.options.map((option) => ({
        slotIndex: option.slotIndex,
        label: option.label,
        summary: option.summary,
        subtotalCents: option.subtotalCents,
        totalCents: option.totalCents,
        lines: option.lines.map((line) => ({
          itemName: line.itemName,
          description: line.description,
          itemType: line.itemType,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          lineSubtotalCents: line.lineSubtotalCents,
        })),
      })),
    },
  };
}

export async function readPublicEstimateProposalByToken(rawToken: string): Promise<PublicProposalShellResult> {
  if (!isEstimateProposalLinksEnabled()) {
    return { available: false };
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const proposalLink = await findActiveProposalLinkByRawToken({
    admin,
    rawToken,
    nowIso,
  });
  if (!proposalLink?.id) {
    return { available: false };
  }

  const internalScope = {
    account_owner_user_id: proposalLink.account_owner_user_id,
  };

  const estimate = await getEstimateById({
    estimateId: proposalLink.estimate_id,
    internalUser: internalScope,
    supabase: admin,
  });
  if (!estimate?.id) {
    return { available: false };
  }

  if (String(estimate.account_owner_user_id ?? "").trim() !== proposalLink.account_owner_user_id) {
    return { available: false };
  }

  if (String(estimate.status ?? "").trim().toLowerCase() !== "sent") {
    return { available: false };
  }

  const locationDisplay = await loadSafeLocationDisplay({
    admin,
    locationId: estimate.location_id,
    accountOwnerUserId: proposalLink.account_owner_user_id,
  });

  const documentView = buildEstimateDocumentViewModel({
    estimate,
    customerName: null,
    locationDisplay,
  });

  const business = await resolveOperationalTenantIdentity({
    accountOwnerUserId: proposalLink.account_owner_user_id,
    supabase: admin,
  });

  return toPublicProposalShell({ documentView, business });
}