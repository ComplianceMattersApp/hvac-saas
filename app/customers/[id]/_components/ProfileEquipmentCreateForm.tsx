"use client";

import EquipmentCreateFormFields from "@/components/jobs/EquipmentCreateFormFields";
import { addCustomerLocationEquipmentFromForm } from "@/lib/actions/customer-actions";

export default function ProfileEquipmentCreateForm({
  customerId,
  locationId,
  systemId,
}: {
  customerId: string;
  locationId: string;
  systemId: string;
}) {
  return (
    <form action={addCustomerLocationEquipmentFromForm}>
      <input type="hidden" name="customer_id" value={customerId} />
      <input type="hidden" name="location_id" value={locationId} />
      <input type="hidden" name="system_id" value={systemId} />
      <EquipmentCreateFormFields
        systems={[]}
        includeSystemPicker={false}
        includeFilterOption={false}
        title="Add Equipment"
        description="Add an equipment record to this saved property system."
      />
    </form>
  );
}
