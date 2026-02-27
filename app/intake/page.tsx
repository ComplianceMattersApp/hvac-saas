import { redirect } from "next/navigation";

export default function IntakeRedirectPage() {
  redirect("/jobs/new");
}