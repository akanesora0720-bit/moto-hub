import Link from "next/link";
import type { AccountStatus } from "@/lib/types";
import { ACCOUNT_STATUS_LABELS } from "@/lib/account-status";

export function DealerMembershipBanner({
  accountStatus,
  profileCompleted,
}: {
  accountStatus: AccountStatus | null | undefined;
  profileCompleted?: boolean;
}) {
  if (accountStatus === "approved") return null;

  if (accountStatus === "pending_review") {
    return (
      <div
        role="status"
        className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
      >
        <p className="font-medium">加盟審査中</p>
        <p className="mt-1 text-xs text-amber-200/90">
          運営による審査が完了するまで、出品・商談などの機能はご利用いただけません。審査完了後に全機能が解放されます。
        </p>
      </div>
    );
  }

  if (accountStatus === "pre_registered") {
    return (
      <div
        role="status"
        className="rounded-xl border border-sky-500/35 bg-sky-500/10 px-4 py-3 text-sm text-sky-100"
      >
        <p className="font-medium">仮登録（{ACCOUNT_STATUS_LABELS.pre_registered}）</p>
        <p className="mt-1 text-xs text-sky-200/90">
          {profileCompleted
            ? "加盟店情報の送信後、審査が始まります。"
            : "車両を探すなど一部機能のみ利用可能です。出品・商談を行うには加盟店情報の登録が必要です。"}
        </p>
        {!profileCompleted ? (
          <Link
            href="/onboarding"
            className="mt-2 inline-block text-xs font-medium text-accent underline underline-offset-2"
          >
            加盟店情報を登録する →
          </Link>
        ) : null}
      </div>
    );
  }

  if (accountStatus === "rejected") {
    return (
      <div
        role="alert"
        className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100"
      >
        <p className="font-medium">加盟審査：否認</p>
        <p className="mt-1 text-xs text-rose-200/90">
          審査の結果、加盟をお見送りとなりました。内容の修正後に再申請する場合は運営までお問い合わせください。
        </p>
        <Link href="/settings" className="mt-2 inline-block text-xs text-accent underline">
          設定・お問い合わせ
        </Link>
      </div>
    );
  }

  return null;
}
