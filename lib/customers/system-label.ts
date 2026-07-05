/**
 * "System 1" / "System 2" / ... — next free default label for a location, so
 * single-system homes stay clean (VISUAL-ALIGNMENT-SPEC.md §8b) without
 * forcing the tech to type a name. Renameable afterward via
 * updateCustomerLocationSystemFromForm.
 */
export async function nextDefaultSystemLabel(params: { admin: any; locationId: string }): Promise<string> {
  const { data: activeSystems, error } = await params.admin
    .from("customer_location_systems")
    .select("name")
    .eq("location_id", params.locationId)
    .is("archived_at", null);

  if (error) throw error;

  const taken = new Set(
    (activeSystems ?? []).map((row: { name: string }) => String(row.name ?? "").trim().toLowerCase()),
  );

  let n = 1;
  while (taken.has(`system ${n}`)) n += 1;
  return `System ${n}`;
}
