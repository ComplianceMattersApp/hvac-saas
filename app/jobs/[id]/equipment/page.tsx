import { redirect } from "next/navigation";

export default async function JobEquipmentAliasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/jobs/${id}/info?f=equipment`);
}
