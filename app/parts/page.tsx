import Link from "next/link";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { createClient } from "@/lib/supabase/server";
import { formatYen } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PartsPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("part_listings")
    .select("id, part_name, manufacturer, category, compatible_models, price_display_type, price_ex_tax, shipping_bearer, status, created_at")
    .order("created_at", { ascending: false })
    .limit(60);

  const parts = rows ?? [];

  return (
    <AuthenticatedShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">パーツ売買</h1>
            <p className="mt-1 text-sm text-muted">加盟店間の軽量パーツマーケット。送料・支払いは当事者調整です。</p>
          </div>
          <Link href="/parts/new" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black">新規出品</Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {parts.length === 0 ? <p className="text-sm text-muted">パーツ出品はまだありません。</p> : null}
          {parts.map((p) => (
            <Link key={p.id} href={`/parts/${p.id}`} className="rounded-xl border border-border bg-card p-4 hover:border-accent/40">
              <p className="text-xs text-muted">{p.manufacturer} / {p.category}</p>
              <h2 className="mt-1 font-semibold">{p.part_name}</h2>
              <p className="mt-2 line-clamp-1 text-sm text-muted">対応車種: {p.compatible_models || "—"}</p>
              <p className="mt-2 text-sm text-muted">送料: {p.shipping_bearer === "buyer" ? "買い手負担" : p.shipping_bearer === "seller" ? "売り手負担" : "要相談"}</p>
              <p className="mt-2 text-lg font-semibold text-accent">
                {p.price_display_type === "ask" ? "ASK" : formatYen(p.price_ex_tax ?? 0)}
                <span className="ml-2 text-xs text-muted">{p.status}</span>
              </p>
            </Link>
          ))}
        </div>
      </div>
    </AuthenticatedShell>
  );
}
