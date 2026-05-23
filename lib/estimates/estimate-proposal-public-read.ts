import { createAdminClient } from "@/lib/supabase/server";
import { buildEstimateDocumentViewModel } from "@/lib/estimates/estimate-document";
import { isEstimateProposalLinksEnabled } from "@/lib/estimates/estimate-exposure";
import { getEstimateById } from "@/lib/estimates/estimate-read";
import { hashEstimateProposalLinkToken } from "@/lib/estimates/estimate-proposal-links";
import { resolveOperationalTenantIdentity } from "@/lib/email/operational-tenant-branding";

type ProposalLinkRow = {
  id: string;
  estimate_id: string;
  account_owner_user_id: string;
  status: string;
  expires_at: string;
  revoked_at: string | null;
};

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

function normalizeToken(rawToken: string) {
  return String(rawToken ?? "").trim();
}

function isLikelyProposalToken(rawToken: string) {
  return /^[A-Za-z0-9_-]{32,}$/.test(rawToken);
}

function isMissingProposalLinkSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: string | null; message?: string | null };
  const code = String(maybeError.code ?? "").trim();
  const message = String(maybeError.message ?? "").toLowerCase();

  if (code === "42P01" || code === "PGRST205") {
    return true;
  }

  return (
    message.includes("estimate_proposal_links") ||
    message.includes("schema cache") ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

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

async function findActiveProposalLinkByTokenHash(params: {
  admin: any;
  tokenHash: string;
  nowIso: string;
}) {
  try {
    const { data, error } = await params.admin
      .from("estimate_proposal_links")
      .select("id, estimate_id, account_owner_user_id, status, expires_at, revoked_at")
      .eq("token_hash", params.tokenHash)
      .maybeSingle();

    if (error) {
      if (isMissingProposalLinkSchemaError(error)) return null;
      throw error;
    }

    const proposalLink = (data ?? null) as ProposalLinkRow | null;
    if (!proposalLink?.id) return null;

    if (String(proposalLink.status ?? "").trim().toLowerCase() !== "active") return null;
    if (proposalLink.revoked_at) return null;
    if (String(proposalLink.expires_at ?? "").trim() <= params.nowIso) return null;

    return proposalLink;
  } catch (error) {
    if (isMissingProposalLinkSchemaError(error)) return null;
    throw error;
  }
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

  const token = normalizeToken(rawToken);
  if (!token || !isLikelyProposalToken(token)) {
    return { available: false };
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const tokenHash = hashEstimateProposalLinkToken(token);

  const proposalLink = await findActiveProposalLinkByTokenHash({
    admin,
    tokenHash,
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