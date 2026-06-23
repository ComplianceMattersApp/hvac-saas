import { redirect } from "next/navigation";

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

  if (!params.has("view")) {
    params.set("view", "open");
  }
  const query = params.toString();

  redirect(query ? `/reports/invoices?${query}` : "/reports/invoices?view=open");
}
