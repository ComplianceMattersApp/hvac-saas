import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import ServiceLocationAddressFields from "@/components/addresses/ServiceLocationAddressFields";
import ImmediateSubmitButton from "@/components/ImmediateSubmitButton";
import QueueCard from "@/components/ops/QueueCard";
import type {
  OpsPermitWorkspaceAttachment,
  OpsPermitWorkspaceRow,
  OpsPermitWorkspaceSnapshot,
} from "@/lib/ops/ops-permit-workspace-loader";
import type { PermitRequestQueueRow } from "@/lib/permits/permit-requests-read-model";
import {
  acceptPermitRequestFromOps,
  createJobAndMarkPermitCreatedFromOps,
  createManualPermitRequestFromOps,
  holdPermitRequestFromOps,
  markPermitCreatedFromOps,
  markPermitRequestNotNeededFromOps,
  resumePermitRequestFromOps,
  updatePermitRequestIntakeFromOps,
} from "../_actions/permit-workspace-actions";

const CONTROL_BASE_CLASS = "min-w-0 w-full border border-slate-300 bg-white text-sm font-medium text-slate-900";
const LABEL_CLASS = "grid min-w-0 gap-1 text-xs font-semibold text-slate-600";

type WorkspaceContractor = {
  id: string;
  name: string | null;
};

type LabeledInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  className?: string;
  label: ReactNode;
  wrapperClassName?: string;
};

function LabeledInput({ className, label, wrapperClassName, ...inputProps }: LabeledInputProps) {
  return (
    <label className={`${LABEL_CLASS} ${wrapperClassName ?? ""}`}>
      {label}
      <input
        {...inputProps}
        className={`${CONTROL_BASE_CLASS} ${className ?? "min-h-9 rounded-lg px-2.5 py-1.5"}`}
      />
    </label>
  );
}

type LabeledTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> & {
  className?: string;
  label: ReactNode;
  wrapperClassName?: string;
};

function LabeledTextarea({ className, label, wrapperClassName, ...textareaProps }: LabeledTextareaProps) {
  return (
    <label className={`${LABEL_CLASS} ${wrapperClassName ?? ""}`}>
      {label}
      <textarea
        {...textareaProps}
        className={`${CONTROL_BASE_CLASS} ${className ?? "rounded-lg px-2.5 py-2"}`}
      />
    </label>
  );
}

type LabeledSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
  children: ReactNode;
  className?: string;
  label: ReactNode;
  wrapperClassName?: string;
};

function LabeledSelect({ children, className, label, wrapperClassName, ...selectProps }: LabeledSelectProps) {
  return (
    <label className={`${LABEL_CLASS} ${wrapperClassName ?? ""}`}>
      {label}
      <select
        {...selectProps}
        className={`${CONTROL_BASE_CLASS} ${className ?? "min-h-9 rounded-lg px-2.5 py-1.5"}`}
      >
        {children}
      </select>
    </label>
  );
}

function PermitCreateRequestForm({
  contractors,
  expanded,
}: {
  contractors: WorkspaceContractor[];
  expanded: boolean;
}) {
  const contractorUnavailable = contractors.length === 0;

  return (
    <details
      id="permit-request-create"
      open={expanded}
      className="mb-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
    >
      <summary className="list-none cursor-pointer px-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[13px] font-semibold text-blue-700">+ New Permit Request</div>
            <div className="mt-0.5 text-xs text-slate-600">
              Create one from a text, phone call, email, or photo request.
            </div>
          </div>
          <div className="inline-flex min-h-8 items-center rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            Open form
          </div>
        </div>
      </summary>
      <div className="border-t border-slate-200 px-3 pb-3 pt-3">
        <form action={createManualPermitRequestFromOps} className="grid gap-2 lg:grid-cols-2">
          <LabeledSelect
            label="Contractor"
            name="contractor_id"
            required
            disabled={contractorUnavailable}
            className="min-h-10 rounded-xl px-3 py-2 disabled:bg-slate-100 disabled:text-slate-500"
          >
            <option value="">Select contractor</option>
            {contractors.map((contractor) => (
              <option key={contractor.id} value={contractor.id}>
                {contractor.name || contractor.id}
              </option>
            ))}
          </LabeledSelect>
          <LabeledInput
            label={<>Short request label <span className="font-normal text-slate-400">(optional)</span></>}
            name="request_label"
            maxLength={160}
            placeholder="Permit needed for signed contract"
            className="min-h-10 rounded-xl px-3 py-2"
          />
          <LabeledInput label="Customer first name" name="customer_first_name" maxLength={120} className="min-h-10 rounded-xl px-3 py-2" />
          <LabeledInput label="Customer last name" name="customer_last_name" maxLength={120} className="min-h-10 rounded-xl px-3 py-2" />
          <LabeledInput label="Customer email" name="customer_email" type="email" autoComplete="email" maxLength={240} className="min-h-10 rounded-xl px-3 py-2" />
          <LabeledInput label="Customer phone" name="customer_phone" type="tel" autoComplete="tel" maxLength={80} className="min-h-10 rounded-xl px-3 py-2" />
          <ServiceLocationAddressFields
            addressLine1Name="service_address_text"
            compact
            className="lg:col-span-2"
          />
          <LabeledInput label="Jurisdiction" name="jurisdiction" maxLength={160} className="min-h-10 rounded-xl px-3 py-2" />
          <LabeledTextarea
            label={<>Intake note <span className="font-normal text-slate-400">(optional)</span></>}
            name="intake_note"
            rows={3}
            maxLength={4000}
            placeholder="What did Compliance Matters receive?"
            wrapperClassName="lg:col-span-2"
            className="rounded-xl px-3 py-2"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 lg:col-span-2">
            <div className="text-xs text-slate-500">
              If blank, the request label is created from the customer or service address.
            </div>
            <ImmediateSubmitButton
              disabled={contractorUnavailable}
              pendingText="Creating permit..."
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
            >
              Create Permit Request
            </ImmediateSubmitButton>
          </div>
        </form>
      </div>
    </details>
  );
}

function PermitLifecycleActions({ permitRequest }: { permitRequest: PermitRequestQueueRow }) {
  return (
    <div className="mt-2 flex flex-wrap justify-end gap-1.5">
      {permitRequest.status === "permit_request" ? (
        <form action={acceptPermitRequestFromOps}>
          <input type="hidden" name="permit_request_id" value={permitRequest.id} />
          <ImmediateSubmitButton pendingText="Starting..." className="inline-flex min-h-8 items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[12px] font-semibold text-emerald-800 transition-colors hover:bg-emerald-100">
            Accept / Start Permit
          </ImmediateSubmitButton>
        </form>
      ) : null}
      {permitRequest.status === "permit_request" || permitRequest.status === "accepted_in_process" ? (
        <form action={holdPermitRequestFromOps}>
          <input type="hidden" name="permit_request_id" value={permitRequest.id} />
          <ImmediateSubmitButton pendingText="Updating..." className="inline-flex min-h-8 items-center rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[12px] font-semibold text-amber-800 transition-colors hover:bg-amber-100">
            Put On Hold
          </ImmediateSubmitButton>
        </form>
      ) : null}
      {permitRequest.status === "on_hold_additional_info_needed" ? (
        <form action={resumePermitRequestFromOps}>
          <input type="hidden" name="permit_request_id" value={permitRequest.id} />
          <ImmediateSubmitButton pendingText="Resuming..." className="inline-flex min-h-8 items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[12px] font-semibold text-blue-800 transition-colors hover:bg-blue-100">
            Resume / In Process
          </ImmediateSubmitButton>
        </form>
      ) : null}
    </div>
  );
}

function PermitNotNeededForm({ permitRequestId }: { permitRequestId: string }) {
  return (
    <details className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
      <summary className="cursor-pointer text-[12px] font-semibold text-slate-600">
        Permit No Longer Needed
      </summary>
      <form action={markPermitRequestNotNeededFromOps} className="mt-2 grid gap-2">
        <input type="hidden" name="permit_request_id" value={permitRequestId} />
        <LabeledTextarea
          label="Reason"
          name="reason"
          required
          maxLength={500}
          rows={2}
          placeholder="Why is this permit request no longer needed?"
        />
        <div className="text-xs text-slate-500">
          This removes the request from the active queue and preserves its history.
        </div>
        <ImmediateSubmitButton pendingText="Removing..." className="justify-self-start rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">
          Mark Not Needed
        </ImmediateSubmitButton>
      </form>
    </details>
  );
}

function PermitAttachmentList({ attachments }: { attachments: OpsPermitWorkspaceAttachment[] }) {
  return (
    <div className="mt-3 border-t border-slate-200 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[12px] font-semibold text-slate-700">Submitted files</div>
        <div className="text-[11px] font-medium text-slate-500">
          {attachments.length} {attachments.length === 1 ? "file" : "files"}
        </div>
      </div>
      {attachments.length === 0 ? (
        <div className="mt-1 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
          No files attached.
        </div>
      ) : (
        <div className="mt-1 space-y-1.5">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
            >
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-800" title={attachment.fileName}>
                  {attachment.fileName}
                </div>
                <div className="mt-0.5 text-slate-500">
                  {[attachment.typeLabel, attachment.sizeLabel, attachment.createdAtDisplay]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              {attachment.signedUrl ? (
                <a
                  href={attachment.signedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-8 items-center rounded-md border border-slate-300 bg-slate-50 px-2 py-1 font-semibold text-slate-700 transition-colors hover:bg-white"
                >
                  Open
                </a>
              ) : (
                <span className="text-[11px] font-medium text-slate-400">Unavailable</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PermitIntakeEditor({ row }: { row: OpsPermitWorkspaceRow }) {
  const { attachments, permitRequest } = row;

  return (
    <details className="mt-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
      <summary className="cursor-pointer text-[12px] font-semibold text-blue-700">
        Edit Permit Intake
      </summary>
      <form action={updatePermitRequestIntakeFromOps} className="mt-2 grid gap-2 md:grid-cols-2">
        <input type="hidden" name="permit_request_id" value={permitRequest.id} />
        <LabeledInput label="Request label" name="request_label" defaultValue={permitRequest.requestLabel ?? ""} maxLength={160} />
        <LabeledInput label="Jurisdiction" name="jurisdiction" defaultValue={permitRequest.jurisdiction ?? ""} maxLength={160} />
        <LabeledInput label="Customer first name" name="customer_first_name_snapshot" defaultValue={permitRequest.customerFirstNameSnapshot ?? ""} maxLength={120} />
        <LabeledInput label="Customer last name" name="customer_last_name_snapshot" defaultValue={permitRequest.customerLastNameSnapshot ?? ""} maxLength={120} />
        <LabeledInput label="Customer email" name="customer_email_snapshot" type="email" autoComplete="email" defaultValue={permitRequest.customerEmailSnapshot ?? ""} maxLength={240} />
        <LabeledInput label="Customer phone" name="customer_phone_snapshot" type="tel" autoComplete="tel" defaultValue={permitRequest.customerPhoneSnapshot ?? ""} maxLength={80} />
        <LabeledInput label="Street address" name="service_address_text_snapshot" defaultValue={permitRequest.addressLine1Snapshot ?? ""} maxLength={240} wrapperClassName="md:col-span-2" />
        <LabeledInput label="Address line 2" name="address_line2_snapshot" defaultValue={permitRequest.addressLine2Snapshot ?? ""} maxLength={240} wrapperClassName="md:col-span-2" />
        <LabeledInput label="City" name="city_snapshot" defaultValue={permitRequest.citySnapshot ?? ""} maxLength={120} />
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <LabeledInput label="State" name="state_snapshot" defaultValue={permitRequest.stateSnapshot ?? ""} maxLength={40} className="uppercase" />
          <LabeledInput label="ZIP" name="zip_snapshot" defaultValue={permitRequest.zipSnapshot ?? ""} inputMode="numeric" maxLength={40} />
        </div>
        <LabeledInput label="Permit number" name="permit_number" defaultValue={permitRequest.permitNumber ?? ""} maxLength={160} />
        <LabeledInput label="Permit date" type="date" name="permit_date" defaultValue={permitRequest.permitDate ?? ""} />
        <LabeledInput
          label="Total value"
          type="number"
          name="total_value"
          min="0"
          step="0.01"
          inputMode="decimal"
          defaultValue={permitRequest.totalValueCents === null ? "" : (permitRequest.totalValueCents / 100).toFixed(2)}
        />
        <LabeledTextarea label="Internal intake note" name="internal_intake_note" defaultValue={permitRequest.internalIntakeNote ?? ""} rows={3} maxLength={4000} wrapperClassName="md:col-span-2" />
        <LabeledTextarea label="Contractor note" name="contractor_note" defaultValue={permitRequest.contractorNote ?? ""} rows={3} maxLength={4000} wrapperClassName="md:col-span-2" />
        <div className="flex justify-end md:col-span-2">
          <ImmediateSubmitButton pendingText="Saving intake..." className="inline-flex min-h-9 items-center rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800">
            Save Intake Details
          </ImmediateSubmitButton>
        </div>
      </form>
      <PermitAttachmentList attachments={attachments} />
    </details>
  );
}

function PermitRouteFields({
  permitRequest,
  unlinked,
}: {
  permitRequest: PermitRequestQueueRow;
  unlinked: boolean;
}) {
  return (
    <>
      <LabeledInput label="Permit number" name="permit_number" defaultValue={permitRequest.permitNumber ?? ""} maxLength={160} required />
      {unlinked ? (
        <LabeledSelect label="ECC project type" name="project_type" defaultValue="alteration">
          <option value="alteration">Alteration</option>
          <option value="all_new">All New</option>
        </LabeledSelect>
      ) : (
        <LabeledInput label="Permit date" type="date" name="permit_date" defaultValue={permitRequest.permitDate ?? ""} />
      )}
      {unlinked ? (
        <LabeledSelect label="Billing party" name="billing_recipient" defaultValue="contractor">
          <option value="contractor">Contractor</option>
          <option value="customer">Customer</option>
        </LabeledSelect>
      ) : null}
      {unlinked ? (
        <LabeledInput label="Permit date" type="date" name="permit_date" defaultValue={permitRequest.permitDate ?? ""} />
      ) : null}
      <LabeledInput label="Jurisdiction" name="jurisdiction" defaultValue={permitRequest.jurisdiction ?? ""} maxLength={160} />
      <LabeledSelect label="Is the job ready to be tested?" name="post_permit_route" required defaultValue="">
        <option value="" disabled>Select next step</option>
        <option value="ready_for_testing">Ready - schedule now or queue for scheduling</option>
        <option value="pending_install">Waiting for install</option>
      </LabeledSelect>
      <div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[12px] leading-5 text-slate-700 md:col-span-2">
        <div>
          <span className="font-semibold text-slate-700">Ready:</span>{" "}
          {unlinked
            ? "Creates an unscheduled ECC testing job and places it in the waiting to be scheduled queue."
            : "Moves the linked job to scheduling when it is unscheduled, or keeps it scheduled if it already has a time."}
        </div>
        <div>
          <span className="font-semibold text-slate-700">Waiting for install:</span>{" "}
          {unlinked
            ? "Creates an ECC testing job and places it in Waiting / Pending Info as On Hold: Permit pulled and waiting for install."
            : "Moves the linked job to Waiting / Pending Info as On Hold: Permit pulled and waiting for install."}
        </div>
      </div>
      <LabeledTextarea
        label={<>Internal job note <span className="font-normal text-slate-400">(optional)</span></>}
        name="internal_note"
        rows={3}
        maxLength={4000}
        defaultValue={permitRequest.internalIntakeNote ?? ""}
        placeholder="Add or correct the internal note that should appear on the job."
        wrapperClassName="md:col-span-2"
      />
    </>
  );
}

function UnlinkedPermitIntakeDraft({ permitRequest }: { permitRequest: PermitRequestQueueRow }) {
  return (
    <>
      <input type="hidden" name="customer_location_mode" value="new_new" />
      <input type="hidden" name="customer_first_name" value={permitRequest.customerFirstNameSnapshot ?? ""} />
      <input type="hidden" name="customer_last_name" value={permitRequest.customerLastNameSnapshot ?? ""} />
      <input type="hidden" name="customer_email" value={permitRequest.customerEmailSnapshot ?? ""} />
      <input type="hidden" name="customer_phone" value={permitRequest.customerPhoneSnapshot ?? ""} />
      <input type="hidden" name="address_line1" value={permitRequest.addressLine1Snapshot ?? ""} />
      <input type="hidden" name="address_line2" value={permitRequest.addressLine2Snapshot ?? ""} />
      <input type="hidden" name="city" value={permitRequest.citySnapshot ?? ""} />
      <input type="hidden" name="state" value={permitRequest.stateSnapshot ?? ""} />
      <input type="hidden" name="zip" value={permitRequest.zipSnapshot ?? ""} />
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-medium leading-5 text-amber-950 md:col-span-2">
        No job is linked yet. This will start the customer/job record from the permit intake below.
      </div>
      <div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] leading-5 text-slate-700 md:col-span-2">
        <div className="font-semibold text-slate-900">Permit intake draft</div>
        <div>
          <span className="font-medium text-slate-500">Customer:</span>{" "}
          {[permitRequest.customerFirstNameSnapshot, permitRequest.customerLastNameSnapshot]
            .filter(Boolean)
            .join(" ") || "Customer name pending"}
        </div>
        <div>
          <span className="font-medium text-slate-500">Service address:</span>{" "}
          {[permitRequest.addressLine1Snapshot, permitRequest.addressLine2Snapshot]
            .filter(Boolean)
            .join(", ") || "Address pending"}
        </div>
        <div>
          <span className="font-medium text-slate-500">City:</span>{" "}
          {[permitRequest.citySnapshot, permitRequest.stateSnapshot, permitRequest.zipSnapshot]
            .filter(Boolean)
            .join(", ") || "City, state, and ZIP pending"}
        </div>
        <div className="text-slate-500">
          After creation, finish any missing customer details from the job/customer record.
        </div>
      </div>
    </>
  );
}

function PermitCompletionForm({ permitRequest }: { permitRequest: PermitRequestQueueRow }) {
  const isLinked = Boolean(permitRequest.jobId);

  return (
    <details className="mt-2 rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
      <summary className="cursor-pointer text-[12px] font-semibold text-emerald-700">
        Mark Permit Created
      </summary>
      {isLinked ? (
        <form action={markPermitCreatedFromOps} className="mt-2 grid gap-2 md:grid-cols-2">
          <input type="hidden" name="permit_request_id" value={permitRequest.id} />
          <PermitRouteFields permitRequest={permitRequest} unlinked={false} />
          <div className="flex justify-end md:col-span-2">
            <ImmediateSubmitButton pendingText="Creating permit..." className="inline-flex min-h-9 items-center rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-800">
              Mark Permit Created
            </ImmediateSubmitButton>
          </div>
        </form>
      ) : (
        <form action={createJobAndMarkPermitCreatedFromOps} className="mt-2 grid gap-2 md:grid-cols-2">
          <input type="hidden" name="permit_request_id" value={permitRequest.id} />
          <UnlinkedPermitIntakeDraft permitRequest={permitRequest} />
          <PermitRouteFields permitRequest={permitRequest} unlinked />
          <div className="flex justify-end md:col-span-2">
            <ImmediateSubmitButton pendingText="Creating job..." className="inline-flex min-h-9 items-center rounded-md border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-800">
              Create Job From Permit Intake
            </ImmediateSubmitButton>
          </div>
        </form>
      )}
    </details>
  );
}

function PermitRequestCard({ row }: { row: OpsPermitWorkspaceRow }) {
  const { display, permitRequest } = row;

  return (
    <QueueCard
      title={display.title}
      subtitle={display.context}
      tagsColumns={2}
      tags={[
        { label: "Status", value: permitRequest.internalStatusLabel },
        { label: "Contractor", value: permitRequest.contractorName || permitRequest.contractorId },
        { label: "Submitted", value: display.submitted },
        ...(display.customerName ? [{ label: "Customer", value: display.customerName }] : []),
        ...(permitRequest.customerEmailSnapshot
          ? [{ label: "Email", value: permitRequest.customerEmailSnapshot }]
          : []),
        ...(permitRequest.customerPhoneSnapshot
          ? [{ label: "Phone", value: permitRequest.customerPhoneSnapshot }]
          : []),
        ...(display.address ? [{ label: "Address", value: display.address }] : []),
        ...(display.totalValue ? [{ label: "Total value", value: display.totalValue }] : []),
        ...(permitRequest.jurisdiction
          ? [{ label: "Jurisdiction", value: permitRequest.jurisdiction }]
          : []),
        ...(permitRequest.contractorNote
          ? [{ label: "Contractor note", value: permitRequest.contractorNote, fullWidth: true }]
          : []),
        ...(permitRequest.internalIntakeNote
          ? [{ label: "Internal intake note", value: permitRequest.internalIntakeNote, fullWidth: true }]
          : []),
      ]}
    >
      <PermitLifecycleActions permitRequest={permitRequest} />
      <PermitNotNeededForm permitRequestId={permitRequest.id} />
      <PermitIntakeEditor row={row} />
      <PermitCompletionForm permitRequest={permitRequest} />
      <div className="mt-1.5 grid gap-1 text-[12px] leading-5 text-slate-600 sm:grid-cols-2">
        {permitRequest.permitNumber ? (
          <div>
            <span className="font-medium text-slate-500">Permit #:</span>{" "}
            {permitRequest.permitNumber}
          </div>
        ) : null}
        <div>
          <span className="font-medium text-slate-500">Updated:</span>{" "}
          {display.updatedAt}
        </div>
        {permitRequest.contractorNote ? (
          <div className="sm:col-span-2">
            <span className="font-medium text-slate-500">Contractor note:</span>{" "}
            {permitRequest.contractorNote}
          </div>
        ) : null}
        {permitRequest.internalIntakeNote ? (
          <div className="sm:col-span-2">
            <span className="font-medium text-slate-500">Internal note:</span>{" "}
            {permitRequest.internalIntakeNote}
          </div>
        ) : null}
      </div>
    </QueueCard>
  );
}

export default function OpsPermitWorkspace({
  actionError,
  contractors,
  expandCreateForm,
  snapshot,
}: {
  actionError: string;
  contractors: WorkspaceContractor[];
  expandCreateForm: boolean;
  snapshot: OpsPermitWorkspaceSnapshot;
}) {
  return (
    <>
      <PermitCreateRequestForm contractors={contractors} expanded={expandCreateForm} />
      {snapshot.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700">
          <div>No active permit requests.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {actionError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-900">
              {actionError}
            </div>
          ) : null}
          {snapshot.rows.map((row) => (
            <PermitRequestCard key={row.permitRequest.id} row={row} />
          ))}
        </div>
      )}
    </>
  );
}
