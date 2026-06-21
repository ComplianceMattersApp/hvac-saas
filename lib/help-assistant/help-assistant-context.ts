import type { InternalRole } from "@/lib/auth/internal-user";
import type { ProductMode } from "@/lib/business/product-mode-defaults";

export type HelpAssistantPageFamily =
  | "launch_room"
  | "training_room"
  | "operations"
  | "today"
  | "admin"
  | "other";

export type HelpAssistantSafeContext = {
  pathname: string;
  pageFamily: HelpAssistantPageFamily;
  internalRole: InternalRole | "owner" | "unknown";
  roleLabel: string;
  productMode: ProductMode | "unknown";
  canViewFinancialRegister: boolean;
  canCollectFieldPayment: boolean;
};

function cleanPathname(value: unknown) {
  const raw = String(value ?? "").trim();
  const withoutQuery = raw.split("?")[0]?.split("#")[0] ?? "";
  if (!withoutQuery.startsWith("/")) return "/";
  return withoutQuery.replace(/\/{2,}/g, "/");
}

export function inferHelpAssistantPageFamily(pathname: string): HelpAssistantPageFamily {
  if (pathname === "/training" || pathname.startsWith("/training/")) return "training_room";
  if (pathname === "/ops/admin" || pathname.startsWith("/ops/admin/")) return "launch_room";
  if (pathname === "/ops" || pathname.startsWith("/ops/")) return "operations";
  if (pathname === "/today" || pathname.startsWith("/today/")) return "today";
  if (pathname.startsWith("/account")) return "admin";
  return "other";
}

function roleLabelFor(role: HelpAssistantSafeContext["internalRole"]) {
  if (role === "owner" || role === "admin") return "Owner / Admin";
  if (role === "office") return "Dispatcher / Office";
  if (role === "tech") return "Technician / Field User";
  if (role === "billing") return "Billing / AR";
  return "Unknown role";
}

export function buildHelpAssistantSafeContext(input: {
  pathname?: string | null;
  internalRole?: InternalRole | string | null;
  isAccountOwner?: boolean | null;
  productMode?: ProductMode | string | null;
  canViewFinancialRegister?: boolean | null;
  canCollectFieldPayment?: boolean | null;
}): HelpAssistantSafeContext {
  const pathname = cleanPathname(input.pathname);
  const rawRole = String(input.internalRole ?? "").trim().toLowerCase();
  const internalRole =
    input.isAccountOwner === true
      ? "owner"
      : rawRole === "admin" || rawRole === "office" || rawRole === "tech" || rawRole === "billing"
        ? rawRole
        : "unknown";
  const rawProductMode = String(input.productMode ?? "").trim().toLowerCase();
  const productMode =
    rawProductMode === "hybrid"
    || rawProductMode === "ecc_hers"
    || rawProductMode === "hvac_service"
    || rawProductMode === "cleaning_services"
      ? rawProductMode
      : "unknown";

  return {
    pathname,
    pageFamily: inferHelpAssistantPageFamily(pathname),
    internalRole,
    roleLabel: roleLabelFor(internalRole),
    productMode,
    canViewFinancialRegister: input.canViewFinancialRegister === true,
    canCollectFieldPayment: input.canCollectFieldPayment === true,
  };
}
