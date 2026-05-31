import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const requireInternalUserMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
  createAdminClient: (...args: unknown[]) => createAdminClientMock(...args),
}));

vi.mock("@/lib/auth/internal-user", () => ({
  requireInternalUser: (...args: unknown[]) => requireInternalUserMock(...args),
  isInternalAccessError: (error: unknown) =>
    Boolean(error)
      && typeof error === "object"
      && (error as any).name === "InternalAccessError",
}));

type MockServiceCase = {
  id: string;
  customer_id: string;
};

type MockCustomer = {
  id: string;
  owner_user_id: string;
};

type MockPreset = {
  id: string;
  account_owner_user_id: string;
  template_name: string;
  lifecycle_status: string;
  milestone_definition_json: unknown;
  updated_at?: string | null;
};

type MockWorkflowInstance = {
  id: string;
  account_owner_user_id: string;
  service_case_id: string;
  workflow_preset_template_id: string | null;
  workflow_status: string;
};

type MockWorkflowMilestone = {
  id: string;
  account_owner_user_id: string;
  workflow_instance_id: string;
  milestone_key?: string | null;
  milestone_title?: string | null;
  milestone_status?: string;
  status_reason?: string | null;
  updated_by_user_id?: string | null;
};

type MockWorkflowJobLink = {
  id: string;
  account_owner_user_id: string;
  workflow_instance_id: string;
  workflow_instance_milestone_id?: string | null;
  job_id?: string | null;
  link_role?: string | null;
  is_primary?: boolean;
};

type MockJob = {
  id: string;
  customer_id: string;
  service_case_id: string | null;
  job_type?: string | null;
  deleted_at?: string | null;
  job_display_number?: string | null;
  status?: string | null;
  field_complete?: boolean;
};

type MockAuthorizedHandoffRecipient = {
  id: string;
  account_owner_user_id: string;
  recipient_type: string;
  handoff_kind: string;
  display_name: string;
  internal_user_id?: string | null;
  external_company_name?: string | null;
  external_contact_name?: string | null;
  external_email?: string | null;
  external_phone?: string | null;
  connected_account_owner_user_id?: string | null;
  is_default?: boolean;
  is_active?: boolean;
  notes?: string | null;
  created_by_user_id?: string | null;
  updated_by_user_id?: string | null;
  created_at?: string;
  updated_at?: string;
  archived_at?: string | null;
};

type MockWorkflowHandoffRequest = {
  id: string;
  installer_account_owner_user_id: string;
  workflow_instance_id: string;
  workflow_instance_milestone_id: string;
  service_case_id: string;
  source_job_id?: string | null;
  authorized_handoff_recipient_id: string;
  recipient_type_snapshot: string;
  recipient_display_name_snapshot: string;
  handoff_kind: string;
  handoff_status: string;
  sent_by_user_id: string;
  sent_at?: string;
  created_at?: string;
  responded_by_user_id?: string | null;
  responded_at?: string | null;
  response_note?: string | null;
  evidence_reference?: string | null;
  updated_at?: string | null;
};

function makeThenable<T>(
  resolver: () => T,
  chainMethods: Record<string, (...args: unknown[]) => any>,
) {
  const query: any = {
    ...chainMethods,
    then: (resolve: (value: T) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(resolver()).then(resolve, reject),
  };
  return query;
}

function makeAdminFixture(input?: {
  serviceCases?: MockServiceCase[];
  customers?: MockCustomer[];
  presets?: MockPreset[];
  workflowInstances?: MockWorkflowInstance[];
  workflowMilestones?: MockWorkflowMilestone[];
  workflowJobLinks?: MockWorkflowJobLink[];
  jobs?: MockJob[];
  authorizedHandoffRecipients?: MockAuthorizedHandoffRecipient[];
  workflowHandoffRequests?: MockWorkflowHandoffRequest[];
}) {
  const serviceCases = [...(input?.serviceCases ?? [])];
  const customers = [...(input?.customers ?? [])];
  const presets = [...(input?.presets ?? [])];
  const workflowInstances = [...(input?.workflowInstances ?? [])];
  const workflowMilestones = [...(input?.workflowMilestones ?? [])];
  const workflowJobLinks = [...(input?.workflowJobLinks ?? [])];
  const jobs = [...(input?.jobs ?? [])];
  const authorizedHandoffRecipients = [...(input?.authorizedHandoffRecipients ?? [])];
  const workflowHandoffRequests = [...(input?.workflowHandoffRequests ?? [])];

  const tableCalls: string[] = [];
  const workflowInstanceInsertCalls: Array<Record<string, unknown>> = [];
  const workflowMilestoneInsertCalls: Array<Array<Record<string, unknown>>> = [];
  const workflowMilestoneUpdateCalls: Array<Record<string, unknown>> = [];
  const workflowJobLinkInsertCalls: Array<Array<Record<string, unknown>>> = [];
  const workflowHandoffRequestInsertCalls: Array<Record<string, unknown>> = [];
  const workflowHandoffRequestUpdateCalls: Array<Record<string, unknown>> = [];

  const admin = {
    from: vi.fn((table: string) => {
      tableCalls.push(table);

      if (table === "service_cases") {
        let whereId = "";
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: unknown) => {
              if (column === "id") whereId = String(value ?? "").trim();
              return {
                maybeSingle: vi.fn(async () => ({
                  data: serviceCases.find((row) => row.id === whereId) ?? null,
                  error: null,
                })),
              };
            }),
          })),
        };
      }

      if (table === "customers") {
        let whereId = "";
        let whereOwnerId = "";

        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: unknown) => {
              if (column === "id") whereId = String(value ?? "").trim();
              if (column === "owner_user_id") whereOwnerId = String(value ?? "").trim();
              return {
                eq: vi.fn((nextColumn: string, nextValue: unknown) => {
                  if (nextColumn === "owner_user_id") {
                    whereOwnerId = String(nextValue ?? "").trim();
                  }
                  return {
                    maybeSingle: vi.fn(async () => ({
                      data:
                        customers.find(
                          (row) => row.id === whereId && row.owner_user_id === whereOwnerId,
                        ) ?? null,
                      error: null,
                    })),
                  };
                }),
                maybeSingle: vi.fn(async () => ({
                  data:
                    customers.find(
                      (row) => row.id === whereId && row.owner_user_id === whereOwnerId,
                    ) ?? null,
                  error: null,
                })),
              };
            }),
          })),
        };
      }

      if (table === "workflow_preset_templates") {
        const select = vi.fn(() => {
          let whereId = "";
          let ownerId = "";
          let templateName = "";
          let lifecycleStatus = "";
          let limit = 100;

          const query: any = {
            eq: (column: string, value: unknown) => {
              if (column === "id") whereId = String(value ?? "").trim();
              if (column === "account_owner_user_id") ownerId = String(value ?? "").trim();
              if (column === "template_name") templateName = String(value ?? "").trim();
              if (column === "lifecycle_status") lifecycleStatus = String(value ?? "").trim();
              return query;
            },
            order: () => query,
            limit: (value: unknown) => {
              limit = Number(value ?? 100);
              return query;
            },
            maybeSingle: async () => {
              const row = presets.find((entry) => {
                if (whereId && entry.id !== whereId) return false;
                if (ownerId && entry.account_owner_user_id !== ownerId) return false;
                if (templateName && entry.template_name !== templateName) return false;
                if (lifecycleStatus && entry.lifecycle_status !== lifecycleStatus) return false;
                return true;
              });

              return {
                data: row ?? null,
                error: null,
              };
            },
            then: (resolve: (value: { data: Array<{ id: string }>; error: null }) => unknown, reject?: (reason: unknown) => unknown) => {
              const rows = presets
                .filter((entry) => (whereId ? entry.id === whereId : true))
                .filter((entry) => (ownerId ? entry.account_owner_user_id === ownerId : true))
                .filter((entry) => (templateName ? entry.template_name === templateName : true))
                .filter((entry) => (lifecycleStatus ? entry.lifecycle_status === lifecycleStatus : true))
                .slice(0, limit)
                .map((entry) => ({ id: entry.id }));

              return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
            },
          };

          return query;
        });

        const insert = vi.fn((payload: Record<string, unknown>) => {
          const id = `tpl-${presets.length + 1}`;
          presets.push({
            id,
            account_owner_user_id: String(payload.account_owner_user_id ?? "").trim(),
            template_name: String(payload.template_name ?? "").trim(),
            lifecycle_status: String(payload.lifecycle_status ?? "active").trim(),
            milestone_definition_json: payload.milestone_definition_json ?? [],
            updated_at: null,
          });

          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id }, error: null })),
            })),
          };
        });

        return {
          select,
          insert,
        };
      }

      if (table === "workflow_instances") {
        const select = vi.fn(() => {
          let id = "";
          let ownerId = "";
          let serviceCaseId = "";
          let templateId = "";
          let statuses: string[] = [];
          let limit = 100;

          const query: any = {
            eq: (column: unknown, value: unknown) => {
              if (column === "id") {
                id = String(value ?? "").trim();
              }
              if (column === "account_owner_user_id") {
                ownerId = String(value ?? "").trim();
              }
              if (column === "service_case_id") {
                serviceCaseId = String(value ?? "").trim();
              }
              if (column === "workflow_preset_template_id") {
                templateId = String(value ?? "").trim();
              }
              return query;
            },
            in: (column: unknown, value: unknown) => {
              if (column === "workflow_status" && Array.isArray(value)) {
                statuses = value.map((entry) => String(entry ?? "").trim());
              }
              return query;
            },
            order: () => query,
            limit: (value: unknown) => {
              limit = Number(value ?? 100);
              return query;
            },
            maybeSingle: async () => {
              const row = workflowInstances.find((entry) => {
                if (id && entry.id !== id) return false;
                if (ownerId && entry.account_owner_user_id !== ownerId) return false;
                if (serviceCaseId && entry.service_case_id !== serviceCaseId) return false;
                if (templateId && entry.workflow_preset_template_id !== templateId) return false;
                if (statuses.length > 0 && !statuses.includes(entry.workflow_status)) return false;
                return true;
              });

              return {
                data: row ?? null,
                error: null,
              };
            },
            then: (resolve: (value: { data: Array<{ id: string }>; error: null }) => unknown, reject?: (reason: unknown) => unknown) => {
              const rows = workflowInstances
                .filter((row) => (id ? row.id === id : true))
                .filter((row) => (ownerId ? row.account_owner_user_id === ownerId : true))
                .filter((row) => (serviceCaseId ? row.service_case_id === serviceCaseId : true))
                .filter((row) => (templateId ? row.workflow_preset_template_id === templateId : true))
                .filter((row) => (statuses.length > 0 ? statuses.includes(row.workflow_status) : true))
                .slice(0, limit)
                .map((row) => ({ id: row.id }));

              return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
            },
          };

          return query;
        });

        const insert = vi.fn((payload: Record<string, unknown>) => {
          workflowInstanceInsertCalls.push(payload);

          const id = `wf-${workflowInstances.length + 1}`;
          workflowInstances.push({
            id,
            account_owner_user_id: String(payload.account_owner_user_id ?? "").trim(),
            service_case_id: String(payload.service_case_id ?? "").trim(),
            workflow_preset_template_id: String(payload.workflow_preset_template_id ?? "").trim() || null,
            workflow_status: String(payload.workflow_status ?? "active").trim(),
          });

          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id }, error: null })),
            })),
          };
        });

        return {
          select,
          insert,
        };
      }

      if (table === "workflow_instance_milestones") {
        const select = vi.fn((_columns: string, options?: { count?: string; head?: boolean }) => {
          let milestoneId = "";
          let ownerId = "";
          let workflowInstanceId = "";

          const query: any = makeThenable(
            () => {
              const scoped = workflowMilestones.filter(
                (row) =>
                  (!milestoneId || row.id === milestoneId)
                  &&
                  (!ownerId || row.account_owner_user_id === ownerId)
                  && (!workflowInstanceId || row.workflow_instance_id === workflowInstanceId),
              );

              if (options?.head) {
                return { data: null, error: null, count: scoped.length };
              }

              return { data: scoped, error: null };
            },
            {
              eq: (column: unknown, value: unknown) => {
                if (column === "id") {
                  milestoneId = String(value ?? "").trim();
                }
                if (column === "account_owner_user_id") {
                  ownerId = String(value ?? "").trim();
                }
                if (column === "workflow_instance_id") {
                  workflowInstanceId = String(value ?? "").trim();
                }
                return query;
              },
              maybeSingle: async () => {
                const row = workflowMilestones.find(
                  (entry) =>
                    (!milestoneId || entry.id === milestoneId)
                    && (!ownerId || entry.account_owner_user_id === ownerId)
                    && (!workflowInstanceId || entry.workflow_instance_id === workflowInstanceId),
                );

                return {
                  data: row ?? null,
                  error: null,
                };
              },
            },
          );

          return query;
        });

        const insert = vi.fn((payload: Array<Record<string, unknown>>) => {
          workflowMilestoneInsertCalls.push(payload);
          for (const row of payload) {
            workflowMilestones.push({
              id: `ms-${workflowMilestones.length + 1}`,
              account_owner_user_id: String(row.account_owner_user_id ?? "").trim(),
              workflow_instance_id: String(row.workflow_instance_id ?? "").trim(),
              milestone_key: String(row.milestone_key ?? "").trim() || null,
              milestone_title: String(row.milestone_title ?? "").trim() || null,
              milestone_status: String(row.milestone_status ?? "planned").trim() || "planned",
              status_reason: (row.status_reason as string | null | undefined) ?? null,
              updated_by_user_id: String(row.updated_by_user_id ?? "").trim() || null,
            });
          }

          return Promise.resolve({ error: null });
        });

        const update = vi.fn((payload: Record<string, unknown>) => {
          workflowMilestoneUpdateCalls.push(payload);

          let milestoneId = "";
          let ownerId = "";
          let workflowInstanceId = "";

          const query: any = {
            eq: (column: unknown, value: unknown) => {
              if (column === "id") milestoneId = String(value ?? "").trim();
              if (column === "account_owner_user_id") ownerId = String(value ?? "").trim();
              if (column === "workflow_instance_id") {
                workflowInstanceId = String(value ?? "").trim();
              }
              return query;
            },
            select: () => query,
            maybeSingle: async () => {
              const row = workflowMilestones.find(
                (entry) =>
                  (!milestoneId || entry.id === milestoneId)
                  && (!ownerId || entry.account_owner_user_id === ownerId)
                  && (!workflowInstanceId || entry.workflow_instance_id === workflowInstanceId),
              );

              if (!row) {
                return { data: null, error: null };
              }

              row.milestone_status = String(payload.milestone_status ?? row.milestone_status ?? "planned").trim() || "planned";
              row.status_reason = (payload.status_reason as string | null | undefined) ?? null;
              row.updated_by_user_id = String(payload.updated_by_user_id ?? row.updated_by_user_id ?? "").trim() || null;
              (row as any).updated_at = String((payload as any).updated_at ?? (row as any).updated_at ?? "").trim() || null;

              return {
                data: {
                  id: row.id,
                  milestone_status: row.milestone_status,
                },
                error: null,
              };
            },
          };

          return query;
        });

        return {
          select,
          insert,
          update,
        };
      }

      if (table === "workflow_instance_job_links") {
        const select = vi.fn((_columns: string, options?: { count?: string; head?: boolean }) => {
          let ownerId = "";
          let workflowInstanceId = "";
          let milestoneId = "";
          let jobId = "";

          const query: any = makeThenable(
            () => {
              const scoped = workflowJobLinks.filter(
                (row) =>
                  (!ownerId || row.account_owner_user_id === ownerId)
                  && (!workflowInstanceId || row.workflow_instance_id === workflowInstanceId)
                  && (!milestoneId || row.workflow_instance_milestone_id === milestoneId)
                  && (!jobId || row.job_id === jobId),
              );

              if (options?.head) {
                return { data: null, error: null, count: scoped.length };
              }

              return { data: scoped, error: null };
            },
            {
              eq: (column: unknown, value: unknown) => {
                if (column === "account_owner_user_id") {
                  ownerId = String(value ?? "").trim();
                }
                if (column === "workflow_instance_id") {
                  workflowInstanceId = String(value ?? "").trim();
                }
                if (column === "workflow_instance_milestone_id") {
                  milestoneId = String(value ?? "").trim();
                }
                if (column === "job_id") {
                  jobId = String(value ?? "").trim();
                }
                return query;
              },
              maybeSingle: async () => {
                const row = workflowJobLinks.find(
                  (entry) =>
                    (!ownerId || entry.account_owner_user_id === ownerId)
                    && (!workflowInstanceId || entry.workflow_instance_id === workflowInstanceId)
                    && (!milestoneId || entry.workflow_instance_milestone_id === milestoneId)
                    && (!jobId || entry.job_id === jobId),
                );

                return {
                  data: row ?? null,
                  error: null,
                };
              },
            },
          );

          return query;
        });

        const insert = vi.fn((payload: Array<Record<string, unknown>> | Record<string, unknown>) => {
          const rows = Array.isArray(payload) ? payload : [payload];
          workflowJobLinkInsertCalls.push(rows);

          const insertedIds: string[] = [];
          for (const row of rows) {
            const insertedId = `lnk-${workflowJobLinks.length + 1}`;
            insertedIds.push(insertedId);
            workflowJobLinks.push({
              id: insertedId,
              account_owner_user_id: String(row.account_owner_user_id ?? "").trim(),
              workflow_instance_id: String(row.workflow_instance_id ?? "").trim(),
              workflow_instance_milestone_id:
                String(row.workflow_instance_milestone_id ?? "").trim() || null,
              job_id: String(row.job_id ?? "").trim() || null,
              link_role: String(row.link_role ?? "supporting").trim() || "supporting",
              is_primary: Boolean(row.is_primary),
            });
          }

          return {
            select: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: insertedIds[0] ?? "" },
                error: null,
              })),
            })),
            then: (resolve: (value: { error: null }) => unknown, reject?: (reason: unknown) => unknown) =>
              Promise.resolve({ error: null }).then(resolve, reject),
          };
        });

        return {
          select,
          insert,
        };
      }

      if (table === "jobs") {
        let jobId = "";
        let includeDeleted = true;
        const query: any = {
          eq: (column: string, value: unknown) => {
            if (column === "id") {
              jobId = String(value ?? "").trim();
            }

            return query;
          },
          is: (isColumn: string, isValue: unknown) => {
            if (isColumn === "deleted_at" && isValue === null) {
              includeDeleted = false;
            }

            return query;
          },
          maybeSingle: async () => {
            const row = jobs.find((candidate) => {
              if (candidate.id !== jobId) return false;
              if (!includeDeleted && candidate.deleted_at != null) return false;
              return true;
            });

            return { data: row ?? null, error: null };
          },
        };

        return {
          select: vi.fn(() => query),
        };
      }

      if (table === "authorized_handoff_recipients") {
        const select = vi.fn(() => {
          let whereId = "";
          let ownerId = "";
          let handoffKind = "";
          let isActive: boolean | null = null;
          let archivedAtIsNull = false;
          let limit = 100;

          const query: any = makeThenable(
            () => {
              const scoped = authorizedHandoffRecipients
                .filter((row) => (whereId ? row.id === whereId : true))
                .filter((row) => (ownerId ? row.account_owner_user_id === ownerId : true))
                .filter((row) => (handoffKind ? row.handoff_kind === handoffKind : true))
                .filter((row) => (isActive == null ? true : Boolean(row.is_active) === isActive))
                .filter((row) => (archivedAtIsNull ? row.archived_at == null : true))
                .slice(0, limit)
                .map((row) => ({
                  ...row,
                  internal_user_id: row.internal_user_id ?? null,
                  external_company_name: row.external_company_name ?? null,
                  external_contact_name: row.external_contact_name ?? null,
                  external_email: row.external_email ?? null,
                  external_phone: row.external_phone ?? null,
                  connected_account_owner_user_id: row.connected_account_owner_user_id ?? null,
                  is_default: Boolean(row.is_default),
                  is_active: row.is_active == null ? true : Boolean(row.is_active),
                  notes: row.notes ?? null,
                  created_by_user_id: row.created_by_user_id ?? null,
                  updated_by_user_id: row.updated_by_user_id ?? null,
                  created_at: row.created_at ?? "2026-05-31T00:00:00.000Z",
                  updated_at: row.updated_at ?? "2026-05-31T00:00:00.000Z",
                  archived_at: row.archived_at ?? null,
                }));

              return { data: scoped, error: null };
            },
            {
              eq: (column: unknown, value: unknown) => {
                if (column === "id") whereId = String(value ?? "").trim();
                if (column === "account_owner_user_id") ownerId = String(value ?? "").trim();
                if (column === "handoff_kind") handoffKind = String(value ?? "").trim();
                if (column === "is_active") isActive = Boolean(value);
                return query;
              },
              is: (column: unknown, value: unknown) => {
                if (column === "archived_at" && value === null) archivedAtIsNull = true;
                return query;
              },
              order: () => query,
              limit: (value: unknown) => {
                limit = Number(value ?? 100);
                return query;
              },
              maybeSingle: async () => {
                const row = authorizedHandoffRecipients.find((entry) => {
                  if (whereId && entry.id !== whereId) return false;
                  if (ownerId && entry.account_owner_user_id !== ownerId) return false;
                  if (handoffKind && entry.handoff_kind !== handoffKind) return false;
                  if (isActive != null && Boolean(entry.is_active) !== isActive) return false;
                  if (archivedAtIsNull && entry.archived_at != null) return false;
                  return true;
                });

                if (!row) {
                  return { data: null, error: null };
                }

                return {
                  data: {
                    ...row,
                    internal_user_id: row.internal_user_id ?? null,
                    external_company_name: row.external_company_name ?? null,
                    external_contact_name: row.external_contact_name ?? null,
                    external_email: row.external_email ?? null,
                    external_phone: row.external_phone ?? null,
                    connected_account_owner_user_id: row.connected_account_owner_user_id ?? null,
                    is_default: Boolean(row.is_default),
                    is_active: row.is_active == null ? true : Boolean(row.is_active),
                    notes: row.notes ?? null,
                    created_by_user_id: row.created_by_user_id ?? null,
                    updated_by_user_id: row.updated_by_user_id ?? null,
                    created_at: row.created_at ?? "2026-05-31T00:00:00.000Z",
                    updated_at: row.updated_at ?? "2026-05-31T00:00:00.000Z",
                    archived_at: row.archived_at ?? null,
                  },
                  error: null,
                };
              },
            },
          );

          return query;
        });

        return {
          select,
        };
      }

      if (table === "workflow_handoff_requests") {
        const select = vi.fn(() => {
          let installerAccountOwnerUserId = "";
          let workflowInstanceId = "";
          let milestoneId = "";
          let recipientId = "";
          let statuses: string[] = [];
          let limit = 100;

          const query: any = makeThenable(
            () => {
              const scoped = workflowHandoffRequests
                .filter((row) => (
                  !installerAccountOwnerUserId || row.installer_account_owner_user_id === installerAccountOwnerUserId
                ))
                .filter((row) => (!workflowInstanceId || row.workflow_instance_id === workflowInstanceId))
                .filter((row) => (!milestoneId || row.workflow_instance_milestone_id === milestoneId))
                .filter((row) => (!recipientId || row.authorized_handoff_recipient_id === recipientId))
                .filter((row) => (statuses.length > 0 ? statuses.includes(row.handoff_status) : true))
                .slice(0, limit)
                .map((row) => ({
                  ...row,
                  source_job_id: row.source_job_id ?? null,
                  sent_at: row.sent_at ?? "2026-05-31T00:00:00.000Z",
                  responded_by_user_id: row.responded_by_user_id ?? null,
                  responded_at: row.responded_at ?? null,
                  response_note: row.response_note ?? null,
                  evidence_reference: row.evidence_reference ?? null,
                  created_at: row.created_at ?? row.sent_at ?? "2026-05-31T00:00:00.000Z",
                  updated_at: row.updated_at ?? row.created_at ?? row.sent_at ?? "2026-05-31T00:00:00.000Z",
                }));

              return { data: scoped, error: null };
            },
            {
              eq: (column: unknown, value: unknown) => {
                if (column === "installer_account_owner_user_id") {
                  installerAccountOwnerUserId = String(value ?? "").trim();
                }
                if (column === "workflow_instance_id") {
                  workflowInstanceId = String(value ?? "").trim();
                }
                if (column === "workflow_instance_milestone_id") {
                  milestoneId = String(value ?? "").trim();
                }
                if (column === "authorized_handoff_recipient_id") {
                  recipientId = String(value ?? "").trim();
                }
                return query;
              },
              in: (column: unknown, value: unknown) => {
                if (column === "handoff_status" && Array.isArray(value)) {
                  statuses = value.map((entry) => String(entry ?? "").trim());
                }
                return query;
              },
              order: () => query,
              limit: (value: unknown) => {
                limit = Number(value ?? 100);
                return query;
              },
              maybeSingle: async () => {
                const row = workflowHandoffRequests.find((entry) => {
                  if (installerAccountOwnerUserId && entry.installer_account_owner_user_id !== installerAccountOwnerUserId) return false;
                  if (workflowInstanceId && entry.workflow_instance_id !== workflowInstanceId) return false;
                  if (milestoneId && entry.workflow_instance_milestone_id !== milestoneId) return false;
                  if (recipientId && entry.authorized_handoff_recipient_id !== recipientId) return false;
                  if (statuses.length > 0 && !statuses.includes(entry.handoff_status)) return false;
                  return true;
                });

                if (!row) {
                  return { data: null, error: null };
                }

                return {
                  data: {
                    ...row,
                    source_job_id: row.source_job_id ?? null,
                    sent_at: row.sent_at ?? "2026-05-31T00:00:00.000Z",
                    responded_by_user_id: row.responded_by_user_id ?? null,
                    responded_at: row.responded_at ?? null,
                    response_note: row.response_note ?? null,
                    evidence_reference: row.evidence_reference ?? null,
                    created_at: row.created_at ?? row.sent_at ?? "2026-05-31T00:00:00.000Z",
                    updated_at: row.updated_at ?? row.created_at ?? row.sent_at ?? "2026-05-31T00:00:00.000Z",
                  },
                  error: null,
                };
              },
            },
          );

          return query;
        });

        const insert = vi.fn((payload: Record<string, unknown>) => {
          workflowHandoffRequestInsertCalls.push(payload);

          const id = `whr-${workflowHandoffRequests.length + 1}`;
          workflowHandoffRequests.push({
            id,
            installer_account_owner_user_id: String(payload.installer_account_owner_user_id ?? "").trim(),
            workflow_instance_id: String(payload.workflow_instance_id ?? "").trim(),
            workflow_instance_milestone_id: String(payload.workflow_instance_milestone_id ?? "").trim(),
            service_case_id: String(payload.service_case_id ?? "").trim(),
            source_job_id: String(payload.source_job_id ?? "").trim() || null,
            authorized_handoff_recipient_id: String(payload.authorized_handoff_recipient_id ?? "").trim(),
            recipient_type_snapshot: String(payload.recipient_type_snapshot ?? "").trim(),
            recipient_display_name_snapshot: String(payload.recipient_display_name_snapshot ?? "").trim(),
            handoff_kind: String(payload.handoff_kind ?? "").trim(),
            handoff_status: String(payload.handoff_status ?? "").trim(),
            sent_by_user_id: String(payload.sent_by_user_id ?? "").trim(),
            sent_at: String(payload.sent_at ?? "").trim() || "2026-05-31T00:00:00.000Z",
            created_at: String(payload.sent_at ?? "").trim() || "2026-05-31T00:00:00.000Z",
            responded_by_user_id: null,
            responded_at: null,
            response_note: null,
            evidence_reference: null,
            updated_at: String(payload.sent_at ?? "").trim() || "2026-05-31T00:00:00.000Z",
          });

          return {
            select: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id },
                error: null,
              })),
            })),
          };
        });

        return {
          select,
          insert,
          update: vi.fn((payload: Record<string, unknown>) => {
            workflowHandoffRequestUpdateCalls.push(payload);

            let requestId = "";
            let installerAccountOwnerUserId = "";

            const query: any = {
              eq: (column: unknown, value: unknown) => {
                if (column === "id") {
                  requestId = String(value ?? "").trim();
                }
                if (column === "installer_account_owner_user_id") {
                  installerAccountOwnerUserId = String(value ?? "").trim();
                }
                return query;
              },
              select: () => query,
              maybeSingle: async () => {
                const row = workflowHandoffRequests.find((entry) => {
                  if (requestId && entry.id !== requestId) return false;
                  if (installerAccountOwnerUserId && entry.installer_account_owner_user_id !== installerAccountOwnerUserId) return false;
                  return true;
                });

                if (!row) {
                  return { data: null, error: null };
                }

                row.handoff_status = String(payload.handoff_status ?? row.handoff_status).trim() || row.handoff_status;
                row.responded_by_user_id = String(payload.responded_by_user_id ?? row.responded_by_user_id ?? "").trim() || null;
                row.responded_at = String(payload.responded_at ?? row.responded_at ?? "").trim() || null;
                row.response_note = String(payload.response_note ?? row.response_note ?? "").trim() || null;
                row.evidence_reference = String(payload.evidence_reference ?? row.evidence_reference ?? "").trim() || null;
                row.updated_at = String(payload.updated_at ?? row.updated_at ?? "").trim() || null;

                return {
                  data: {
                    id: row.id,
                    handoff_status: row.handoff_status,
                    response_note: row.response_note ?? null,
                    evidence_reference: row.evidence_reference ?? null,
                  },
                  error: null,
                };
              },
            };

            return query;
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }),

    _tableCalls: tableCalls,
    _workflowInstanceInsertCalls: workflowInstanceInsertCalls,
    _workflowMilestoneInsertCalls: workflowMilestoneInsertCalls,
    _workflowMilestoneUpdateCalls: workflowMilestoneUpdateCalls,
    _workflowJobLinkInsertCalls: workflowJobLinkInsertCalls,
    _workflowHandoffRequestInsertCalls: workflowHandoffRequestInsertCalls,
    _workflowHandoffRequestUpdateCalls: workflowHandoffRequestUpdateCalls,
    _workflowHandoffRequests: workflowHandoffRequests,
    _workflowInstances: workflowInstances,
    _workflowMilestones: workflowMilestones,
    _presets: presets,
  };

  return admin;
}

const {
  assignInstallWithPermitWorkflowToJob,
  assignWorkflowPresetToServiceCase,
  confirmLinkedInternalEccCompletionForWorkflowMilestone,
  ensureInstallWithPermitWorkflowPreset,
  linkInternalEccJobToWorkflowMilestone,
  recordExternalEccCompletionForWorkflowMilestone,
  completeWorkflowMilestoneFromCompletedHandoffRequest,
  respondToWorkflowHandoffRequest,
  sendWorkflowEccMilestoneToAuthorizedRater,
  updateWorkflowMilestoneStatus,
} = await import("@/lib/workflows/actions");

describe("assignWorkflowPresetToServiceCase", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({});
    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
        account_owner_user_id: "owner-1",
        role: "admin",
        is_active: true,
      },
    });
  });

  it("creates one workflow instance and milestone rows from preset snapshot", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      presets: [
        {
          id: "tpl-1",
          account_owner_user_id: "owner-1",
          template_name: "Install with Permit",
          lifecycle_status: "active",
          milestone_definition_json: [
            { key: "install", display_name: "Install work", sort_order: 20 },
            { key: "permit", display_name: "Permit", sort_order: 10 },
          ],
          updated_at: "2026-05-30T00:00:00.000Z",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
    });

    expect(result).toEqual({
      success: true,
      workflowInstanceId: "wf-1",
      created: true,
      milestoneCount: 2,
      linkedJobCount: 0,
    });

    expect(admin._workflowInstanceInsertCalls).toHaveLength(1);
    expect(admin._workflowMilestoneInsertCalls).toHaveLength(1);

    const insertedInstance = admin._workflowInstanceInsertCalls[0];
    expect(insertedInstance).toMatchObject({
      account_owner_user_id: "owner-1",
      service_case_id: "case-1",
      workflow_preset_template_id: "tpl-1",
      workflow_name_snapshot: "Install with Permit",
      workflow_status: "active",
      progress_percent: 0,
      created_by_user_id: "user-1",
      updated_by_user_id: "user-1",
    });

    expect((insertedInstance.template_snapshot_json as any)).toMatchObject({
      template_id: "tpl-1",
      template_name: "Install with Permit",
      template_lifecycle_status: "active",
      template_updated_at: "2026-05-30T00:00:00.000Z",
      milestone_definitions: [
        {
          milestone_key: "permit",
          display_name: "Permit",
          sort_order: 0,
        },
        {
          milestone_key: "install",
          display_name: "Install work",
          sort_order: 1,
        },
      ],
    });

    const insertedMilestones = admin._workflowMilestoneInsertCalls[0];
    expect(insertedMilestones).toHaveLength(2);
    expect(insertedMilestones[0]).toMatchObject({
      milestone_key: "permit",
      milestone_title: "Permit",
      sort_order: 0,
      milestone_status: "ready",
    });
    expect(insertedMilestones[1]).toMatchObject({
      milestone_key: "install",
      milestone_title: "Install work",
      sort_order: 1,
      milestone_status: "planned",
    });
  });

  it("is idempotent for existing active service_case + preset assignment", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      presets: [
        {
          id: "tpl-1",
          account_owner_user_id: "owner-1",
          template_name: "Install with Permit",
          lifecycle_status: "active",
          milestone_definition_json: [{ key: "permit", display_name: "Permit" }],
        },
      ],
      workflowInstances: [
        {
          id: "wf-existing",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-existing",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-existing",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
    });

    expect(result).toEqual({
      success: true,
      workflowInstanceId: "wf-existing",
      created: false,
      milestoneCount: 1,
      linkedJobCount: 0,
    });
    expect(admin._workflowInstanceInsertCalls).toHaveLength(0);
    expect(admin._workflowMilestoneInsertCalls).toHaveLength(0);
  });

  it("keeps snapshot frozen by refusing duplicate re-assignment after preset edits", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      presets: [
        {
          id: "tpl-1",
          account_owner_user_id: "owner-1",
          template_name: "Original Template Name",
          lifecycle_status: "active",
          milestone_definition_json: [{ key: "permit", display_name: "Original Permit" }],
          updated_at: "2026-05-30T10:00:00.000Z",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const first = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
    });
    expect(first.success).toBe(true);
    expect(first.success && first.created).toBe(true);

    admin._presets[0] = {
      ...admin._presets[0],
      template_name: "Edited Template Name",
      milestone_definition_json: [{ key: "permit", display_name: "Edited Permit" }],
      updated_at: "2026-05-30T11:00:00.000Z",
    };

    const second = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
    });

    expect(second).toEqual({
      success: true,
      workflowInstanceId: "wf-1",
      created: false,
      milestoneCount: 1,
      linkedJobCount: 0,
    });

    expect(admin._workflowInstanceInsertCalls).toHaveLength(1);
    expect(admin._workflowMilestoneInsertCalls).toHaveLength(1);
  });

  it("rejects cross-account service_case", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-2" }],
      presets: [
        {
          id: "tpl-1",
          account_owner_user_id: "owner-1",
          template_name: "Install with Permit",
          lifecycle_status: "active",
          milestone_definition_json: [],
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
    });

    expect(result).toEqual({
      success: false,
      error: "service_case_id not found in this account.",
    });
  });

  it("rejects cross-account preset", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      presets: [
        {
          id: "tpl-1",
          account_owner_user_id: "owner-2",
          template_name: "Install with Permit",
          lifecycle_status: "active",
          milestone_definition_json: [],
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
    });

    expect(result).toEqual({
      success: false,
      error: "workflow_preset_template_id is out of account scope.",
    });
  });

  it("rejects inactive or archived preset", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      presets: [
        {
          id: "tpl-1",
          account_owner_user_id: "owner-1",
          template_name: "Install with Permit",
          lifecycle_status: "archived",
          milestone_definition_json: [],
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
    });

    expect(result).toEqual({
      success: false,
      error: "workflow preset template must be active.",
    });
  });

  it("links explicit jobs when all jobs match account + service case scope", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      presets: [
        {
          id: "tpl-1",
          account_owner_user_id: "owner-1",
          template_name: "Install with Permit",
          lifecycle_status: "active",
          milestone_definition_json: [],
        },
      ],
      jobs: [
        { id: "job-1", customer_id: "cust-1", service_case_id: "case-1", deleted_at: null },
        { id: "job-2", customer_id: "cust-1", service_case_id: "case-1", deleted_at: null },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
      explicitJobIds: ["job-1", "job-2", "job-2"],
    });

    expect(result).toEqual({
      success: true,
      workflowInstanceId: "wf-1",
      created: true,
      milestoneCount: 0,
      linkedJobCount: 2,
    });

    expect(admin._workflowJobLinkInsertCalls).toHaveLength(1);
    expect(admin._workflowJobLinkInsertCalls[0]).toHaveLength(2);
    expect(admin._workflowJobLinkInsertCalls[0][0]).toMatchObject({
      workflow_instance_id: "wf-1",
      job_id: "job-1",
      link_role: "supporting",
      is_primary: false,
    });
  });

  it("rejects explicit job ids that do not belong to the service case", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      presets: [
        {
          id: "tpl-1",
          account_owner_user_id: "owner-1",
          template_name: "Install with Permit",
          lifecycle_status: "active",
          milestone_definition_json: [],
        },
      ],
      jobs: [
        { id: "job-1", customer_id: "cust-1", service_case_id: "case-2", deleted_at: null },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
      explicitJobIds: ["job-1"],
    });

    expect(result).toEqual({
      success: false,
      error: "job_id job-1 must belong to service_case_id case-1.",
    });
  });

  it("does not touch job/service-case status, job_events, or billing/sms/qbo/portal dependencies", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      presets: [
        {
          id: "tpl-1",
          account_owner_user_id: "owner-1",
          template_name: "Install with Permit",
          lifecycle_status: "active",
          milestone_definition_json: [{ key: "permit", display_name: "Permit" }],
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await assignWorkflowPresetToServiceCase({
      serviceCaseId: "case-1",
      workflowPresetTemplateId: "tpl-1",
    });

    expect(result.success).toBe(true);

    const forbiddenTables = [
      "job_events",
      "internal_invoices",
      "internal_invoice_payments",
      "internal_invoice_payment_allocations",
      "customer_saved_payment_methods",
      "stripe_webhook_events",
      "outbound_sms_messages",
      "qbo_sync_events",
      "portal_notifications",
    ];

    for (const table of forbiddenTables) {
      expect(admin._tableCalls).not.toContain(table);
    }
  });
});

describe("ensureInstallWithPermitWorkflowPreset", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({});
    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
        account_owner_user_id: "owner-1",
        role: "admin",
        is_active: true,
      },
    });
  });

  it("returns existing active tenant preset when present", async () => {
    const admin = makeAdminFixture({
      presets: [
        {
          id: "tpl-existing",
          account_owner_user_id: "owner-1",
          template_name: "Install with Permit",
          lifecycle_status: "active",
          milestone_definition_json: [],
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await ensureInstallWithPermitWorkflowPreset();

    expect(result).toEqual({
      success: true,
      workflowPresetTemplateId: "tpl-existing",
      created: false,
    });
  });

  it("creates a tenant preset when missing and remains idempotent", async () => {
    const admin = makeAdminFixture();
    createAdminClientMock.mockReturnValue(admin);

    const first = await ensureInstallWithPermitWorkflowPreset();
    const second = await ensureInstallWithPermitWorkflowPreset();

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);

    if (first.success && second.success) {
      expect(first.workflowPresetTemplateId).toBeTruthy();
      expect(second.workflowPresetTemplateId).toBe(first.workflowPresetTemplateId);
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
    }

    expect(admin._presets).toHaveLength(1);
    expect(admin._presets[0]).toMatchObject({
      account_owner_user_id: "owner-1",
      template_name: "Install with Permit",
      lifecycle_status: "active",
    });
  });

  it("requires owner/admin authority to create the default preset", async () => {
    const admin = makeAdminFixture();
    createAdminClientMock.mockReturnValue(admin);

    requireInternalUserMock.mockResolvedValue({
      userId: "user-2",
      internalUser: {
        user_id: "user-2",
        account_owner_user_id: "owner-1",
        role: "dispatcher",
        is_active: true,
      },
    });

    const result = await ensureInstallWithPermitWorkflowPreset();

    expect(result).toEqual({
      success: false,
      error: "Owner/admin role required to create workflow guidance preset.",
    });
    expect(admin._presets).toHaveLength(0);
  });
});

describe("assignInstallWithPermitWorkflowToJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({});
    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
        account_owner_user_id: "owner-1",
        role: "admin",
        is_active: true,
      },
    });
  });

  it("assigns Install with Permit to the scoped job service_case_id", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      jobs: [{ id: "job-1", customer_id: "cust-1", service_case_id: "case-1", deleted_at: null }],
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await assignInstallWithPermitWorkflowToJob({ jobId: "job-1" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.workflowPresetTemplateId).toBeTruthy();
      expect(result.workflowInstanceId).toBeTruthy();
      expect(result.milestoneCount).toBe(4);
    }

    expect(admin._presets).toHaveLength(1);
    expect(admin._workflowInstances).toHaveLength(1);
    expect(admin._workflowMilestones).toHaveLength(4);
  });

  it("rejects job without service_case_id", async () => {
    const admin = makeAdminFixture({
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      jobs: [{ id: "job-1", customer_id: "cust-1", service_case_id: null, deleted_at: null }],
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await assignInstallWithPermitWorkflowToJob({ jobId: "job-1" });

    expect(result).toEqual({
      success: false,
      error: "job_id is not attached to a service_case_id.",
    });
    expect(admin._workflowInstances).toHaveLength(0);
  });

  it("rejects cross-account job scope", async () => {
    const admin = makeAdminFixture({
      customers: [{ id: "cust-1", owner_user_id: "owner-2" }],
      jobs: [{ id: "job-1", customer_id: "cust-1", service_case_id: "case-1", deleted_at: null }],
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await assignInstallWithPermitWorkflowToJob({ jobId: "job-1" });

    expect(result).toEqual({
      success: false,
      error: "job_id not found in this account.",
    });
    expect(admin._workflowInstances).toHaveLength(0);
  });

  it("is idempotent on duplicate submit and does not duplicate workflow instances/milestones", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      jobs: [{ id: "job-1", customer_id: "cust-1", service_case_id: "case-1", deleted_at: null }],
    });
    createAdminClientMock.mockReturnValue(admin);

    const first = await assignInstallWithPermitWorkflowToJob({ jobId: "job-1" });
    const second = await assignInstallWithPermitWorkflowToJob({ jobId: "job-1" });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);

    expect(admin._workflowInstances).toHaveLength(1);
    expect(admin._workflowMilestones).toHaveLength(4);
  });

  it("does not write jobs/service_cases/job_events or billing/sms/qbo/portal tables", async () => {
    const admin = makeAdminFixture({
      serviceCases: [{ id: "case-1", customer_id: "cust-1" }],
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      jobs: [{ id: "job-1", customer_id: "cust-1", service_case_id: "case-1", deleted_at: null }],
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await assignInstallWithPermitWorkflowToJob({ jobId: "job-1" });
    expect(result.success).toBe(true);

    const forbiddenTables = [
      "job_events",
      "internal_invoices",
      "internal_invoice_payments",
      "internal_invoice_payment_allocations",
      "customer_saved_payment_methods",
      "stripe_webhook_events",
      "outbound_sms_messages",
      "qbo_sync_events",
      "portal_notifications",
    ];

    for (const table of forbiddenTables) {
      expect(admin._tableCalls).not.toContain(table);
    }
  });
});

describe("recordExternalEccCompletionForWorkflowMilestone", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({});
    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
        account_owner_user_id: "owner-1",
        role: "admin",
        is_active: true,
      },
    });
  });

  it("succeeds for ECC handoff/completion milestone and writes completion reason", async () => {
    const admin = makeAdminFixture({
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-ecc",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_key: "ecc_handoff_completion",
          milestone_title: "ECC handoff/completion",
          milestone_status: "in_progress",
        },
      ],
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await recordExternalEccCompletionForWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      completionNote: "External ECC completion smoke test",
      evidenceReference: "CF3R #12345",
    });

    expect(result).toEqual({
      success: true,
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      status: "completed",
      statusReason: "External ECC completion smoke test | Evidence: CF3R #12345",
    });

    expect(admin._workflowMilestones[0]).toMatchObject({
      milestone_status: "completed",
      status_reason: "External ECC completion smoke test | Evidence: CF3R #12345",
      updated_by_user_id: "user-1",
    });
  });

  it("rejects non-ECC milestone", async () => {
    const admin = makeAdminFixture({
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-install",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_key: "install_work",
          milestone_title: "Install work",
          milestone_status: "ready",
        },
      ],
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await recordExternalEccCompletionForWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-install",
      completionNote: "External ECC completion smoke test",
    });

    expect(result).toEqual({
      success: false,
      error: "milestone_id is not ECC handoff/completion milestone.",
    });
    expect(admin._workflowMilestones[0]).toMatchObject({
      milestone_status: "ready",
    });
  });

  it("rejects missing required completion note", async () => {
    const admin = makeAdminFixture();
    createAdminClientMock.mockReturnValue(admin);

    const result = await recordExternalEccCompletionForWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      completionNote: "   ",
    });

    expect(result).toEqual({
      success: false,
      error: "completion_note is required.",
    });
    expect(admin._workflowMilestoneUpdateCalls).toHaveLength(0);
  });

  it("rejects cross-account workflow/milestone", async () => {
    const admin = makeAdminFixture({
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-2",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-ecc",
          account_owner_user_id: "owner-2",
          workflow_instance_id: "wf-1",
          milestone_key: "ecc_handoff_completion",
          milestone_title: "ECC handoff/completion",
          milestone_status: "in_progress",
        },
      ],
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await recordExternalEccCompletionForWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      completionNote: "External ECC completion smoke test",
    });

    expect(result).toEqual({
      success: false,
      error: "workflow_instance_id not found in this account.",
    });
    expect(admin._workflowMilestoneUpdateCalls).toHaveLength(0);
  });

  it("rejects milestone/workflow mismatch", async () => {
    const admin = makeAdminFixture({
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-ecc",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-2",
          milestone_key: "ecc_handoff_completion",
          milestone_title: "ECC handoff/completion",
          milestone_status: "in_progress",
        },
      ],
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await recordExternalEccCompletionForWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      completionNote: "External ECC completion smoke test",
    });

    expect(result).toEqual({
      success: false,
      error: "milestone_id does not belong to workflow_instance_id.",
    });
    expect(admin._workflowMilestoneUpdateCalls).toHaveLength(0);
  });

  it("updates only workflow_instance_milestones and does not touch job/service_case/job_events or billing/sms/qbo/portal tables", async () => {
    const admin = makeAdminFixture({
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-ecc",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_key: "ecc_handoff_completion",
          milestone_title: "ECC handoff/completion",
          milestone_status: "in_progress",
        },
      ],
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await recordExternalEccCompletionForWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      completionNote: "External ECC completion smoke test",
      evidenceReference: "Third-party rater ACME",
    });

    expect(result.success).toBe(true);

    const forbiddenTables = [
      "jobs",
      "service_cases",
      "job_events",
      "internal_invoices",
      "internal_invoice_payments",
      "internal_invoice_payment_allocations",
      "customer_saved_payment_methods",
      "stripe_webhook_events",
      "outbound_sms_messages",
      "qbo_sync_events",
      "portal_notifications",
    ];

    for (const table of forbiddenTables) {
      expect(admin._tableCalls).not.toContain(table);
    }
  });
});

describe("confirmLinkedInternalEccCompletionForWorkflowMilestone", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({});
    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
        account_owner_user_id: "owner-1",
        role: "admin",
        is_active: true,
      },
    });
  });

  function buildFixture(overrides?: {
    workflowInstances?: MockWorkflowInstance[];
    workflowMilestones?: MockWorkflowMilestone[];
    workflowJobLinks?: MockWorkflowJobLink[];
    jobs?: MockJob[];
    customers?: MockCustomer[];
  }) {
    const admin = makeAdminFixture({
      workflowInstances: overrides?.workflowInstances ?? [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: overrides?.workflowMilestones ?? [
        {
          id: "ms-ecc",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_key: "ecc_handoff_completion",
          milestone_title: "ECC handoff/completion",
          milestone_status: "ready",
          status_reason: null,
        },
      ],
      workflowJobLinks: overrides?.workflowJobLinks ?? [
        {
          id: "lnk-1",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          workflow_instance_milestone_id: "ms-ecc",
          job_id: "job-ecc-1",
          link_role: "supporting",
          is_primary: false,
        },
      ],
      jobs: overrides?.jobs ?? [
        {
          id: "job-ecc-1",
          customer_id: "cust-1",
          service_case_id: "case-1",
          job_type: "ecc",
          deleted_at: null,
          job_display_number: "2042",
          status: "completed",
          field_complete: true,
        },
      ],
      customers: overrides?.customers ?? [{ id: "cust-1", owner_user_id: "owner-1" }],
    });

    createAdminClientMock.mockReturnValue(admin);
    return admin;
  }

  it("succeeds when ECC milestone has a linked completed ECC job", async () => {
    const admin = buildFixture();

    const result = await confirmLinkedInternalEccCompletionForWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      reviewNote: "Reviewed in workflow helper.",
    });

    expect(result).toEqual({
      success: true,
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      status: "completed",
      statusReason: "Job #2042: Reviewed in workflow helper.",
      jobId: "job-ecc-1",
    });

    expect(admin._workflowMilestoneUpdateCalls).toHaveLength(1);
    expect(admin._workflowMilestoneUpdateCalls[0]).toMatchObject({
      milestone_status: "completed",
      status_reason: "Job #2042: Reviewed in workflow helper.",
      updated_by_user_id: "user-1",
    });
  });

  it("uses default review note when none is provided", async () => {
    buildFixture();

    const result = await confirmLinkedInternalEccCompletionForWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        statusReason: "Job #2042: Linked internal ECC job reviewed and completed.",
      }),
    );
  });

  it("rejects when no linked ECC job exists", async () => {
    buildFixture({ workflowJobLinks: [] });

    const result = await confirmLinkedInternalEccCompletionForWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
    });

    expect(result).toEqual({
      success: false,
      error: "ECC milestone does not have a linked internal ECC job.",
    });
  });

  it("rejects when linked job is not ECC", async () => {
    buildFixture({
      jobs: [
        {
          id: "job-ecc-1",
          customer_id: "cust-1",
          service_case_id: "case-1",
          job_type: "service",
          status: "completed",
          field_complete: true,
        },
      ],
    });

    const result = await confirmLinkedInternalEccCompletionForWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
    });

    expect(result).toEqual({
      success: false,
      error: "linked job must be an ECC job.",
    });
  });

  it("rejects when linked job belongs to different service_case", async () => {
    buildFixture({
      jobs: [
        {
          id: "job-ecc-1",
          customer_id: "cust-1",
          service_case_id: "case-2",
          job_type: "ecc",
          status: "completed",
          field_complete: true,
        },
      ],
    });

    const result = await confirmLinkedInternalEccCompletionForWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
    });

    expect(result).toEqual({
      success: false,
      error: "linked job must belong to the same service_case_id as workflow_instance_id.",
    });
  });

  it("rejects when linked job is out of account scope", async () => {
    buildFixture({
      customers: [{ id: "cust-1", owner_user_id: "owner-2" }],
    });

    const result = await confirmLinkedInternalEccCompletionForWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
    });

    expect(result).toEqual({
      success: false,
      error: "linked job is out of account scope.",
    });
  });

  it("rejects when linked ECC job is not complete", async () => {
    buildFixture({
      jobs: [
        {
          id: "job-ecc-1",
          customer_id: "cust-1",
          service_case_id: "case-1",
          job_type: "ecc",
          status: "open",
          field_complete: false,
        },
      ],
    });

    const result = await confirmLinkedInternalEccCompletionForWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
    });

    expect(result).toEqual({
      success: false,
      error: "linked ECC job is not complete yet.",
    });
  });

  it("rejects non-ECC milestone", async () => {
    buildFixture({
      workflowMilestones: [
        {
          id: "ms-install",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_key: "install_work",
          milestone_title: "Install work",
          milestone_status: "ready",
        },
      ],
      workflowJobLinks: [
        {
          id: "lnk-1",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          workflow_instance_milestone_id: "ms-install",
          job_id: "job-ecc-1",
          link_role: "supporting",
          is_primary: false,
        },
      ],
    });

    const result = await confirmLinkedInternalEccCompletionForWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-install",
    });

    expect(result).toEqual({
      success: false,
      error: "milestone_id is not ECC handoff/completion milestone.",
    });
  });

  it("rejects cross-account workflow scope", async () => {
    buildFixture({
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-2",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
    });

    const result = await confirmLinkedInternalEccCompletionForWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
    });

    expect(result).toEqual({
      success: false,
      error: "workflow_instance_id not found in this account.",
    });
  });

  it("rejects milestone/workflow mismatch", async () => {
    buildFixture({
      workflowMilestones: [
        {
          id: "ms-ecc",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-2",
          milestone_key: "ecc_handoff_completion",
          milestone_title: "ECC handoff/completion",
          milestone_status: "ready",
        },
      ],
    });

    const result = await confirmLinkedInternalEccCompletionForWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
    });

    expect(result).toEqual({
      success: false,
      error: "milestone_id does not belong to workflow_instance_id.",
    });
  });

  it("updates only workflow_instance_milestones and avoids jobs/service_cases/job_events/invoice/sms/qbo/portal writes", async () => {
    const admin = buildFixture();

    const result = await confirmLinkedInternalEccCompletionForWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
    });

    expect(result.success).toBe(true);
    expect(admin._tableCalls).not.toContain("service_cases");
    expect(admin._tableCalls).not.toContain("job_events");
    expect(admin._tableCalls).not.toContain("internal_invoices");
    expect(admin._tableCalls).not.toContain("internal_invoice_payments");
    expect(admin._tableCalls).not.toContain("notifications");
    expect(admin._tableCalls).not.toContain("outbound_sms_messages");
    expect(admin._tableCalls).not.toContain("qbo_sync_events");
    expect(admin._tableCalls).not.toContain("portal_notifications");
    expect(admin._workflowJobLinkInsertCalls).toHaveLength(0);
  });
});

describe("sendWorkflowEccMilestoneToAuthorizedRater", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({});
    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
        account_owner_user_id: "owner-1",
        role: "admin",
        is_active: true,
      },
    });
  });

  function buildFixture(overrides?: {
    customers?: MockCustomer[];
    jobs?: MockJob[];
    workflowInstances?: MockWorkflowInstance[];
    workflowMilestones?: MockWorkflowMilestone[];
    authorizedHandoffRecipients?: MockAuthorizedHandoffRecipient[];
    workflowHandoffRequests?: MockWorkflowHandoffRequest[];
  }) {
    const admin = makeAdminFixture({
      customers: overrides?.customers ?? [{ id: "cust-1", owner_user_id: "owner-1" }],
      jobs: overrides?.jobs ?? [{ id: "job-1", customer_id: "cust-1", service_case_id: "case-1", deleted_at: null }],
      workflowInstances: overrides?.workflowInstances ?? [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: overrides?.workflowMilestones ?? [
        {
          id: "ms-ecc",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_key: "ecc_handoff_completion",
          milestone_title: "ECC handoff/completion",
          milestone_status: "ready",
          status_reason: null,
        },
      ],
      authorizedHandoffRecipients: overrides?.authorizedHandoffRecipients ?? [],
      workflowHandoffRequests: overrides?.workflowHandoffRequests ?? [],
    });

    createAdminClientMock.mockReturnValue(admin);
    return admin;
  }

  it("rejects when no active ECC recipient is configured", async () => {
    buildFixture();

    const result = await sendWorkflowEccMilestoneToAuthorizedRater({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
    });

    expect(result).toEqual({
      success: false,
      error: "No active authorized ECC rater is set up yet.",
    });
  });

  it("creates durable handoff request and updates milestone when one active recipient exists", async () => {
    const admin = buildFixture({
      authorizedHandoffRecipients: [
        {
          id: "ahr-1",
          account_owner_user_id: "owner-1",
          recipient_type: "external_manual",
          handoff_kind: "ecc",
          display_name: "Acme Ratings",
          is_default: true,
          is_active: true,
          archived_at: null,
        },
      ],
    });

    const result = await sendWorkflowEccMilestoneToAuthorizedRater({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      jobId: "job-1",
    });

    expect(result).toEqual({
      success: true,
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      status: "waiting",
      statusReason: "Sent to authorized rater: Acme Ratings",
      authorizedRecipientId: "ahr-1",
      recipientDisplayName: "Acme Ratings",
      handoffRequestId: "whr-1",
      handoffRequestCreated: true,
    });

    expect(admin._workflowHandoffRequestInsertCalls).toHaveLength(1);
    expect(admin._workflowHandoffRequestInsertCalls[0]).toMatchObject({
      installer_account_owner_user_id: "owner-1",
      workflow_instance_id: "wf-1",
      workflow_instance_milestone_id: "ms-ecc",
      service_case_id: "case-1",
      source_job_id: "job-1",
      authorized_handoff_recipient_id: "ahr-1",
      recipient_type_snapshot: "external_manual",
      recipient_display_name_snapshot: "Acme Ratings",
      handoff_kind: "ecc",
      handoff_status: "sent",
      sent_by_user_id: "user-1",
    });

    expect(admin._workflowMilestones[0]).toMatchObject({
      milestone_status: "waiting",
      status_reason: "Sent to authorized rater: Acme Ratings",
      updated_by_user_id: "user-1",
    });
  });

  it("is idempotent for repeated sends to the same milestone and recipient", async () => {
    const admin = buildFixture({
      authorizedHandoffRecipients: [
        {
          id: "ahr-1",
          account_owner_user_id: "owner-1",
          recipient_type: "external_manual",
          handoff_kind: "ecc",
          display_name: "Acme Ratings",
          is_default: true,
          is_active: true,
          archived_at: null,
        },
      ],
    });

    const first = await sendWorkflowEccMilestoneToAuthorizedRater({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      authorizedRecipientId: "ahr-1",
      jobId: "job-1",
    });
    const second = await sendWorkflowEccMilestoneToAuthorizedRater({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      authorizedRecipientId: "ahr-1",
      jobId: "job-1",
    });

    expect(first.success).toBe(true);
    expect(second).toMatchObject({
      success: true,
      handoffRequestId: "whr-1",
      handoffRequestCreated: false,
      status: "waiting",
    });

    expect(admin._workflowHandoffRequestInsertCalls).toHaveLength(1);
    expect(admin._workflowHandoffRequests).toHaveLength(1);
    expect(admin._workflowMilestoneUpdateCalls).toHaveLength(2);
  });

  it("rejects source job ids that are out of service-case scope", async () => {
    buildFixture({
      jobs: [{ id: "job-foreign", customer_id: "cust-1", service_case_id: "case-2", deleted_at: null }],
      authorizedHandoffRecipients: [
        {
          id: "ahr-1",
          account_owner_user_id: "owner-1",
          recipient_type: "external_manual",
          handoff_kind: "ecc",
          display_name: "Acme Ratings",
          is_default: true,
          is_active: true,
          archived_at: null,
        },
      ],
    });

    const result = await sendWorkflowEccMilestoneToAuthorizedRater({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      authorizedRecipientId: "ahr-1",
      jobId: "job-foreign",
    });

    expect(result).toEqual({
      success: false,
      error: "job_id must belong to the same service_case_id as workflow_instance_id.",
    });
  });

  it("requires explicit recipient selection when multiple recipients are active", async () => {
    buildFixture({
      authorizedHandoffRecipients: [
        {
          id: "ahr-1",
          account_owner_user_id: "owner-1",
          recipient_type: "external_manual",
          handoff_kind: "ecc",
          display_name: "Acme Ratings",
          is_default: true,
          is_active: true,
          archived_at: null,
        },
        {
          id: "ahr-2",
          account_owner_user_id: "owner-1",
          recipient_type: "external_manual",
          handoff_kind: "ecc",
          display_name: "Golden State Rater",
          is_default: false,
          is_active: true,
          archived_at: null,
        },
      ],
    });

    const result = await sendWorkflowEccMilestoneToAuthorizedRater({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
    });

    expect(result).toEqual({
      success: false,
      error: "authorized_recipient_id is required when multiple recipients are active.",
    });
  });

  it("rejects recipient ids that are out of account scope", async () => {
    buildFixture({
      authorizedHandoffRecipients: [
        {
          id: "ahr-foreign",
          account_owner_user_id: "owner-2",
          recipient_type: "external_manual",
          handoff_kind: "ecc",
          display_name: "Foreign Recipient",
          is_default: true,
          is_active: true,
          archived_at: null,
        },
      ],
    });

    const result = await sendWorkflowEccMilestoneToAuthorizedRater({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      authorizedRecipientId: "ahr-foreign",
    });

    expect(result).toEqual({
      success: false,
      error: "No active authorized ECC rater is set up yet.",
    });
  });

  it("rejects inactive recipients", async () => {
    buildFixture({
      authorizedHandoffRecipients: [
        {
          id: "ahr-1",
          account_owner_user_id: "owner-1",
          recipient_type: "external_manual",
          handoff_kind: "ecc",
          display_name: "Inactive Rater",
          is_default: true,
          is_active: false,
          archived_at: null,
        },
      ],
    });

    const result = await sendWorkflowEccMilestoneToAuthorizedRater({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      authorizedRecipientId: "ahr-1",
    });

    expect(result).toEqual({
      success: false,
      error: "No active authorized ECC rater is set up yet.",
    });
  });

  it("rejects non-ECC recipient kinds", async () => {
    buildFixture({
      authorizedHandoffRecipients: [
        {
          id: "ahr-1",
          account_owner_user_id: "owner-1",
          recipient_type: "external_manual",
          handoff_kind: "general_future",
          display_name: "General Recipient",
          is_default: true,
          is_active: true,
          archived_at: null,
        },
      ],
    });

    const result = await sendWorkflowEccMilestoneToAuthorizedRater({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      authorizedRecipientId: "ahr-1",
    });

    expect(result).toEqual({
      success: false,
      error: "No active authorized ECC rater is set up yet.",
    });
  });

  it("rejects non-ECC milestones", async () => {
    buildFixture({
      workflowMilestones: [
        {
          id: "ms-install",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_key: "install_work",
          milestone_title: "Install work",
          milestone_status: "ready",
        },
      ],
      authorizedHandoffRecipients: [
        {
          id: "ahr-1",
          account_owner_user_id: "owner-1",
          recipient_type: "external_manual",
          handoff_kind: "ecc",
          display_name: "Acme Ratings",
          is_default: true,
          is_active: true,
          archived_at: null,
        },
      ],
    });

    const result = await sendWorkflowEccMilestoneToAuthorizedRater({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-install",
      authorizedRecipientId: "ahr-1",
    });

    expect(result).toEqual({
      success: false,
      error: "milestone_id is not ECC handoff/completion milestone.",
    });
  });

  it("rejects cross-account workflow/milestone scope and mismatch", async () => {
    buildFixture({
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-2",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      authorizedHandoffRecipients: [
        {
          id: "ahr-1",
          account_owner_user_id: "owner-1",
          recipient_type: "external_manual",
          handoff_kind: "ecc",
          display_name: "Acme Ratings",
          is_default: true,
          is_active: true,
          archived_at: null,
        },
      ],
    });

    const crossAccountResult = await sendWorkflowEccMilestoneToAuthorizedRater({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      authorizedRecipientId: "ahr-1",
    });

    expect(crossAccountResult).toEqual({
      success: false,
      error: "workflow_instance_id not found in this account.",
    });

    const mismatchAdmin = buildFixture({
      workflowMilestones: [
        {
          id: "ms-ecc",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-2",
          milestone_key: "ecc_handoff_completion",
          milestone_title: "ECC handoff/completion",
          milestone_status: "ready",
        },
      ],
      authorizedHandoffRecipients: [
        {
          id: "ahr-1",
          account_owner_user_id: "owner-1",
          recipient_type: "external_manual",
          handoff_kind: "ecc",
          display_name: "Acme Ratings",
          is_default: true,
          is_active: true,
          archived_at: null,
        },
      ],
    });

    const mismatchResult = await sendWorkflowEccMilestoneToAuthorizedRater({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      authorizedRecipientId: "ahr-1",
    });

    expect(mismatchResult).toEqual({
      success: false,
      error: "milestone_id does not belong to workflow_instance_id.",
    });
    expect(mismatchAdmin._workflowMilestoneUpdateCalls).toHaveLength(0);
  });

  it("rejects connected_account_future recipients for this workflow-scoped v1", async () => {
    const admin = buildFixture({
      authorizedHandoffRecipients: [
        {
          id: "ahr-1",
          account_owner_user_id: "owner-1",
          recipient_type: "connected_account_future",
          handoff_kind: "ecc",
          display_name: "Future Connected Recipient",
          is_default: true,
          is_active: true,
          archived_at: null,
        },
      ],
    });

    const result = await sendWorkflowEccMilestoneToAuthorizedRater({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
    });

    expect(result).toEqual({
      success: false,
      error: "Connected-account ECC handoff is not available yet.",
    });
    expect(admin._workflowHandoffRequestInsertCalls).toHaveLength(0);
    expect(admin._workflowMilestoneUpdateCalls).toHaveLength(0);
  });

  it("updates only workflow_instance_milestones and avoids job/service_case/job_events and billing/sms/qbo/portal writes", async () => {
    const admin = buildFixture({
      authorizedHandoffRecipients: [
        {
          id: "ahr-1",
          account_owner_user_id: "owner-1",
          recipient_type: "external_manual",
          handoff_kind: "ecc",
          display_name: "Acme Ratings",
          is_default: true,
          is_active: true,
          archived_at: null,
        },
      ],
    });

    const result = await sendWorkflowEccMilestoneToAuthorizedRater({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
    });

    expect(result.success).toBe(true);

    const forbiddenTables = [
      "jobs",
      "service_cases",
      "job_events",
      "internal_invoices",
      "internal_invoice_payments",
      "internal_invoice_payment_allocations",
      "customer_saved_payment_methods",
      "stripe_webhook_events",
      "outbound_sms_messages",
      "qbo_sync_events",
      "portal_notifications",
      "maintenance_agreements",
      "maintenance_agreement_memberships",
      "maintenance_agreement_billing_periods",
    ];

    for (const table of forbiddenTables) {
      expect(admin._tableCalls).not.toContain(table);
    }
  });
});

describe("respondToWorkflowHandoffRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({});
    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
        account_owner_user_id: "owner-1",
        role: "admin",
        is_active: true,
      },
    });
  });

  function buildResponseFixture(overrides?: {
    workflowHandoffRequests?: MockWorkflowHandoffRequest[];
  }) {
    const admin = makeAdminFixture({
      workflowHandoffRequests: overrides?.workflowHandoffRequests ?? [
        {
          id: "whr-1",
          installer_account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          workflow_instance_milestone_id: "ms-ecc",
          service_case_id: "case-1",
          source_job_id: "job-1",
          authorized_handoff_recipient_id: "ahr-1",
          recipient_type_snapshot: "external_manual",
          recipient_display_name_snapshot: "Smoke Rater A",
          handoff_kind: "ecc",
          handoff_status: "sent",
          sent_by_user_id: "user-2",
          sent_at: "2026-05-31T17:51:10.463Z",
          created_at: "2026-05-31T17:51:10.463Z",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);
    return admin;
  }

  it("allows sent to accepted", async () => {
    const admin = buildResponseFixture();

    const result = await respondToWorkflowHandoffRequest({
      handoffRequestId: "whr-1",
      responseStatus: "accepted",
      responseNote: "Accepted for review.",
    });

    expect(result).toEqual({
      success: true,
      handoffRequestId: "whr-1",
      handoffStatus: "accepted",
      responseNote: "Accepted for review.",
      evidenceReference: null,
    });

    expect(admin._workflowHandoffRequests[0]).toMatchObject({
      handoff_status: "accepted",
      responded_by_user_id: "user-1",
      response_note: "Accepted for review.",
    });
  });

  it("allows sent to completed and stores evidence", async () => {
    const admin = buildResponseFixture();

    const result = await respondToWorkflowHandoffRequest({
      handoffRequestId: "whr-1",
      responseStatus: "completed",
      responseNote: "ECC completed smoke response",
      evidenceReference: "CF3R smoke response",
    });

    expect(result).toEqual({
      success: true,
      handoffRequestId: "whr-1",
      handoffStatus: "completed",
      responseNote: "ECC completed smoke response",
      evidenceReference: "CF3R smoke response",
    });
    expect(admin._workflowHandoffRequests[0]).toMatchObject({
      handoff_status: "completed",
      responded_by_user_id: "user-1",
      response_note: "ECC completed smoke response",
      evidence_reference: "CF3R smoke response",
    });
  });

  it("uses generated note when completing without a note", async () => {
    buildResponseFixture();

    const result = await respondToWorkflowHandoffRequest({
      handoffRequestId: "whr-1",
      responseStatus: "completed",
    });

    expect(result).toEqual({
      success: true,
      handoffRequestId: "whr-1",
      handoffStatus: "completed",
      responseNote: "ECC completed by authorized rater.",
      evidenceReference: null,
    });
  });

  it("allows accepted to completed", async () => {
    buildResponseFixture({
      workflowHandoffRequests: [
        {
          id: "whr-1",
          installer_account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          workflow_instance_milestone_id: "ms-ecc",
          service_case_id: "case-1",
          authorized_handoff_recipient_id: "ahr-1",
          recipient_type_snapshot: "external_manual",
          recipient_display_name_snapshot: "Smoke Rater A",
          handoff_kind: "ecc",
          handoff_status: "accepted",
          sent_by_user_id: "user-2",
          sent_at: "2026-05-31T17:51:10.463Z",
          responded_by_user_id: "user-3",
          responded_at: "2026-05-31T17:55:10.463Z",
          response_note: "Accepted",
        },
      ],
    });

    const result = await respondToWorkflowHandoffRequest({
      handoffRequestId: "whr-1",
      responseStatus: "completed",
      responseNote: "Done.",
    });

    expect(result).toMatchObject({
      success: true,
      handoffStatus: "completed",
      responseNote: "Done.",
    });
  });

  it("allows sent to rejected", async () => {
    buildResponseFixture();

    const result = await respondToWorkflowHandoffRequest({
      handoffRequestId: "whr-1",
      responseStatus: "rejected",
      responseNote: "Insufficient packet.",
    });

    expect(result).toEqual({
      success: true,
      handoffRequestId: "whr-1",
      handoffStatus: "rejected",
      responseNote: "Insufficient packet.",
      evidenceReference: null,
    });
  });

  it("allows accepted to rejected", async () => {
    buildResponseFixture({
      workflowHandoffRequests: [
        {
          id: "whr-1",
          installer_account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          workflow_instance_milestone_id: "ms-ecc",
          service_case_id: "case-1",
          authorized_handoff_recipient_id: "ahr-1",
          recipient_type_snapshot: "external_manual",
          recipient_display_name_snapshot: "Smoke Rater A",
          handoff_kind: "ecc",
          handoff_status: "accepted",
          sent_by_user_id: "user-2",
          sent_at: "2026-05-31T17:51:10.463Z",
        },
      ],
    });

    const result = await respondToWorkflowHandoffRequest({
      handoffRequestId: "whr-1",
      responseStatus: "rejected",
      responseNote: "Rater cannot proceed.",
    });

    expect(result).toMatchObject({
      success: true,
      handoffStatus: "rejected",
      responseNote: "Rater cannot proceed.",
    });
  });

  it("requires response note for rejected", async () => {
    buildResponseFixture();

    const result = await respondToWorkflowHandoffRequest({
      handoffRequestId: "whr-1",
      responseStatus: "rejected",
    });

    expect(result).toEqual({
      success: false,
      error: "response_note is required when rejecting a handoff request.",
    });
  });

  it("rejects invalid transitions", async () => {
    buildResponseFixture({
      workflowHandoffRequests: [
        {
          id: "whr-1",
          installer_account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          workflow_instance_milestone_id: "ms-ecc",
          service_case_id: "case-1",
          authorized_handoff_recipient_id: "ahr-1",
          recipient_type_snapshot: "external_manual",
          recipient_display_name_snapshot: "Smoke Rater A",
          handoff_kind: "ecc",
          handoff_status: "accepted",
          sent_by_user_id: "user-2",
          sent_at: "2026-05-31T17:51:10.463Z",
        },
      ],
    });

    const result = await respondToWorkflowHandoffRequest({
      handoffRequestId: "whr-1",
      responseStatus: "accepted",
      responseNote: "Still accepted",
    });

    expect(result).toEqual({
      success: false,
      error: "handoff request cannot transition from accepted to accepted.",
    });
  });

  it("rejects terminal completed rejected and cancelled states", async () => {
    for (const terminalStatus of ["completed", "rejected", "cancelled"]) {
      buildResponseFixture({
        workflowHandoffRequests: [
          {
            id: "whr-1",
            installer_account_owner_user_id: "owner-1",
            workflow_instance_id: "wf-1",
            workflow_instance_milestone_id: "ms-ecc",
            service_case_id: "case-1",
            authorized_handoff_recipient_id: "ahr-1",
            recipient_type_snapshot: "external_manual",
            recipient_display_name_snapshot: "Smoke Rater A",
            handoff_kind: "ecc",
            handoff_status: terminalStatus,
            sent_by_user_id: "user-2",
            sent_at: "2026-05-31T17:51:10.463Z",
          },
        ],
      });

      const result = await respondToWorkflowHandoffRequest({
        handoffRequestId: "whr-1",
        responseStatus: "completed",
        responseNote: "Retry",
      });

      expect(result).toEqual({
        success: false,
        error: `handoff request cannot transition from ${terminalStatus} to completed.`,
      });
    }
  });

  it("rejects non-ECC handoff kinds", async () => {
    buildResponseFixture({
      workflowHandoffRequests: [
        {
          id: "whr-1",
          installer_account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          workflow_instance_milestone_id: "ms-ecc",
          service_case_id: "case-1",
          authorized_handoff_recipient_id: "ahr-1",
          recipient_type_snapshot: "external_manual",
          recipient_display_name_snapshot: "Smoke Rater A",
          handoff_kind: "general_future",
          handoff_status: "sent",
          sent_by_user_id: "user-2",
          sent_at: "2026-05-31T17:51:10.463Z",
        },
      ],
    });

    const result = await respondToWorkflowHandoffRequest({
      handoffRequestId: "whr-1",
      responseStatus: "accepted",
    });

    expect(result).toEqual({
      success: false,
      error: "handoff_request_id is not an ECC handoff request.",
    });
  });

  it("rejects cross-account requests", async () => {
    buildResponseFixture({
      workflowHandoffRequests: [
        {
          id: "whr-1",
          installer_account_owner_user_id: "owner-2",
          workflow_instance_id: "wf-1",
          workflow_instance_milestone_id: "ms-ecc",
          service_case_id: "case-1",
          authorized_handoff_recipient_id: "ahr-1",
          recipient_type_snapshot: "external_manual",
          recipient_display_name_snapshot: "Smoke Rater A",
          handoff_kind: "ecc",
          handoff_status: "sent",
          sent_by_user_id: "user-2",
          sent_at: "2026-05-31T17:51:10.463Z",
        },
      ],
    });

    const result = await respondToWorkflowHandoffRequest({
      handoffRequestId: "whr-1",
      responseStatus: "accepted",
    });

    expect(result).toEqual({
      success: false,
      error: "handoff_request_id not found in this account.",
    });
  });

  it("updates only workflow_handoff_requests and avoids milestone job service-case event and billing writes", async () => {
    const admin = buildResponseFixture();

    const result = await respondToWorkflowHandoffRequest({
      handoffRequestId: "whr-1",
      responseStatus: "completed",
      responseNote: "ECC completed smoke response",
      evidenceReference: "CF3R smoke response",
    });

    expect(result.success).toBe(true);
    expect(admin._workflowHandoffRequestUpdateCalls).toHaveLength(1);
    expect(admin._workflowMilestoneUpdateCalls).toHaveLength(0);

    const forbiddenTables = [
      "workflow_instance_milestones",
      "jobs",
      "service_cases",
      "job_events",
      "internal_invoices",
      "internal_invoice_payments",
      "internal_invoice_payment_allocations",
      "customer_saved_payment_methods",
      "stripe_webhook_events",
      "outbound_sms_messages",
      "qbo_sync_events",
      "portal_notifications",
      "maintenance_agreements",
      "maintenance_agreement_memberships",
      "maintenance_agreement_billing_periods",
    ];

    for (const table of forbiddenTables) {
      expect(admin._tableCalls).not.toContain(table);
    }
  });
});

describe("completeWorkflowMilestoneFromCompletedHandoffRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({});
    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
        account_owner_user_id: "owner-1",
        role: "admin",
        is_active: true,
      },
    });
  });

  function buildCompletedHandoffFixture(overrides?: {
    workflowInstances?: MockWorkflowInstance[];
    workflowMilestones?: MockWorkflowMilestone[];
    workflowHandoffRequests?: MockWorkflowHandoffRequest[];
  }) {
    const admin = makeAdminFixture({
      workflowInstances: overrides?.workflowInstances ?? [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: overrides?.workflowMilestones ?? [
        {
          id: "ms-ecc",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_key: "ecc_handoff_completion",
          milestone_title: "ECC handoff/completion",
          milestone_status: "waiting",
          status_reason: "Rater marked ECC complete",
        },
      ],
      workflowHandoffRequests: overrides?.workflowHandoffRequests ?? [
        {
          id: "whr-1",
          installer_account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          workflow_instance_milestone_id: "ms-ecc",
          service_case_id: "case-1",
          source_job_id: "job-1",
          authorized_handoff_recipient_id: "ahr-1",
          recipient_type_snapshot: "external_manual",
          recipient_display_name_snapshot: "Smoke Rater A",
          handoff_kind: "ecc",
          handoff_status: "completed",
          sent_by_user_id: "user-2",
          sent_at: "2026-05-31T17:51:10.463Z",
          responded_by_user_id: "user-3",
          responded_at: "2026-05-31T18:10:10.463Z",
          response_note: "Certificate delivered.",
          evidence_reference: "CERT-2042",
          created_at: "2026-05-31T17:51:10.463Z",
          updated_at: "2026-05-31T18:10:10.463Z",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);
    return admin;
  }

  it("succeeds when a completed ECC handoff request exists", async () => {
    const admin = buildCompletedHandoffFixture();

    const result = await completeWorkflowMilestoneFromCompletedHandoffRequest({
      handoffRequestId: "whr-1",
      reviewNote: "Installer reviewed completed handoff.",
    });

    expect(result).toEqual({
      success: true,
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      status: "completed",
      statusReason:
        "Rater Smoke Rater A marked ECC complete | Response note: Certificate delivered. | Evidence: CERT-2042 | Installer review note: Installer reviewed completed handoff.",
    });

    expect(admin._workflowMilestoneUpdateCalls).toHaveLength(1);
    expect(admin._workflowMilestoneUpdateCalls[0]).toMatchObject({
      milestone_status: "completed",
      status_reason:
        "Rater Smoke Rater A marked ECC complete | Response note: Certificate delivered. | Evidence: CERT-2042 | Installer review note: Installer reviewed completed handoff.",
      updated_by_user_id: "user-1",
    });
    expect(admin._workflowHandoffRequestUpdateCalls).toHaveLength(0);

    const forbiddenTables = [
      "jobs",
      "service_cases",
      "job_events",
      "internal_invoices",
      "internal_invoice_payments",
      "internal_invoice_payment_allocations",
      "customer_saved_payment_methods",
      "stripe_webhook_events",
      "outbound_sms_messages",
      "qbo_sync_events",
      "portal_notifications",
      "maintenance_agreements",
      "maintenance_agreement_memberships",
      "maintenance_agreement_billing_periods",
    ];

    for (const table of forbiddenTables) {
      expect(admin._tableCalls).not.toContain(table);
    }
  });

  it("uses default installer review note when review_note is omitted", async () => {
    const admin = buildCompletedHandoffFixture();

    const result = await completeWorkflowMilestoneFromCompletedHandoffRequest({
      handoffRequestId: "whr-1",
    });

    expect(result).toEqual({
      success: true,
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      status: "completed",
      statusReason:
        "Rater Smoke Rater A marked ECC complete | Response note: Certificate delivered. | Evidence: CERT-2042 | Installer review note: Installer reviewed completed rater handoff.",
    });

    expect(admin._workflowMilestoneUpdateCalls).toHaveLength(1);
    expect(admin._workflowMilestoneUpdateCalls[0]).toMatchObject({
      milestone_status: "completed",
      status_reason:
        "Rater Smoke Rater A marked ECC complete | Response note: Certificate delivered. | Evidence: CERT-2042 | Installer review note: Installer reviewed completed rater handoff.",
      updated_by_user_id: "user-1",
    });
    expect(admin._workflowHandoffRequestUpdateCalls).toHaveLength(0);
  });

  it.each(["sent", "accepted", "rejected", "cancelled"] as const)("rejects %s handoff requests", async (handoffStatus) => {
    buildCompletedHandoffFixture({
      workflowHandoffRequests: [
        {
          id: "whr-1",
          installer_account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          workflow_instance_milestone_id: "ms-ecc",
          service_case_id: "case-1",
          source_job_id: "job-1",
          authorized_handoff_recipient_id: "ahr-1",
          recipient_type_snapshot: "external_manual",
          recipient_display_name_snapshot: "Smoke Rater A",
          handoff_kind: "ecc",
          handoff_status: handoffStatus,
          sent_by_user_id: "user-2",
          sent_at: "2026-05-31T17:51:10.463Z",
          responded_by_user_id: handoffStatus === "sent" ? null : "user-3",
          responded_at: handoffStatus === "sent" ? null : "2026-05-31T18:10:10.463Z",
          response_note: handoffStatus === "rejected" ? "Rejected for review." : handoffStatus === "accepted" ? "Accepted for review." : null,
          evidence_reference: null,
          created_at: "2026-05-31T17:51:10.463Z",
          updated_at: "2026-05-31T18:10:10.463Z",
        },
      ],
    });

    const result = await completeWorkflowMilestoneFromCompletedHandoffRequest({
      handoffRequestId: "whr-1",
    });

    expect(result).toEqual({
      success: false,
      error: "handoff_request_id must be completed before installer review can complete the ECC milestone.",
    });
  });

  it("rejects non-ECC handoffs", async () => {
    buildCompletedHandoffFixture({
      workflowHandoffRequests: [
        {
          id: "whr-1",
          installer_account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          workflow_instance_milestone_id: "ms-ecc",
          service_case_id: "case-1",
          source_job_id: "job-1",
          authorized_handoff_recipient_id: "ahr-1",
          recipient_type_snapshot: "external_manual",
          recipient_display_name_snapshot: "Smoke Rater A",
          handoff_kind: "general_future",
          handoff_status: "completed",
          sent_by_user_id: "user-2",
          sent_at: "2026-05-31T17:51:10.463Z",
        },
      ],
    });

    const result = await completeWorkflowMilestoneFromCompletedHandoffRequest({
      handoffRequestId: "whr-1",
    });

    expect(result).toEqual({
      success: false,
      error: "handoff_request_id is not an ECC handoff request.",
    });
  });

  it("rejects cross-account requests", async () => {
    buildCompletedHandoffFixture({
      workflowHandoffRequests: [
        {
          id: "whr-1",
          installer_account_owner_user_id: "owner-2",
          workflow_instance_id: "wf-1",
          workflow_instance_milestone_id: "ms-ecc",
          service_case_id: "case-1",
          source_job_id: "job-1",
          authorized_handoff_recipient_id: "ahr-1",
          recipient_type_snapshot: "external_manual",
          recipient_display_name_snapshot: "Smoke Rater A",
          handoff_kind: "ecc",
          handoff_status: "completed",
          sent_by_user_id: "user-2",
          sent_at: "2026-05-31T17:51:10.463Z",
        },
      ],
    });

    const result = await completeWorkflowMilestoneFromCompletedHandoffRequest({
      handoffRequestId: "whr-1",
    });

    expect(result).toEqual({
      success: false,
      error: "handoff_request_id not found in this account.",
    });
  });

  it("rejects milestone and workflow mismatches", async () => {
    buildCompletedHandoffFixture({
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
        {
          id: "wf-2",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-ecc",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-2",
          milestone_key: "ecc_handoff_completion",
          milestone_title: "ECC handoff/completion",
          milestone_status: "waiting",
        },
      ],
      workflowHandoffRequests: [
        {
          id: "whr-1",
          installer_account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          workflow_instance_milestone_id: "ms-ecc",
          service_case_id: "case-1",
          source_job_id: "job-1",
          authorized_handoff_recipient_id: "ahr-1",
          recipient_type_snapshot: "external_manual",
          recipient_display_name_snapshot: "Smoke Rater A",
          handoff_kind: "ecc",
          handoff_status: "completed",
          sent_by_user_id: "user-2",
          sent_at: "2026-05-31T17:51:10.463Z",
          responded_by_user_id: "user-3",
          responded_at: "2026-05-31T18:10:10.463Z",
          response_note: "Certificate delivered.",
          evidence_reference: "CERT-2042",
        },
      ],
    });

    const result = await completeWorkflowMilestoneFromCompletedHandoffRequest({
      handoffRequestId: "whr-1",
    });

    expect(result).toEqual({
      success: false,
      error: "milestone_id does not belong to workflow_instance_id.",
    });
  });
});

describe("linkInternalEccJobToWorkflowMilestone", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({});
    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
        account_owner_user_id: "owner-1",
        role: "admin",
        is_active: true,
      },
    });
  });

  it("links valid same-account same-service-case ECC job to ECC milestone", async () => {
    const admin = makeAdminFixture({
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-ecc",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_key: "ecc_handoff_completion",
          milestone_title: "ECC handoff/completion",
          milestone_status: "in_progress",
        },
      ],
      jobs: [
        {
          id: "job-ecc-1",
          customer_id: "cust-1",
          service_case_id: "case-1",
          job_type: "ecc",
          deleted_at: null,
        },
      ],
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await linkInternalEccJobToWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      jobId: "job-ecc-1",
    });

    expect(result).toEqual({
      success: true,
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      jobId: "job-ecc-1",
      workflowInstanceJobLinkId: "lnk-1",
      created: true,
    });

    expect(admin._workflowJobLinkInsertCalls).toHaveLength(1);
    expect(admin._workflowJobLinkInsertCalls[0][0]).toMatchObject({
      workflow_instance_id: "wf-1",
      workflow_instance_milestone_id: "ms-ecc",
      job_id: "job-ecc-1",
      link_role: "supporting",
      is_primary: false,
    });
  });

  it("rejects non-ECC milestone", async () => {
    const admin = makeAdminFixture({
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-install",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_key: "install_work",
          milestone_title: "Install work",
          milestone_status: "ready",
        },
      ],
      jobs: [
        {
          id: "job-ecc-1",
          customer_id: "cust-1",
          service_case_id: "case-1",
          job_type: "ecc",
          deleted_at: null,
        },
      ],
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await linkInternalEccJobToWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-install",
      jobId: "job-ecc-1",
    });

    expect(result).toEqual({
      success: false,
      error: "milestone_id is not ECC handoff/completion milestone.",
    });
    expect(admin._workflowJobLinkInsertCalls).toHaveLength(0);
  });

  it("rejects cross-account job", async () => {
    const admin = makeAdminFixture({
      customers: [{ id: "cust-1", owner_user_id: "owner-2" }],
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-ecc",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_key: "ecc_handoff_completion",
          milestone_title: "ECC handoff/completion",
          milestone_status: "ready",
        },
      ],
      jobs: [
        {
          id: "job-ecc-1",
          customer_id: "cust-1",
          service_case_id: "case-1",
          job_type: "ecc",
          deleted_at: null,
        },
      ],
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await linkInternalEccJobToWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      jobId: "job-ecc-1",
    });

    expect(result).toEqual({
      success: false,
      error: "job_id not found in this account.",
    });
    expect(admin._workflowJobLinkInsertCalls).toHaveLength(0);
  });

  it("rejects job from different service_case_id", async () => {
    const admin = makeAdminFixture({
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-ecc",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_key: "ecc_handoff_completion",
          milestone_title: "ECC handoff/completion",
          milestone_status: "ready",
        },
      ],
      jobs: [
        {
          id: "job-ecc-1",
          customer_id: "cust-1",
          service_case_id: "case-2",
          job_type: "ecc",
          deleted_at: null,
        },
      ],
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await linkInternalEccJobToWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      jobId: "job-ecc-1",
    });

    expect(result).toEqual({
      success: false,
      error: "job_id must belong to the same service_case_id as workflow_instance_id.",
    });
    expect(admin._workflowJobLinkInsertCalls).toHaveLength(0);
  });

  it("rejects deleted job", async () => {
    const admin = makeAdminFixture({
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-ecc",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_key: "ecc_handoff_completion",
          milestone_title: "ECC handoff/completion",
          milestone_status: "ready",
        },
      ],
      jobs: [
        {
          id: "job-ecc-1",
          customer_id: "cust-1",
          service_case_id: "case-1",
          job_type: "ecc",
          deleted_at: "2026-05-30T00:00:00.000Z",
        },
      ],
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await linkInternalEccJobToWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      jobId: "job-ecc-1",
    });

    expect(result).toEqual({
      success: false,
      error: "job_id is deleted and cannot be linked.",
    });
    expect(admin._workflowJobLinkInsertCalls).toHaveLength(0);
  });

  it("rejects non-ECC job type", async () => {
    const admin = makeAdminFixture({
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-ecc",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_key: "ecc_handoff_completion",
          milestone_title: "ECC handoff/completion",
          milestone_status: "ready",
        },
      ],
      jobs: [
        {
          id: "job-service-1",
          customer_id: "cust-1",
          service_case_id: "case-1",
          job_type: "service",
          deleted_at: null,
        },
      ],
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await linkInternalEccJobToWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      jobId: "job-service-1",
    });

    expect(result).toEqual({
      success: false,
      error: "job_id must be an ECC job.",
    });
    expect(admin._workflowJobLinkInsertCalls).toHaveLength(0);
  });

  it("treats duplicate link as idempotent", async () => {
    const admin = makeAdminFixture({
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-ecc",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_key: "ecc_handoff_completion",
          milestone_title: "ECC handoff/completion",
          milestone_status: "ready",
        },
      ],
      workflowJobLinks: [
        {
          id: "lnk-existing",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          workflow_instance_milestone_id: "ms-ecc",
          job_id: "job-ecc-1",
          link_role: "supporting",
          is_primary: false,
        },
      ],
      jobs: [
        {
          id: "job-ecc-1",
          customer_id: "cust-1",
          service_case_id: "case-1",
          job_type: "ecc",
          deleted_at: null,
        },
      ],
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await linkInternalEccJobToWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      jobId: "job-ecc-1",
    });

    expect(result).toEqual({
      success: true,
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      jobId: "job-ecc-1",
      workflowInstanceJobLinkId: "lnk-existing",
      created: false,
    });
    expect(admin._workflowJobLinkInsertCalls).toHaveLength(0);
  });

  it("does not mutate jobs/service_cases/job_events or billing/sms/qbo/portal tables", async () => {
    const admin = makeAdminFixture({
      customers: [{ id: "cust-1", owner_user_id: "owner-1" }],
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-ecc",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_key: "ecc_handoff_completion",
          milestone_title: "ECC handoff/completion",
          milestone_status: "ready",
        },
      ],
      jobs: [
        {
          id: "job-ecc-1",
          customer_id: "cust-1",
          service_case_id: "case-1",
          job_type: "ecc",
          deleted_at: null,
        },
      ],
    });
    createAdminClientMock.mockReturnValue(admin);

    const result = await linkInternalEccJobToWorkflowMilestone({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-ecc",
      jobId: "job-ecc-1",
    });

    expect(result.success).toBe(true);

    const forbiddenTables = [
      "service_cases",
      "job_events",
      "internal_invoices",
      "internal_invoice_payments",
      "internal_invoice_payment_allocations",
      "customer_saved_payment_methods",
      "stripe_webhook_events",
      "outbound_sms_messages",
      "qbo_sync_events",
      "portal_notifications",
    ];

    for (const table of forbiddenTables) {
      expect(admin._tableCalls).not.toContain(table);
    }
    expect(admin._workflowMilestoneUpdateCalls).toHaveLength(0);
  });
});

describe("updateWorkflowMilestoneStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({});
    requireInternalUserMock.mockResolvedValue({
      userId: "user-1",
      internalUser: {
        user_id: "user-1",
        account_owner_user_id: "owner-1",
        role: "admin",
        is_active: true,
      },
    });
  });

  it("updates milestone status when workflow and milestone are in account scope", async () => {
    const admin = makeAdminFixture({
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-1",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_status: "ready",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await updateWorkflowMilestoneStatus({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-1",
      status: "completed",
      statusReason: "Operator confirmed completion",
    });

    expect(result).toEqual({
      success: true,
      workflowInstanceId: "wf-1",
      milestoneId: "ms-1",
      status: "completed",
    });

    expect(admin._workflowMilestoneUpdateCalls).toHaveLength(1);
    expect(admin._workflowMilestones[0]).toMatchObject({
      id: "ms-1",
      milestone_status: "completed",
      status_reason: "Operator confirmed completion",
      updated_by_user_id: "user-1",
    });
  });

  it("rejects invalid status values", async () => {
    const admin = makeAdminFixture({
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-1",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_status: "ready",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await updateWorkflowMilestoneStatus({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-1",
      status: "not_a_real_status",
    });

    expect(result).toEqual({
      success: false,
      error: "Invalid milestone status.",
    });
    expect(admin._workflowMilestoneUpdateCalls).toHaveLength(0);
  });

  it("rejects workflow instance outside account scope", async () => {
    const admin = makeAdminFixture({
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-2",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-1",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_status: "ready",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await updateWorkflowMilestoneStatus({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-1",
      status: "completed",
    });

    expect(result).toEqual({
      success: false,
      error: "workflow_instance_id not found in this account.",
    });
    expect(admin._workflowMilestoneUpdateCalls).toHaveLength(0);
  });

  it("rejects milestone/workflow mismatch", async () => {
    const admin = makeAdminFixture({
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-1",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-2",
          milestone_status: "ready",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await updateWorkflowMilestoneStatus({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-1",
      status: "completed",
    });

    expect(result).toEqual({
      success: false,
      error: "milestone_id does not belong to workflow_instance_id.",
    });
    expect(admin._workflowMilestoneUpdateCalls).toHaveLength(0);
  });

  it("does not mutate job/service_case/job_events or billing/sms/qbo/portal tables", async () => {
    const admin = makeAdminFixture({
      workflowInstances: [
        {
          id: "wf-1",
          account_owner_user_id: "owner-1",
          service_case_id: "case-1",
          workflow_preset_template_id: "tpl-1",
          workflow_status: "active",
        },
      ],
      workflowMilestones: [
        {
          id: "ms-1",
          account_owner_user_id: "owner-1",
          workflow_instance_id: "wf-1",
          milestone_status: "ready",
        },
      ],
    });

    createAdminClientMock.mockReturnValue(admin);

    const result = await updateWorkflowMilestoneStatus({
      workflowInstanceId: "wf-1",
      milestoneId: "ms-1",
      status: "completed",
    });

    expect(result.success).toBe(true);

    const forbiddenTables = [
      "jobs",
      "service_cases",
      "job_events",
      "internal_invoices",
      "internal_invoice_payments",
      "internal_invoice_payment_allocations",
      "customer_saved_payment_methods",
      "stripe_webhook_events",
      "outbound_sms_messages",
      "qbo_sync_events",
      "portal_notifications",
    ];

    for (const table of forbiddenTables) {
      expect(admin._tableCalls).not.toContain(table);
    }
  });
});
