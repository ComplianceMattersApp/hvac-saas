import { logout } from "@/lib/actions/auth-actions";
import SubmitButton from "@/components/SubmitButton";

type LogoutButtonProps = {
  className?: string;
};

export default function LogoutButton({ className }: LogoutButtonProps) {
  return (
    <form action={logout}>
      <SubmitButton
        className={
          className ??
          "text-sm font-medium text-slate-500 rounded-md px-3 py-1.5 hover:bg-slate-50 hover:text-slate-800"
        }
      >
        Sign out
      </SubmitButton>
    </form>
  );
}