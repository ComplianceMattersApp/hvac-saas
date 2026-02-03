import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id, title, city, status, scheduled_date, created_at")
    .eq("id", id)
    .single();

  if (serviceError || !service) {
    return notFound();
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{service.title ?? "Service"}</h1>
        <p className="text-sm text-gray-600">{service.city ?? "No city set"}</p>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="grid gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Status</span>
            <span className="font-medium">{service.status ?? "—"}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Scheduled Date</span>
            <span className="font-medium">
              {service.scheduled_date ? new Date(service.scheduled_date).toLocaleString() : "—"}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Created</span>
            <span className="font-medium">
              {service.created_at ? new Date(service.created_at).toLocaleString() : "—"}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-600">Service ID</span>
            <span className="font-mono text-xs">{service.id}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
