import { describe, expect, it } from "vitest";
import { assertNoClientSuppliedOwnerId, requireScopedEquipmentForMutation } from "@/lib/customers/scoped-equipment";

describe("assertNoClientSuppliedOwnerId", () => {
  it("allows ordinary form submissions with no owner-shaped keys", () => {
    const formData = new FormData();
    formData.set("customer_id", "cust-1");
    formData.set("equipment_id", "eq-1");

    expect(() => assertNoClientSuppliedOwnerId(formData)).not.toThrow();
  });

  it.each(["owner_user_id", "account_owner_user_id", "p_owner_user_id"])(
    "rejects a request that itself supplies %s",
    (key) => {
      const formData = new FormData();
      formData.set("customer_id", "cust-1");
      formData.set(key, "attacker-controlled-owner-id");

      expect(() => assertNoClientSuppliedOwnerId(formData)).toThrow(/owner scope must come from the session/);
    },
  );
});

describe("requireScopedEquipmentForMutation", () => {
  function makeAdmin(row: { id: string; location_id: string; owner_user_id: string; status: string } | null) {
    return {
      from(table: string) {
        expect(table).toBe("equipment");
        let matched = row !== null;
        const query: any = {
          select() {
            return query;
          },
          eq(column: string, value: unknown) {
            // Simulate real filtering: only match if every .eq() filter matches the row.
            if (!row || (row as any)[column] !== value) matched = false;
            return query;
          },
          maybeSingle() {
            return Promise.resolve({ data: matched ? row : null, error: null });
          },
        };
        return query;
      },
    };
  }

  it("returns the row when equipment_id/location_id/owner_user_id all match", async () => {
    const row = { id: "eq-1", location_id: "loc-1", owner_user_id: "owner-1", status: "active" };
    const admin = makeAdmin(row);

    const result = await requireScopedEquipmentForMutation({
      admin,
      equipmentId: "eq-1",
      locationId: "loc-1",
      ownerUserId: "owner-1",
    });

    expect(result).toEqual(row);
  });

  it("rejects when the equipment belongs to a different owner (mismatched owner)", async () => {
    const row = { id: "eq-1", location_id: "loc-1", owner_user_id: "someone-elses-owner-id", status: "active" };
    const admin = makeAdmin(row);

    await expect(
      requireScopedEquipmentForMutation({
        admin,
        equipmentId: "eq-1",
        locationId: "loc-1",
        ownerUserId: "owner-1",
      }),
    ).rejects.toThrow(/not found in internal account scope/);
  });

  it("rejects when the equipment belongs to a different location under the same owner", async () => {
    const row = { id: "eq-1", location_id: "some-other-location", owner_user_id: "owner-1", status: "active" };
    const admin = makeAdmin(row);

    await expect(
      requireScopedEquipmentForMutation({
        admin,
        equipmentId: "eq-1",
        locationId: "loc-1",
        ownerUserId: "owner-1",
      }),
    ).rejects.toThrow(/not found in internal account scope/);
  });
});
