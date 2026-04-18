import { redirect } from "next/navigation";
const DASHBOARD_QUERY_KEYS = new Set(["from", "to", "granularity", "density", "section"]);

export const metadata = {
  title: "Reports",
  description: "Report Center entry",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (searchParams ? await searchParams : {}) ?? {};
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string") params.append(key, entry);
      }
      continue;
    }

    if (typeof value === "string") params.set(key, value);
  }

  const targetPath = Array.from(params.keys()).every((key) => DASHBOARD_QUERY_KEYS.has(key))
    ? "/reports/dashboard"
    : "/reports/jobs";
  const query = params.toString();

  redirect(query ? `${targetPath}?${query}` : targetPath);
}