import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { WithdrawForm } from "./WithdrawForm";

export default function WithdrawSettingsPage() {
  return (
    <AuthenticatedShell mode="dealer">
      <WithdrawForm />
    </AuthenticatedShell>
  );
}
