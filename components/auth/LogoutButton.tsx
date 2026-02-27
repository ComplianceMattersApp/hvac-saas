import { logout } from "@/lib/actions/auth-actions";
import SubmitButton from "@/components/SubmitButton";

export default function LogoutButton() {
  return (
    <form action={logout}>
      <SubmitButton className="text-sm rounded-md border px-3 py-2 hover:bg-gray-50">
        Log out
      </SubmitButton>
    </form>
  );
}