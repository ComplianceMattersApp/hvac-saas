import type { InternalRole } from "@/lib/auth/internal-user";
import type { ProductMode } from "@/lib/business/product-mode-defaults";
import type { RoleTrainingTrack } from "./training-room-content";

export type TrainingTrackId =
  | "owner-admin"
  | "dispatcher-office"
  | "technician-field"
  | "billing-ar"
  | "ecc-hers";

export type TrainingRoomVisibilityContext = {
  internalRole?: InternalRole | string | null;
  isAccountOwner?: boolean;
  productMode?: ProductMode | null;
  canViewFinancialRegister?: boolean;
  canCollectFieldPayment?: boolean;
};

export type TrainingRoomVisibility = {
  audienceLabel: string;
  primaryHeading: string;
  primaryDescription: string;
  primaryTrackIds: TrainingTrackId[];
  crossTrainingTrackIds: TrainingTrackId[];
  showRoleSelector: boolean;
};

const allTrackIds: TrainingTrackId[] = [
  "owner-admin",
  "dispatcher-office",
  "technician-field",
  "billing-ar",
  "ecc-hers",
];

function uniqueTrackIds(ids: TrainingTrackId[]) {
  return ids.filter((id, index) => ids.indexOf(id) === index);
}

function remainingTrackIds(primaryTrackIds: TrainingTrackId[]) {
  return allTrackIds.filter((id) => !primaryTrackIds.includes(id));
}

function hasEccProductSignal(productMode: ProductMode | null | undefined) {
  return productMode === "ecc_hers" || productMode === "hybrid";
}

export function resolveTrainingRoomVisibility(
  context: TrainingRoomVisibilityContext,
): TrainingRoomVisibility {
  const role = String(context.internalRole ?? "").trim().toLowerCase();
  const hasFinancialAuthority = context.canViewFinancialRegister === true;
  const hasEccSignal = hasEccProductSignal(context.productMode);

  if (context.isAccountOwner || role === "admin") {
    const primaryTrackIds = uniqueTrackIds([
      "owner-admin",
      "dispatcher-office",
      hasFinancialAuthority ? "billing-ar" : "dispatcher-office",
      hasEccSignal ? "ecc-hers" : "technician-field",
    ]);

    return {
      audienceLabel: "Owner / Admin",
      primaryHeading: "Your Role Today",
      primaryDescription:
        "Start with launch readiness, the first job path, and the daily operations rhythm. Cross-training stays available below.",
      primaryTrackIds,
      crossTrainingTrackIds: remainingTrackIds(primaryTrackIds),
      showRoleSelector: false,
    };
  }

  if (role === "billing" || hasFinancialAuthority) {
    const primaryTrackIds: TrainingTrackId[] = ["billing-ar"];

    return {
      audienceLabel: "Billing / AR",
      primaryHeading: "Your Role Today",
      primaryDescription:
        "Start with invoice review, payment attention, and financial follow-through. Field and admin tracks stay secondary unless you also wear those hats.",
      primaryTrackIds,
      crossTrainingTrackIds: remainingTrackIds(primaryTrackIds),
      showRoleSelector: false,
    };
  }

  if (role === "office") {
    const primaryTrackIds: TrainingTrackId[] = ["dispatcher-office"];

    return {
      audienceLabel: "Dispatcher / Office",
      primaryHeading: "Your Role Today",
      primaryDescription:
        "Start with the office rhythm: intake, scheduling, waiting follow-up, and closeout handoff.",
      primaryTrackIds,
      crossTrainingTrackIds: remainingTrackIds(primaryTrackIds),
      showRoleSelector: false,
    };
  }

  if (role === "tech") {
    const isEccRaterDefault = context.productMode === "ecc_hers";
    const primaryTrackIds: TrainingTrackId[] = isEccRaterDefault
      ? ["ecc-hers"]
      : ["technician-field"];

    return {
      audienceLabel: isEccRaterDefault ? "ECC / HERS Rater" : "Technician / Field User",
      primaryHeading: "Your Role Today",
      primaryDescription: isEccRaterDefault
        ? "Start with ECC job rhythm, test entry, failed/correction/retest flow, and cert closeout boundaries."
        : "Start with assigned work, notes/photos/context, and the field finish outcome for today's visit.",
      primaryTrackIds,
      crossTrainingTrackIds: remainingTrackIds(primaryTrackIds),
      showRoleSelector: false,
    };
  }

  return {
    audienceLabel: "Choose your role",
    primaryHeading: "Choose Your Role Today",
    primaryDescription:
      "Pick the track that matches the responsibility you are handling right now. All tracks remain available.",
    primaryTrackIds: [],
    crossTrainingTrackIds: allTrackIds,
    showRoleSelector: true,
  };
}

export function orderTracksForTrainingVisibility(
  tracks: RoleTrainingTrack[],
  trackIds: TrainingTrackId[],
) {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  return trackIds
    .map((trackId) => byId.get(trackId))
    .filter((track): track is RoleTrainingTrack => Boolean(track));
}
