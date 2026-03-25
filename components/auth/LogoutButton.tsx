import { logout } from "@/lib/actions/auth-actions";
import SubmitButton from "@/components/SubmitButton";

export default function LogoutButton() {
  return (
    <form action={logout}>
      <SubmitButton className="text-sm font-medium text-slate-500 rounded-md px-3 py-1.5 hover:bg-slate-50 hover:text-slate-800">
        Sign out
      </SubmitButton>
    </form>
  );
}