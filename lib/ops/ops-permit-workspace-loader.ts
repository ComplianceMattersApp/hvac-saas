import {
  listInternalPermitRequestAttachmentsForAccount,
  type PermitRequestAttachmentLink,
  type PermitRequestAttachmentReadResult,
} from "@/lib/permits/permit-request-attachments-read-model";
import type { PermitRequestQueueRow } from "@/lib/permits/permit-requests-read-model";
import { formatTimestampInAccountTimeZone } from "@/lib/utils/account-time-zone";

const USD_CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export type OpsPermitWorkspaceAttachment = PermitRequestAttachmentLink & {
  createdAtDisplay: string;
  sizeLabel: string | null;
  typeLabel: string;
};

export type OpsPermitWorkspaceRow = {
  attachments: OpsPermitWorkspaceAttachment[];
  display: {
    address: string | null;
    context: string;
    customerName: string | null;
    submitted: string;
    title: string;
    totalValue: string | null;
    updatedAt: string;
  };
  permitRequest: PermitRequestQueueRow;
};

export type OpsPermitWorkspaceSnapshot = {
  attachmentSchemaAvailable: boolean;
  rows: OpsPermitWorkspaceRow[];
};

function formatPermitTimestamp(value: string | null | undefined, accountTimeZone: string) {
  return formatTimestampInAccountTimeZone(
    value,
    accountTimeZone,
    {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    },
    "Not available",
  );
}

function permitQueueContext(row: PermitRequestQueueRow) {
  const parts = [
    row.jobContext?.title,
    row.jobContext?.customerName,
    row.jobContext?.location,
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);

  return parts.length ? parts.join(" · ") : "Permit paperwork request";
}

function formatPermitAttachmentType(
  contentType: string | null | undefined,
  fileName: string | null | undefined,
) {
  const normalizedType = String(contentType ?? "").trim();
  if (normalizedType) return normalizedType;

  const normalizedName = String(fileName ?? "").trim();
  const extension = normalizedName.includes(".") ? normalizedName.split(".").pop() : "";
  return extension ? extension.toUpperCase() : "File";
}

function formatPermitAttachmentSize(fileSize: number | null | undefined) {
  if (!Number.isFinite(fileSize ?? Number.NaN) || !fileSize) return null;
  if (fileSize < 1024) return `${fileSize} B`;
  if (fileSize < 1024 * 1024) return `${Math.round(fileSize / 1024)} KB`;
  return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
}

function joinPermitAddress(row: PermitRequestQueueRow) {
  const address = [
    row.addressLine1Snapshot,
    row.addressLine2Snapshot,
    row.citySnapshot,
    row.stateSnapshot,
    row.zipSnapshot,
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(", ");

  return address || null;
}

function joinPermitCustomerName(row: PermitRequestQueueRow) {
  const customerName = [row.customerFirstNameSnapshot, row.customerLastNameSnapshot]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");

  return customerName || null;
}

function buildAttachmentView(
  attachment: PermitRequestAttachmentLink,
  accountTimeZone: string,
): OpsPermitWorkspaceAttachment {
  return {
    ...attachment,
    createdAtDisplay: formatPermitTimestamp(attachment.createdAt, accountTimeZone),
    sizeLabel: formatPermitAttachmentSize(attachment.fileSize),
    typeLabel: formatPermitAttachmentType(attachment.contentType, attachment.fileName),
  };
}

export function buildOpsPermitWorkspaceSnapshot(params: {
  accountTimeZone: string;
  attachmentResult: PermitRequestAttachmentReadResult;
  rows: PermitRequestQueueRow[];
}): OpsPermitWorkspaceSnapshot {
  return {
    attachmentSchemaAvailable: params.attachmentResult.schemaAvailable,
    rows: params.rows.map((permitRequest) => ({
      attachments: (params.attachmentResult.attachmentsByPermitRequestId[permitRequest.id] ?? [])
        .map((attachment) => buildAttachmentView(attachment, params.accountTimeZone)),
      display: {
        address: joinPermitAddress(permitRequest),
        context: permitQueueContext(permitRequest),
        customerName: joinPermitCustomerName(permitRequest),
        submitted: `${permitRequest.submittedAgeDays} days ago · ${formatPermitTimestamp(permitRequest.createdAt, params.accountTimeZone)}`,
        title: permitRequest.requestLabel || "Permit Request",
        totalValue: permitRequest.totalValueCents === null
          ? null
          : USD_CURRENCY_FORMATTER.format(permitRequest.totalValueCents / 100),
        updatedAt: formatPermitTimestamp(permitRequest.updatedAt, params.accountTimeZone),
      },
      permitRequest,
    })),
  };
}

export async function loadOpsPermitWorkspaceSnapshot(params: {
  accountOwnerUserId: string;
  accountTimeZone: string;
  rows: PermitRequestQueueRow[];
}): Promise<OpsPermitWorkspaceSnapshot> {
  const attachmentResult = params.rows.length
    ? await listInternalPermitRequestAttachmentsForAccount({
        accountOwnerUserId: params.accountOwnerUserId,
        permitRequestIds: params.rows.map((row) => row.id),
      })
    : { schemaAvailable: true, attachmentsByPermitRequestId: {} };

  return buildOpsPermitWorkspaceSnapshot({
    accountTimeZone: params.accountTimeZone,
    attachmentResult,
    rows: params.rows,
  });
}
