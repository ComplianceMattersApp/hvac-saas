"use server";

import { redirect } from "next/navigation";
import {
  acceptInternalPermitRequest,
  createJobFromPermitRequestAndMarkCreated,
  createInternalManualPermitRequest,
  holdInternalPermitRequest,
  markInternalPermitCreated,
  markInternalPermitRequestNotNeeded,
  resumeInternalPermitRequest,
  updateInternalPermitRequestIntake,
} from "@/lib/actions/internal-permit-request-actions";

const PERMIT_WORKSPACE_HREF = "/ops?bucket=permits#ops-workspace";

function permitWorkspaceErrorHref(message: string) {
  return `/ops?bucket=permits&permit_error=${encodeURIComponent(message)}#ops-workspace`;
}

export async function createManualPermitRequestFromOps(formData: FormData) {
  await createInternalManualPermitRequest(formData);
  redirect(PERMIT_WORKSPACE_HREF);
}

export async function acceptPermitRequestFromOps(formData: FormData) {
  await acceptInternalPermitRequest(formData);
  redirect(PERMIT_WORKSPACE_HREF);
}

export async function holdPermitRequestFromOps(formData: FormData) {
  await holdInternalPermitRequest(formData);
  redirect(PERMIT_WORKSPACE_HREF);
}

export async function resumePermitRequestFromOps(formData: FormData) {
  await resumeInternalPermitRequest(formData);
  redirect(PERMIT_WORKSPACE_HREF);
}

export async function markPermitRequestNotNeededFromOps(formData: FormData) {
  try {
    await markInternalPermitRequestNotNeeded(formData);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Permit request could not be marked not needed.";
    redirect(permitWorkspaceErrorHref(message));
  }

  redirect(PERMIT_WORKSPACE_HREF);
}

export async function updatePermitRequestIntakeFromOps(formData: FormData) {
  try {
    await updateInternalPermitRequestIntake(formData);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Permit intake details could not be saved.";
    redirect(permitWorkspaceErrorHref(message));
  }

  redirect(PERMIT_WORKSPACE_HREF);
}

export async function markPermitCreatedFromOps(formData: FormData) {
  let jobId = "";
  try {
    const result = await markInternalPermitCreated(formData);
    jobId = result.jobId;
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Permit could not be marked created.";
    redirect(permitWorkspaceErrorHref(message));
  }

  redirect(`/jobs/${jobId}`);
}

export async function createJobAndMarkPermitCreatedFromOps(formData: FormData) {
  let jobId = "";
  try {
    const result = await createJobFromPermitRequestAndMarkCreated(formData);
    jobId = result.jobId;
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Permit job could not be created.";
    redirect(permitWorkspaceErrorHref(message));
  }

  redirect(`/jobs/${jobId}`);
}
