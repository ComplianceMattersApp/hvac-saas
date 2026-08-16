import { describe, expect, it } from "vitest";

import { buildOpsPermitWorkspaceSnapshot } from "@/lib/ops/ops-permit-workspace-loader";
import type { PermitRequestQueueRow } from "@/lib/permits/permit-requests-read-model";

function permitRequest(
  values: Partial<PermitRequestQueueRow> = {},
): PermitRequestQueueRow {
  return {
    acceptedAt: null,
    accountOwnerUserId: "owner-1",
    addressLine1Snapshot: "123 Main St",
    addressLine2Snapshot: "Suite 4",
    citySnapshot: "Sacramento",
    completedAt: null,
    contractorId: "contractor-1",
    contractorIntakeSubmissionId: null,
    contractorName: "Capital HVAC",
    contractorNote: null,
    contractorStatusLabel: "Submitted",
    createdAt: "2026-08-16T12:30:00.000Z",
    customerEmailSnapshot: "alex@example.com",
    customerFirstNameSnapshot: "Alex",
    customerLastNameSnapshot: "Rivera",
    customerPhoneSnapshot: "555-0100",
    holdReason: null,
    id: "permit-1",
    internalIntakeNote: null,
    internalStatusLabel: "New request",
    jobContext: {
      id: "job-1",
      title: "ECC Test",
      customerName: "Alex Rivera",
      location: "Sacramento",
    },
    jobId: "job-1",
    jurisdiction: "City of Sacramento",
    onHoldAt: null,
    permitDate: null,
    permitNumber: null,
    postPermitRoute: null,
    requestLabel: "Signed contract permit",
    serviceAddressTextSnapshot: "123 Main St",
    serviceCaseId: null,
    stateSnapshot: "CA",
    status: "permit_request",
    submittedAgeDays: 3,
    totalValueCents: 123456,
    updatedAt: "2026-08-16T13:45:00.000Z",
    zipSnapshot: "95814",
    ...values,
  };
}

describe("Operations permit workspace snapshot", () => {
  it("derives card and attachment display values from one typed snapshot", () => {
    const snapshot = buildOpsPermitWorkspaceSnapshot({
      accountTimeZone: "America/Los_Angeles",
      attachmentResult: {
        schemaAvailable: true,
        attachmentsByPermitRequestId: {
          "permit-1": [
            {
              caption: null,
              contentType: null,
              createdAt: "2026-08-16T12:40:00.000Z",
              fileName: "application.pdf",
              fileSize: 2048,
              id: "attachment-1",
              permitRequestId: "permit-1",
              signedUrl: "https://example.test/application.pdf",
            },
          ],
        },
      },
      rows: [permitRequest()],
    });

    expect(snapshot.attachmentSchemaAvailable).toBe(true);
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0].display).toMatchObject({
      address: "123 Main St, Suite 4, Sacramento, CA, 95814",
      context: "ECC Test · Alex Rivera · Sacramento",
      customerName: "Alex Rivera",
      title: "Signed contract permit",
      totalValue: "$1,234.56",
    });
    expect(snapshot.rows[0].display.submitted).toContain("3 days ago · Aug 16");
    expect(snapshot.rows[0].display.updatedAt).toContain("Aug 16");
    expect(snapshot.rows[0].attachments[0]).toMatchObject({
      fileName: "application.pdf",
      sizeLabel: "2 KB",
      typeLabel: "PDF",
    });
    expect(snapshot.rows[0].attachments[0].createdAtDisplay).toContain("Aug 16");
  });

  it("keeps empty and unavailable attachment states explicit without losing permit rows", () => {
    const snapshot = buildOpsPermitWorkspaceSnapshot({
      accountTimeZone: "America/Los_Angeles",
      attachmentResult: {
        schemaAvailable: false,
        attachmentsByPermitRequestId: {},
      },
      rows: [
        permitRequest({
          addressLine1Snapshot: null,
          addressLine2Snapshot: null,
          citySnapshot: null,
          customerFirstNameSnapshot: null,
          customerLastNameSnapshot: null,
          jobContext: null,
          requestLabel: null,
          stateSnapshot: null,
          totalValueCents: null,
          zipSnapshot: null,
        }),
      ],
    });

    expect(snapshot.attachmentSchemaAvailable).toBe(false);
    expect(snapshot.rows[0].attachments).toEqual([]);
    expect(snapshot.rows[0].display).toMatchObject({
      address: null,
      context: "Permit paperwork request",
      customerName: null,
      title: "Permit Request",
      totalValue: null,
    });
  });
});
