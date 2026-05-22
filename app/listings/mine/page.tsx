import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ListingCard } from "@/components/ListingCard";
import { mapListingRows } from "@/lib/listings";
import { LISTING_SELLER_PUBLIC_SELECT } from "@/lib/seller-public";
import { createClient } from "@/lib/supabase/server";

export default async function MyListingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user!.id)
    .single();

  const { data: rows } = await supabase
    .from("listings")
    .select(
      `
      *,
      ${LISTING_SELLER_PUBLIC_SELECT},
      listing_images ( storage_path, sort_order )
    `,
    )
    .eq("seller_id", user!.id)
    .neq("status", "removed")
    .order("created_at", { ascending: false });

  const listings = mapListingRows((rows ?? []) as Parameters<typeof mapListingRows>[0]);

  return (
    <AppShell isAdmin={profile?.is_admin}>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">自分の出品</h1>
          <Link
            href="/listings/new"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-black"
          >
            新規出品
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.length === 0 ? (
            <p className="text-sm text-muted">掲載中の出品はありません。</p>
          ) : null}
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              editHref={
                listing.status === "active" ? `/listings/${listing.id}/edit` : undefined
              }
            />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
