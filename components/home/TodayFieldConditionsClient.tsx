"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Cloud, CloudRain, LocateFixed, Sun, Wind } from "lucide-react";

import type { TodayFieldConditions } from "@/lib/home/today-field-conditions";

type FieldConditionsStatus = "idle" | "loading" | "ready" | "denied" | "unavailable" | "error";

type CoarseCoordinates = {
  latitude: number;
  longitude: number;
};

const COORDINATE_CHANGE_THRESHOLD_DEGREES = 0.05;
const LOCATION_REFRESH_MS = 20 * 60 * 1000;

function roundCoordinate(value: number): number {
  return Number(value.toFixed(2));
}

function meaningfulCoordinateChange(a: CoarseCoordinates | null, b: CoarseCoordinates): boolean {
  if (!a) return true;
  return (
    Math.abs(a.latitude - b.latitude) >= COORDINATE_CHANGE_THRESHOLD_DEGREES ||
    Math.abs(a.longitude - b.longitude) >= COORDINATE_CHANGE_THRESHOLD_DEGREES
  );
}

function buildPositionOptions(): PositionOptions {
  return {
    enableHighAccuracy: false,
    maximumAge: LOCATION_REFRESH_MS,
    timeout: 8000,
  };
}

async function fetchConditions(coords: CoarseCoordinates): Promise<TodayFieldConditions | null> {
  const params = new URLSearchParams({
    lat: String(coords.latitude),
    lon: String(coords.longitude),
  });
  const response = await fetch(`/api/today/field-conditions?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { conditions?: TodayFieldConditions | null };
  return data.conditions ?? null;
}

export default function TodayFieldConditionsClient() {
  const [status, setStatus] = useState<FieldConditionsStatus>("idle");
  const [conditions, setConditions] = useState<TodayFieldConditions | null>(null);
  const [locationSupported, setLocationSupported] = useState(true);
  const lastCoordsRef = useRef<CoarseCoordinates | null>(null);
  const lastLocationCheckRef = useRef(0);
  const requestInFlightRef = useRef(false);

  const requestConditions = useCallback((mode: "user" | "passive") => {
    if (requestInFlightRef.current) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationSupported(false);
      setStatus("unavailable");
      return;
    }

    requestInFlightRef.current = true;
    if (mode === "user" || !conditions) setStatus("loading");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = {
          latitude: roundCoordinate(position.coords.latitude),
          longitude: roundCoordinate(position.coords.longitude),
        };
        lastLocationCheckRef.current = Date.now();

        if (!meaningfulCoordinateChange(lastCoordsRef.current, coords) && conditions) {
          setStatus("ready");
          requestInFlightRef.current = false;
          return;
        }

        lastCoordsRef.current = coords;
        const nextConditions = await fetchConditions(coords).catch(() => null);
        setConditions(nextConditions);
        setStatus(nextConditions ? "ready" : "error");
        requestInFlightRef.current = false;
      },
      (error) => {
        setStatus(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
        requestInFlightRef.current = false;
      },
      buildPositionOptions(),
    );
  }, [conditions]);

  useEffect(() => {
    let cancelled = false;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationSupported(false);
      return;
    }

    const permissions = navigator.permissions;
    if (!permissions?.query) return;

    permissions
      .query({ name: "geolocation" as PermissionName })
      .then((permission) => {
        if (cancelled) return;
        if (permission.state === "granted") {
          requestConditions("passive");
        } else if (permission.state === "denied") {
          setStatus("denied");
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [requestConditions]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (status !== "ready") return;
      if (Date.now() - lastLocationCheckRef.current < LOCATION_REFRESH_MS) return;
      requestConditions("passive");
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
    };
  }, [requestConditions, status]);

  if (status === "ready" && conditions) {
    return <FieldConditionsChip conditions={conditions} onRefresh={() => requestConditions("user")} />;
  }

  if (!locationSupported) return null;

  if (status === "loading") {
    return (
      <FieldConditionsShell>
        <div className="text-sm font-semibold text-slate-900">Checking field conditions...</div>
        <div className="text-xs font-medium text-slate-500">Using your current device location.</div>
      </FieldConditionsShell>
    );
  }

  if (status === "error") {
    return (
      <FieldConditionsShell>
        <div className="text-sm font-semibold text-slate-900">Field conditions unavailable</div>
        <button
          type="button"
          onClick={() => requestConditions("user")}
          className="mt-1 text-xs font-semibold text-blue-700 hover:underline"
        >
          Try again
        </button>
      </FieldConditionsShell>
    );
  }

  if (status === "denied") return null;

  return (
    <FieldConditionsShell>
      <button
        type="button"
        onClick={() => requestConditions("user")}
        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
      >
        <LocateFixed className="h-4 w-4" aria-hidden="true" />
        Enable location for field conditions
      </button>
    </FieldConditionsShell>
  );
}

function FieldConditionsShell({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-3.5 py-2.5 sm:px-4">
      <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-[0_12px_26px_-24px_rgba(15,31,53,0.5)]">
        {children}
      </div>
    </div>
  );
}

function FieldConditionsChip({
  conditions,
  onRefresh,
}: {
  conditions: TodayFieldConditions;
  onRefresh: () => void;
}) {
  const Icon =
    conditions.icon === "rain"
      ? CloudRain
      : conditions.icon === "wind"
      ? Wind
      : conditions.icon === "cloud"
      ? Cloud
      : Sun;
  const rainLabel =
    conditions.rainChancePercent != null && conditions.rainChancePercent >= 20
      ? ` - ${conditions.rainChancePercent}% rain`
      : "";
  const windLabel = conditions.windMph != null ? ` - ${conditions.windMph} mph wind` : "";

  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-3.5 py-2.5 sm:px-4">
      <div className="flex flex-col gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-[0_12px_26px_-24px_rgba(15,31,53,0.5)] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700">
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700/80">
                {conditions.label}
              </span>
              <button
                type="button"
                onClick={onRefresh}
                className="text-[11px] font-medium text-slate-500 hover:text-blue-700 hover:underline"
              >
                {conditions.locationLabel}
              </button>
            </div>
            <div className="mt-0.5 text-sm font-semibold text-slate-900">
              {conditions.currentTempF}&deg; now &middot; High {conditions.highTempF}&deg; &middot; {conditions.condition}
              {rainLabel}
              {windLabel}
            </div>
          </div>
        </div>
        <p className="text-sm font-medium leading-5 text-slate-600 sm:max-w-[18rem] sm:text-right">
          {conditions.note}
        </p>
      </div>
    </div>
  );
}
