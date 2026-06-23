"use client";

import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
import SubmitButton from "@/components/SubmitButton";
import type {
  ActiveJobAssignmentDisplay,
  AssignableInternalUser,
} from "@/lib/staffing/human-layer";
import { formatPersonNamePart } from "@/lib/utils/identity-display";

type TeamAssignmentSelectorProps = {
  jobId: string;
  tab: string;
  returnAnchor: string;
  assignedTeam: ActiveJobAssignmentDisplay[];
  assignableUsers: AssignableInternalUser[];
  updateTeamAction: (formData: FormData) => void | Promise<void>;
};

const buttonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200";

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

export default function TeamAssignmentSelector({
  jobId,
  tab,
  returnAnchor,
  assignedTeam,
  assignableUsers,
  updateTeamAction,
}: TeamAssignmentSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draftSelected, setDraftSelected] = useState<Set<string>>(
    () => new Set(assignedTeam.map((row) => row.user_id)),
  );
  const currentPrimaryUserId = assignedTeam.find((row) => row.is_primary)?.user_id ?? "";
  const [draftPrimaryUserId, setDraftPrimaryUserId] = useState<string>(() => {
    if (currentPrimaryUserId) return currentPrimaryUserId;
    return assignedTeam[0]?.user_id ?? "";
  });

  const assignedSet = useMemo(
    () => new Set(assignedTeam.map((row) => row.user_id)),
    [assignedTeam],
  );
  const assignedDisplayByUserId = useMemo(
    () => new Map(assignedTeam.map((row) => [row.user_id, row.display_name])),
    [assignedTeam],
  );

  const selectedCount = assignedTeam.length;
  const summary =
    selectedCount === 0
      ? "No team assigned"
      : selectedCount === 1
        ? formatPersonNamePart(assignedTeam[0]?.display_name ?? "1 team member")
        : `${selectedCount} team members`;

  const resetDraft = () => {
    const nextSelected = new Set(assignedTeam.map((row) => row.user_id));
    setDraftSelected(nextSelected);
    setDraftPrimaryUserId(currentPrimaryUserId || assignedTeam[0]?.user_id || "");
    setSearch("");
  };

  const closeSelector = () => {
    resetDraft();
    setOpen(false);
  };

  const openSelector = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resetDraft();
    setOpen(true);
  };

  const cancelSelector = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    closeSelector();
  };

  const toggleUser = (userId: string) => {
    setDraftSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
        if (draftPrimaryUserId === userId) {
          const replacement = Array.from(next)[0] ?? "";
          setDraftPrimaryUserId(replacement);
        }
      } else {
        next.add(userId);
        if (!draftPrimaryUserId) setDraftPrimaryUserId(userId);
      }
      return next;
    });
  };

  const clearDraft = () => {
    setDraftSelected(new Set());
    setDraftPrimaryUserId("");
  };

  const orderedUsers = useMemo(() => {
    const query = normalizeSearchText(search);
    const rows = assignableUsers
      .filter((user) => {
        if (!query) return true;
        return `${user.display_name} ${user.email ?? ""} ${user.role ?? ""}`
          .toLowerCase()
          .includes(query);
      })
      .slice();

    rows.sort((left, right) => {
      const leftSelected = draftSelected.has(left.user_id) ? 0 : 1;
      const rightSelected = draftSelected.has(right.user_id) ? 0 : 1;
      if (leftSelected !== rightSelected) return leftSelected - rightSelected;

      const leftAssigned = assignedSet.has(left.user_id) ? 0 : 1;
      const rightAssigned = assignedSet.has(right.user_id) ? 0 : 1;
      if (leftAssigned !== rightAssigned) return leftAssigned - rightAssigned;

      return left.display_name.localeCompare(right.display_name, undefined, {
        sensitivity: "base",
      });
    });

    return rows;
  }, [assignableUsers, assignedSet, draftSelected, search]);

  const activePrimaryStillSelected =
    currentPrimaryUserId && draftSelected.has(currentPrimaryUserId);
  const effectivePrimaryUserId = activePrimaryStillSelected
    ? currentPrimaryUserId
    : draftPrimaryUserId && draftSelected.has(draftPrimaryUserId)
      ? draftPrimaryUserId
      : Array.from(draftSelected)[0] ?? "";
  const hasEligibleUsers = assignableUsers.length > 0;

  return (
    <div className="relative mt-3" data-team-assignment-selector={open ? "open" : "closed"}>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
            Team
          </div>
          <div className="truncate text-sm font-semibold text-slate-900">{summary}</div>
        </div>
        <button
          type="button"
          className={buttonClass}
          disabled={!hasEligibleUsers}
          aria-expanded={open}
          aria-controls="team-assignment-selector-panel"
          data-team-assignment-opener="true"
          onClick={openSelector}
        >
          {selectedCount > 0 ? "Change Team" : "Assign Team"}
        </button>
      </div>

      {open ? (
        <div
          id="team-assignment-selector-panel"
          role="dialog"
          aria-label="Assign Team"
          data-team-assignment-panel="true"
          className="fixed inset-x-3 top-20 z-[100] max-h-[calc(100vh-6rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:inset-x-auto sm:right-6 sm:top-24 sm:w-[32rem] sm:max-w-xl"
        >
          <form action={updateTeamAction}>
            <input type="hidden" name="job_id" value={jobId} />
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="return_to" value={`/jobs/${jobId}?tab=${tab}#${returnAnchor}`} />
            <input type="hidden" name="primary_user_id" value={effectivePrimaryUserId} />
            {Array.from(draftSelected).map((userId) => (
              <input key={userId} type="hidden" name="selected_user_ids" value={userId} />
            ))}

            <div className="border-b border-slate-100 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Assign Team</div>
                  <div className="text-xs text-slate-500">
                    {draftSelected.size} selected
                    {effectivePrimaryUserId
                      ? ` - Primary: ${formatPersonNamePart(
                          assignedDisplayByUserId.get(effectivePrimaryUserId) ??
                            assignableUsers.find((user) => user.user_id === effectivePrimaryUserId)
                              ?.display_name ??
                            "team member",
                        )}`
                      : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  onClick={cancelSelector}
                >
                  Cancel
                </button>
              </div>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search team"
                className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div className="max-h-72 overflow-y-auto py-1">
              {orderedUsers.length > 0 ? (
                orderedUsers.map((user) => {
                  const checked = draftSelected.has(user.user_id);
                  const isCurrentPrimary = currentPrimaryUserId === user.user_id;
                  const isEffectivePrimary = effectivePrimaryUserId === user.user_id;
                  const primaryCanChange = !activePrimaryStillSelected;

                  return (
                    <div
                      key={user.user_id}
                      className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0"
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleUser(user.user_id)}
                          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-slate-900">
                            {formatPersonNamePart(user.display_name)}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {user.email || user.role}
                          </span>
                        </span>
                      </label>
                      {checked ? (
                        <label
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold ${
                            isEffectivePrimary
                              ? "border-slate-300 bg-slate-100 text-slate-800"
                              : "border-slate-200 bg-white text-slate-500"
                          } ${primaryCanChange ? "cursor-pointer" : "cursor-default"}`}
                        >
                          <input
                            type="radio"
                            name="primary_choice"
                            checked={isEffectivePrimary}
                            disabled={!primaryCanChange}
                            onChange={() => setDraftPrimaryUserId(user.user_id)}
                            className="h-3 w-3"
                          />
                          {isCurrentPrimary ? "Primary" : "Make Primary"}
                        </label>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="px-3 py-6 text-center text-sm text-slate-500">No team members found.</div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-3">
              <button
                type="button"
                onClick={clearDraft}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                Clear
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  onClick={cancelSelector}
                >
                  Cancel
                </button>
                <SubmitButton
                  loadingText="Applying..."
                  className="min-h-10 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                >
                  Apply
                </SubmitButton>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
