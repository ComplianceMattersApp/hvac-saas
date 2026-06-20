export type CalendarHrefView = "day" | "week" | "list" | "month";

export type CalendarHrefParams = {
  banner?: string;
  job?: string | null;
  block?: string | null;
  tech?: string | string[] | null;
  prefillDate?: string | null;
  inspector?: string | null;
};

export function buildCalendarHref(view: CalendarHrefView, date: string, params?: CalendarHrefParams) {
  const q = new URLSearchParams();
  q.set("view", view);
  q.set("date", date);
  if (params?.banner) q.set("banner", params.banner);
  if (params?.job) q.set("job", params.job);
  if (params?.block) q.set("block", params.block);
  const techValues = Array.isArray(params?.tech) ? params.tech : params?.tech ? [params.tech] : [];
  for (const tech of techValues) {
    const value = String(tech ?? "").trim();
    if (value) q.append("tech", value);
  }
  if (params?.prefillDate) q.set("prefill_date", params.prefillDate);
  if (params?.inspector) q.set("inspector", params.inspector);
  else if (params?.job) q.set("inspector", "1");
  return `/calendar?${q.toString()}`;
}
