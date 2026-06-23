import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalRoleMock = vi.fn();
const loadScopedActiveInternalContractorForMutationMock = vi.fn();
const sendInviteEmailMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalRole: (...args: unknown[]) => requireInternalRoleMock(...args),
}));

vi.mock("@/lib/auth/internal-contractor-scope", () => ({
  loadScopedActiveInternalContractorForMutation: (...args: unknown[]) =>
    loadScopedActiveInternalContractorForMutationMock(...args),
}));

vi.mock("@/lib/email/smtp", () => ({
  sendInviteEmail: (...args: unknown[]) => sendInviteEmailMock(...args),
}));

type InviteRow = {
  id: string;
  owner_user_id: string;
  contractor_id: string;
  email: string;
  invited_by: string;
  status: string;
  sent_count: number;
  last_sent_at: string | null;
  auth_user_id: string | null;
  created_at: string;
};

function actorAuth() {
  return {
    internalUser: {
      user_id: "actor-1",
      role: "admin",
      is_active: true,
      account_owner_user_id: "owner-1",
      created_by: null,
    },
  };
}

function authUser() {
  return {
    data: { user: { id: "actor-1" } },
    error: null,
  };
}

function contractorFormData(email = "target@example.com") {
  const formData = new FormData();
  formData.set("return_to", "/ops/admin/contractors");
  formData.set("contractor_id", "contractor-1");
  formData.set("email", email);
  return formData;
}

function buildFixture(options?: {
  existingInvites?: InviteRow[];
  createUserError?: any;
  generateLinkError?: any;
  sendEmailError?: Error;
  contractorOwner?: string | null;
  authUsers?: Array<{ id: string; email: string }>;
}) {
  const invites = [...(options?.existingInvites ?? [])];
  const writes = {
    inviteUpserts: 0,
    inviteUpdates: [] as Array<Record<string, unknown>>,
    contractorUserWrites: 0,
    createUserCalls: 0,
    generateLinkCalls: 0,
  };

  function matchingInvite(filters: Array<{ column: string; value: unknown }>) {
    const owner = String(filters.find((entry) => entry.column === "owner_user_id")?.value ?? "");
    const contractor = String(filters.find((entry) => entry.column === "contractor_id")?.value ?? "");
    const email = String(filters.find((entry) => entry.column === "email")?.value ?? "").toLowerCase();
    const status = String(filters.find((entry) => entry.column === "status")?.value ?? "");

    return invites.find((invite) => {
      if (owner && invite.owner_user_id !== owner) return false;
      if (contractor && invite.contractor_id !== contractor) return false;
      if (email && invite.email !== email) return false;
      if (status && invite.status !== status) return false;
      return true;
    }) ?? null;
  }

  const supabase = {
    auth: {
      getUser: vi.fn(async () => authUser()),
    },
    from(table: string) {
      if (table === "contractors") {
        const filters: Array<{ column: string; value: unknown }> = [];
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn((column: string, value: unknown) => {
            filters.push({ column, value });
            return query;
          }),
          maybeSingle: vi.fn(async () => {
            const id = String(filters.find((entry) => entry.column === "id")?.value ?? "");
            const owner = String(filters.find((entry) => entry.column === "owner_user_id")?.value ?? "");
            const actualOwner = options?.contractorOwner ?? "owner-1";
            return {
              data: id === "contractor-1" && owner === actualOwner ? { id, owner_user_id: actualOwner } : null,
              error: null,
            };
          }),
        };
        return query;
      }

      if (table === "contractor_invites") {
        const filters: Array<{ column: string; value: unknown }> = [];
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn((column: string, value: unknown) => {
            filters.push({ column, value });
            return query;
          }),
          maybeSingle: vi.fn(async () => ({ data: matchingInvite(filters), error: null })),
        };

        return {
          ...query,
          upsert: vi.fn((payload: any) => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                writes.inviteUpserts += 1;
                const existing = invites.find(
                  (invite) =>
                    invite.owner_user_id === payload.owner_user_id &&
                    invite.contractor_id === payload.contractor_id &&
                    invite.email === payload.email,
                );
                if (existing) {
                  Object.assign(existing, payload);
                  return { data: existing, error: null };
                }
                const inserted: InviteRow = {
                  id: "invite-1",
                  sent_count: 0,
                  last_sent_at: null,
                  auth_user_id: null,
                  created_at: "2026-06-20T12:00:00.000Z",
                  ...payload,
                };
                invites.push(inserted);
                return { data: inserted, error: null };
              }),
            })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => ({
            eq: vi.fn((column: string, value: unknown) => {
              filters.push({ column, value });
              return {
                eq: vi.fn((column2: string, value2: unknown) => {
                  filters.push({ column: column2, value: value2 });
                  return {
                    eq: vi.fn((column3: string, value3: unknown) => {
                      filters.push({ column: column3, value: value3 });
                      applyInviteUpdate(payload, filters);
                      return Promise.resolve({ error: null });
                    }),
                    then: (onFulfilled: (value: any) => unknown, onRejected?: (reason: unknown) => unknown) =>
                      Promise.resolve(applyInviteUpdate(payload, filters)).then(onFulfilled, onRejected),
                  };
                }),
                then: (onFulfilled: (value: any) => unknown, onRejected?: (reason: unknown) => unknown) =>
                  Promise.resolve(applyInviteUpdate(payload, filters)).then(onFulfilled, onRejected),
              };
            }),
          })),
        };
      }

      if (table === "profiles") {
        const filters: Array<{ column: string; value: unknown }> = [];
        const query: any = {
          select: vi.fn(() => query),
          ilike: vi.fn((column: string, value: unknown) => {
            filters.push({ column, value });
            return query;
          }),
          limit: vi.fn(() => query),
          maybeSingle: vi.fn(async () => {
            const email = String(filters.find((entry) => entry.column === "email")?.value ?? "").toLowerCase();
            const hit = (options?.authUsers ?? []).find((user) => user.email === email);
            return { data: hit ? { id: hit.id, email: hit.email } : null, error: null };
          }),
        };
        return query;
      }

      if (table === "contractor_users") {
        writes.contractorUserWrites += 1;
        throw new Error("contractor_users should not be written by invite/resend");
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    _invites: invites,
    _writes: writes,
  };

  function applyInviteUpdate(payload: Record<string, unknown>, filters: Array<{ column: string; value: unknown }>) {
    writes.inviteUpdates.push(payload);
    const id = String(filters.find((entry) => entry.column === "id")?.value ?? "");
    const owner = String(filters.find((entry) => entry.column === "owner_user_id")?.value ?? "");
    for (const invite of invites) {
      if (id && invite.id !== id) continue;
      if (owner && invite.owner_user_id !== owner) continue;
      Object.assign(invite, payload);
    }
    return { error: null };
  }

  const admin = {
    auth: {
      admin: {
        createUser: vi.fn(async () => {
          writes.createUserCalls += 1;
          if (options?.createUserError) {
            return { data: null, error: options.createUserError };
          }
          return { data: { user: { id: "auth-user-1" } }, error: null };
        }),
        generateLink: vi.fn(async () => {
          writes.generateLinkCalls += 1;
          if (options?.generateLinkError) {
            return { data: null, error: options.generateLinkError };
          }
          return { data: { properties: { action_link: "https://example.com/setup" } }, error: null };
        }),
        listUsers: vi.fn(async () => ({
          data: { users: options?.authUsers ?? [] },
          error: null,
        })),
      },
    },
    from: supabase.from.bind(supabase),
  };

  if (options?.sendEmailError) {
    sendInviteEmailMock.mockRejectedValueOnce(options.sendEmailError);
  }

  return { supabase, admin, invites, writes };
}

describe("contractor invite delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    requireInternalRoleMock.mockResolvedValue(actorAuth());
    loadScopedActiveInternalContractorForMutationMock.mockResolvedValue({ id: "contractor-1" });
    sendInviteEmailMock.mockResolvedValue(undefined);
  });

  it("sends a fresh contractor invite and records delivery metadata", async () => {
    const fixture = buildFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/contractor-invite-actions");
    await expect(mod.inviteContractor({ contractorId: "contractor-1", email: "target@example.com" })).resolves.toMatchObject({
      ok: true,
    });

    expect(sendInviteEmailMock).toHaveBeenCalledTimes(1);
    expect(fixture.invites[0]).toMatchObject({
      status: "pending",
      sent_count: 1,
      auth_user_id: "auth-user-1",
    });
    expect(fixture.writes.contractorUserWrites).toBe(0);
  });

  it("marks a new invite expired and surfaces failure when email delivery fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fixture = buildFixture({ sendEmailError: new Error("Missing RESEND_API_KEY") });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/admin-user-actions");
    await expect(mod.inviteContractorUserFromForm(contractorFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/contractors?notice=invite_failed",
    );

    expect(fixture.invites[0]).toMatchObject({ status: "expired" });
    expect(fixture.invites[0].sent_count).toBe(0);
    warnSpy.mockRestore();
  });

  it("uses the existing-auth setup link fallback for contractor invites", async () => {
    const fixture = buildFixture({
      createUserError: { message: "User already registered" },
      authUsers: [{ id: "existing-auth-user", email: "target@example.com" }],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/contractor-invite-actions");
    await expect(mod.inviteContractor({ contractorId: "contractor-1", email: "target@example.com" })).resolves.toMatchObject({
      ok: true,
    });

    expect(fixture.invites[0]).toMatchObject({
      status: "pending",
      auth_user_id: "existing-auth-user",
      sent_count: 1,
    });
    expect(sendInviteEmailMock).toHaveBeenCalledTimes(1);
  });

  it("additional contractor user invite redirects with visible success after delivery", async () => {
    const fixture = buildFixture();
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/admin-user-actions");
    await expect(mod.inviteContractorUserFromForm(contractorFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/contractors?notice=invite_sent",
    );

    expect(sendInviteEmailMock).toHaveBeenCalledTimes(1);
  });

  it("resends only a pending contractor invite without writing contractor_users", async () => {
    const fixture = buildFixture({
      existingInvites: [
        {
          id: "invite-1",
          owner_user_id: "owner-1",
          contractor_id: "contractor-1",
          email: "target@example.com",
          invited_by: "actor-1",
          status: "pending",
          sent_count: 1,
          last_sent_at: "2026-06-20T12:00:00.000Z",
          auth_user_id: "auth-user-1",
          created_at: "2026-06-20T12:00:00.000Z",
        },
      ],
      createUserError: { message: "User already registered" },
      authUsers: [{ id: "auth-user-1", email: "target@example.com" }],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/admin-user-actions");
    await expect(mod.resendContractorInviteFromForm(contractorFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/contractors?notice=invite_resent",
    );

    expect(fixture.invites[0]).toMatchObject({
      status: "pending",
      sent_count: 2,
    });
    expect(fixture.writes.contractorUserWrites).toBe(0);
  });

  it("blocks resend for accepted contractor users", async () => {
    const fixture = buildFixture({
      existingInvites: [
        {
          id: "invite-1",
          owner_user_id: "owner-1",
          contractor_id: "contractor-1",
          email: "target@example.com",
          invited_by: "actor-1",
          status: "accepted",
          sent_count: 1,
          last_sent_at: "2026-06-20T12:00:00.000Z",
          auth_user_id: "auth-user-1",
          created_at: "2026-06-20T12:00:00.000Z",
        },
      ],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/admin-user-actions");
    await expect(mod.resendContractorInviteFromForm(contractorFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/contractors?notice=invite_not_pending",
    );

    expect(sendInviteEmailMock).not.toHaveBeenCalled();
    expect(fixture.writes.contractorUserWrites).toBe(0);
  });

  it("does not resend an accepted contractor invite through direct invite issuance", async () => {
    const fixture = buildFixture({
      existingInvites: [
        {
          id: "invite-1",
          owner_user_id: "owner-1",
          contractor_id: "contractor-1",
          email: "target@example.com",
          invited_by: "actor-1",
          status: "accepted",
          sent_count: 1,
          last_sent_at: "2026-06-20T12:00:00.000Z",
          auth_user_id: "auth-user-1",
          created_at: "2026-06-20T12:00:00.000Z",
        },
      ],
    });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/contractor-invite-actions");
    await expect(mod.inviteContractor({ contractorId: "contractor-1", email: "target@example.com" })).rejects.toThrow(
      "CONTRACTOR_INVITE_ALREADY_ACCEPTED",
    );

    expect(sendInviteEmailMock).not.toHaveBeenCalled();
    expect(fixture.writes.inviteUpserts).toBe(0);
    expect(fixture.writes.inviteUpdates).toHaveLength(0);
    expect(fixture.writes.contractorUserWrites).toBe(0);
  });

  it("blocks cross-account contractor resend before email side effects", async () => {
    const fixture = buildFixture({ contractorOwner: "owner-2" });
    createClientMock.mockResolvedValue(fixture.supabase);
    createAdminClientMock.mockReturnValue(fixture.admin);

    const mod = await import("@/lib/actions/admin-user-actions");
    await expect(mod.resendContractorInviteFromForm(contractorFormData())).rejects.toThrow(
      "REDIRECT:/ops/admin/contractors",
    );

    expect(sendInviteEmailMock).not.toHaveBeenCalled();
  });
});
