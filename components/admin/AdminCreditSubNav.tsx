import Link from "next/link";

export type AdminCreditTab = "dealers" | "adjust";

export function AdminCreditSubNav({ active }: { active: AdminCreditTab }) {
  return (
    <div className="space-y-4">
      <nav aria-label="パンくず" className="text-sm text-muted">
        <Link href="/admin" className="hover:text-accent">
          管理センター
        </Link>
        <span className="mx-1.5 text-border">/</span>
        <span className="text-foreground">加盟店・信用</span>
        {active === "adjust" ? (
          <>
            <span className="mx-1.5 text-border">/</span>
            <span className="text-foreground">減点の調整</span>
          </>
        ) : null}
      </nav>

      <div>
        <h1 className="text-2xl font-semibold">加盟店・信用</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          {active === "adjust"
            ? "戻す必要があるときだけ操作してください。メモや報告は不要です。"
            : "手動減点・BAN・年末締め。自動減点の見直しは「減点の調整」。"}
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="信用管理">
        <Link
          href="/admin/credit"
          role="tab"
          aria-selected={active === "dealers"}
          className={`rounded-lg px-4 py-2 text-sm ${
            active === "dealers"
              ? "bg-accent font-medium text-black"
              : "border border-border text-muted hover:border-accent/40"
          }`}
        >
          加盟店一覧
        </Link>
        <Link
          href="/admin/credit/adjust"
          role="tab"
          aria-selected={active === "adjust"}
          className={`rounded-lg px-4 py-2 text-sm ${
            active === "adjust"
              ? "bg-accent font-medium text-black"
              : "border border-border text-muted hover:border-accent/40"
          }`}
        >
          減点の調整
        </Link>
      </div>
    </div>
  );
}
