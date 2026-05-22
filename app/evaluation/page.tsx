import Link from "next/link";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { VehicleGradingSlide } from "@/components/VehicleGradingSlide";

export default async function EvaluationPage() {
  return (
    <AuthenticatedShell>
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/" className="text-sm text-muted hover:text-accent">
          ← 在庫一覧
        </Link>
        <VehicleGradingSlide />
      </div>
    </AuthenticatedShell>
  );
}
