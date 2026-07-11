import Link from "next/link";
import { redirect } from "next/navigation";

import {
  acceptAccountWorkshareInviteFromForm,
  createAccountWorkshareInviteFromForm,
  disableAccountWorkshareConnectionFromForm,
  revokeAccountWorkshareConnectionFromForm,
} from "@/lib/workflows/account-workshare-connections-actions";
import {
  listAccountWorkshareConnectionsForAccount,
  type AccountWorkshareConnectionRow,
} from "@/lib/workflows/account-workshare-connections-read";
import { resolveInternalBusinessIdentityByAccountOwnerId } from "@/lib/business/internal-business-profile";
import {
  isInternalAccessError,
  requireInternalRole,
} from "@/lib/auth/internal-user";
import { resolveInternalAccessErrorRedirectPath } from "@/lib/auth/internal-access-redirect";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getRequestUser } from "@/lib/auth/request-identity";

export const metadata = {
  title: "ECC/HERS Partner Network",
  description: "Trusted company-to-company connections for ECC/HERS work sharing.",
};

type SearchParams = Promise<{ notice?: string }>;

const NOTICE_TEXT: Record<string, { tone: "success" | "warn" | "error"; message: string }> = {
  workshare_connection_invited: { tone: "success", message: "Connection invite created." },
  workshare_connection_accepted: { tone: "success", message: "Connection invite accepted." },
  workshare_connection_disabled: { tone: "warn", message: "Connection disabled." },
  workshare_connection_revoked: { tone: "warn", message: "Connection revoked." },
  workshare_connection_error: { tone: "error", message: "Could not update the connection. Please try again." },
};

function bannerClass(tone: "success" | "warn" | "error") {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

async function requireAdminOrRedirect() {
  const supabase = await createClient();
  const user = await getRequestUser();

  if (!user) redirect("/login");

  try {
    const authz = await requireInternalRole("admin", { supabase, userId: user.id });
    return { supabase, userId: user.id, internalUser: authz.internalUser };
  } catch (error) {
    if (isInternalAccessError(error)) {
      redirect(
        await resolveInternalAccessErrorRedirectPath({
          supabase,
          user,
          fallbackPath: "/ops",
        }),
      );
    }

    throw error;
  }
}

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function formatConnectedDate(value: string | null) {
  const normalized = cleanString(value);
  if (!normalized) return null;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function initialsFor(name: string) {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

// From the current account's perspective, resolve the partner account id for a
// directional workshare connection (sender -> receiver). For a not-yet-accepted
// email invite the sender may be null, so fall back to invite metadata for display.
function partnerAccountId(connection: AccountWorkshareConnectionRow, currentAccountOwnerUserId: string) {
  if (connection.receiver_account_id === currentAccountOwnerUserId) {
    return connection.sender_account_id;
  }
  return connection.receiver_account_id;
}

function directionLabel(connection: AccountWorkshareConnectionRow, currentAccountOwnerUserId: string) {
  return connection.receiver_account_id === currentAccountOwnerUserId
    ? "They send ECC/HERS requests to you"
    : "You send ECC/HERS requests to them";
}

function ManageDisclosure({
  connection,
  currentAccountOwnerUserId,
}: {
  connection: AccountWorkshareConnectionRow;
  currentAccountOwnerUserId: string;
}) {
  const isReceiver = connection.receiver_account_id === currentAccountOwnerUserId;

  return (
    <details className="group">
      <summary className="cursor-pointer list-none rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
        Manage
      </summary>
      <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Connection ID</div>
          <div className="mt-1 break-all font-mono text-xs text-slate-800">{connection.id}</div>
        </div>
        <p className="text-xs leading-5 text-slate-600">
          Removing a connection stops future ECC/HERS requests between these accounts. It does not change jobs, customers, or past requests.
        </p>
        <div className="flex flex-wrap gap-2">
          {isReceiver ? (
            <form action={disableAccountWorkshareConnectionFromForm}>
              <input type="hidden" name="connection_id" value={connection.id} />
              <button
                type="submit"
                className="inline-flex min-h-9 items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50"
              >
                Disable connection
              </button>
            </form>
          ) : null}
          <form action={revokeAccountWorkshareConnectionFromForm}>
            <input type="hidden" name="connection_id" value={connection.id} />
            <button
              type="submit"
              className="inline-flex min-h-9 items-center rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50"
            >
              Remove connection
            </button>
          </form>
        </div>
      </div>
    </details>
  );
}

function ConnectedRow({
  connection,
  partnerName,
  currentAccountOwnerUserId,
}: {
  connection: AccountWorkshareConnectionRow;
  partnerName: string;
  currentAccountOwnerUserId: string;
}) {
  const connectedDate = formatConnectedDate(connection.accepted_at ?? connection.created_at);

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700">
          {initialsFor(partnerName)}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-950">{partnerName}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
              <span aria-hidden="true">&#10003;</span> Connected
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-600">
            {directionLabel(connection, currentAccountOwnerUserId)}
            {connectedDate ? ` · connected ${connectedDate}` : ""}
          </div>
        </div>
      </div>
      <ManageDisclosure connection={connection} currentAccountOwnerUserId={currentAccountOwnerUserId} />
    </div>
  );
}

export default async function AdminConnectionsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const sp = (searchParams ? await searchParams : {}) ?? {};
  const notice = NOTICE_TEXT[cleanString(sp.notice).toLowerCase()];

  const { supabase, internalUser } = await requireAdminOrRedirect();
  const accountOwnerUserId = internalUser.account_owner_user_id;

  const connections = await listAccountWorkshareConnectionsForAccount(supabase, accountOwnerUserId, {
    serviceType: "ecc_hers",
    limit: 200,
  });

  const active = connections.filter((connection) => connection.status === "active");
  const pending = connections.filter((connection) => connection.status === "pending");
  // Pending where this account is the invited sender -> this account accepts.
  const pendingToAccept = pending.filter((connection) => connection.sender_account_id === accountOwnerUserId);
  // Pending where this account invited a sender -> awaiting the other side.
  const pendingAwaiting = pending.filter((connection) => connection.receiver_account_id === accountOwnerUserId);

  // Partner display names live in each partner's own RLS-scoped internal_business_profiles,
  // so resolve them with the service-role client (same pattern as the incoming request queue).
  const partnerIds = Array.from(
    new Set(
      [...active, ...pendingToAccept]
        .map((connection) => cleanString(partnerAccountId(connection, accountOwnerUserId)))
        .filter(Boolean),
    ),
  );
  const partnerNameById = new Map<string, string>();
  if (partnerIds.length > 0) {
    const admin = createAdminClient();
    const resolved = await Promise.all(
      partnerIds.map(async (partnerId) => {
        const identity = await resolveInternalBusinessIdentityByAccountOwnerId({
          accountOwnerUserId: partnerId,
          supabase: admin,
        });
        return [partnerId, identity.display_name] as const;
      }),
    );
    for (const [partnerId, displayName] of resolved) {
      partnerNameById.set(partnerId, displayName);
    }
  }

  function resolvePartnerName(connection: AccountWorkshareConnectionRow) {
    const partnerId = cleanString(partnerAccountId(connection, accountOwnerUserId));
    return (
      partnerNameById.get(partnerId)
      || cleanString(connection.invite_company_name)
      || cleanString(connection.invite_email)
      || "Connected company"
    );
  }

  const linkButtonClass =
    "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition-[background-color,border-color,transform] hover:border-slate-400 hover:bg-slate-50 active:translate-y-[0.5px]";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 text-gray-900 sm:p-6">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_55%,rgba(236,253,245,0.56))] p-6 shadow-[0_28px_60px_-36px_rgba(15,23,42,0.28)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Admin Center</p>
            <h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-slate-950">ECC/HERS Partner Network</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              Trusted company-to-company connections for ECC/HERS work sharing.
            </p>
          </div>
          <Link href="/ops/admin" className={linkButtonClass}>
            Admin Center
          </Link>
        </div>
      </div>

      {notice ? (
        <div className={`rounded-2xl border px-4 py-3 text-sm shadow-sm ${bannerClass(notice.tone)}`}>
          {notice.message}
        </div>
      ) : null}

      <section
        id="ecc-hers-connections"
        className="scroll-mt-24 rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_42px_-32px_rgba(15,23,42,0.26)]"
      >
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">ECC/HERS Connections</p>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-slate-950">Who you can send &amp; receive with</h2>
          <p className="text-sm leading-6 text-slate-600">
            Trusted company-to-company connections for ECC/HERS handoffs.
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {active.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center text-sm leading-6 text-slate-600">
              No connected accounts yet. Send an invite below to get started.
            </div>
          ) : (
            active.map((connection) => (
              <ConnectedRow
                key={connection.id}
                connection={connection}
                partnerName={resolvePartnerName(connection)}
                currentAccountOwnerUserId={accountOwnerUserId}
              />
            ))
          )}
        </div>

        <div className="mt-8 border-t border-slate-100 pt-6">
          <h3 className="text-sm font-semibold text-slate-900">Connect an account</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Connecting only creates the link — it doesn&apos;t share jobs or create requests on its own.
          </p>

          <details className="group mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 transition-colors hover:text-slate-700 [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="transition-transform group-open:rotate-90">&gt;</span>
                Connect using Account ID · advanced
              </span>
            </summary>

            <form action={createAccountWorkshareInviteFromForm} className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="text-sm font-semibold text-slate-900">Invite contractor account</div>
              <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                This only creates a connection invite. It does not share jobs, create portal users, or create ECC/HERS requests.
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-600">
                <div className="font-semibold text-slate-800">This account ID</div>
                <div className="mt-1 break-all font-mono text-slate-900">{accountOwnerUserId}</div>
                <div className="mt-1">Do not paste this ID into the contractor sender account ID field below.</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="workshare-sender-account-id" className="text-sm font-medium text-slate-700">
                    Contractor sender account ID
                  </label>
                  <input
                    id="workshare-sender-account-id"
                    name="sender_account_id"
                    required
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                    placeholder="Known contractor account ID"
                  />
                  <p className="text-xs leading-5 text-slate-500">
                    Enter the contractor account ID, not this rater account ID.
                    Use the contractor account owner ID. Do not use an individual employee user ID unless that user owns the account.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="workshare-invite-company" className="text-sm font-medium text-slate-700">
                    Company name (optional)
                  </label>
                  <input
                    id="workshare-invite-company"
                    name="invite_company_name"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
                    placeholder="Contractor company"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex min-h-10 items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-[background-color,box-shadow,transform] hover:bg-slate-800"
                >
                  Create connection invite
                </button>
              </div>
            </form>
          </details>
        </div>

        <div className="mt-8 border-t border-slate-100 pt-6">
          <h3 className="text-sm font-semibold text-slate-900">Pending invites</h3>
          {pendingToAccept.length === 0 && pendingAwaiting.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No pending invites.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {pendingToAccept.map((connection) => (
                <div
                  key={connection.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-950">{resolvePartnerName(connection)}</div>
                    <div className="mt-1 text-xs text-slate-600">
                      This rater account invited you to send ECC/HERS requests to them.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={acceptAccountWorkshareInviteFromForm}>
                      <input type="hidden" name="connection_id" value={connection.id} />
                      <button
                        type="submit"
                        className="inline-flex min-h-9 items-center rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
                      >
                        Accept
                      </button>
                    </form>
                    <form action={revokeAccountWorkshareConnectionFromForm}>
                      <input type="hidden" name="connection_id" value={connection.id} />
                      <button
                        type="submit"
                        className="inline-flex min-h-9 items-center rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                      >
                        Decline
                      </button>
                    </form>
                  </div>
                </div>
              ))}
              {pendingAwaiting.map((connection) => (
                <div
                  key={connection.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-950">
                      {cleanString(connection.invite_company_name)
                        || cleanString(connection.invite_email)
                        || cleanString(connection.sender_account_id)
                        || "Invited contractor"}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">Awaiting acceptance by the invited account.</div>
                  </div>
                  <form action={revokeAccountWorkshareConnectionFromForm}>
                    <input type="hidden" name="connection_id" value={connection.id} />
                    <button
                      type="submit"
                      className="inline-flex min-h-9 items-center rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                    >
                      Cancel invite
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
