import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { ManualView } from "@/components/ManualView";
import { DEALER_MANUAL_SECTIONS } from "@/lib/dealer-manual";
import { getViewer } from "@/lib/viewer";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.profile.member_type === "staff") redirect("/admin");

  return (
    <AuthenticatedShell mode="dealer">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href="/home" className="text-sm text-muted hover:text-accent">
            ← ホーム
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">加盟店 操作説明</h1>
          <p className="mt-1 text-sm text-muted">
            MotoHub の基本的な使い方です。画面の表示は随時更新されます。
          </p>
        </div>
        <ManualView
          sections={DEALER_MANUAL_SECTIONS}
          footer={
            <>
              個別の取引操作は{" "}
              <Link href="/deals" className="text-accent hover:underline">
                商談
              </Link>
              （車両）または{" "}
              <Link href="/parts" className="text-accent hover:underline">
                パーツ
              </Link>
              画面の案内に従ってください。{" "}
              <Link href="/support" className="text-accent hover:underline">
                運営サポート
              </Link>
              もご利用いただけます。
            </>
          }
        />
      </div>
    </AuthenticatedShell>
  );
}
