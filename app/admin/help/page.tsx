import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { ManualView } from "@/components/ManualView";
import { ADMIN_MANUAL_SECTIONS } from "@/lib/admin-manual";
import { canAccessAdmin } from "@/lib/auth";
import { getViewer } from "@/lib/viewer";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminHelpPage() {
  const viewer = await getViewer();
  if (!viewer || !canAccessAdmin(viewer.profile as Profile)) redirect("/home");

  return (
    <AuthenticatedShell mode="admin">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href="/admin" className="text-sm text-muted hover:text-accent">
            ← 管理センター
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">運営 操作説明</h1>
          <p className="mt-1 text-sm text-muted">
            管理画面の基本的な使い方です。個別取引は取引詳細の「運営の手順」を優先してください。
          </p>
        </div>
        <ManualView
          sections={ADMIN_MANUAL_SECTIONS}
          footer={
            <>
              取引の実務は{" "}
              <Link href="/admin/deals" className="text-accent hover:underline">
                取引連絡
              </Link>
              ・
              <Link href="/admin/workspace" className="text-accent hover:underline">
                商談・取引ワークスペース
              </Link>
              から。加盟店向け説明は{" "}
              <Link href="/help" className="text-accent hover:underline">
                /help
              </Link>
              （加盟店画面）を参照。
            </>
          }
        />
      </div>
    </AuthenticatedShell>
  );
}
