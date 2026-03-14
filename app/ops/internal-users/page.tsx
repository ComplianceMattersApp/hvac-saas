import { redirect } from "next/navigation";

export default function LegacyOpsInternalUsersPage() {
  redirect("/ops/admin/internal-users");
}