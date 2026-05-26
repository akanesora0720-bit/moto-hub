import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AuthenticatedShell } from "@/components/AuthenticatedShell";
import { ListingEditorForm, type ListingEditorInitial } from "@/components/ListingEditorForm";
import { parseGradesToForm } from "@/lib/listing-grades";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/viewer";
import type { MileageRollbackStatus } from "@/lib/types";

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!listing || listing.seller_id !== viewer.id) notFound();
  if (listing.status === "removed") notFound();
  if (listing.status === "sold") {
    return (
      <AuthenticatedShell>
        <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
          <p className="text-sm text-muted">成約済みの出品は編集できません。</p>
          <Link href="/listings/mine" className="text-sm text-accent hover:underline">
            自分の出品へ
          </Link>
        </div>
      </AuthenticatedShell>
    );
  }

  const initial: ListingEditorInitial = {
    maker: listing.maker,
    model: listing.model,
    vehicle_class: listing.vehicle_class ?? null,
    year: listing.year,
    mileage: listing.mileage,
    frame_number: listing.frame_number,
    mileage_rollback: (listing.mileage_rollback ?? "none") as MileageRollbackStatus,
    price_ex_tax: listing.price_ex_tax,
    condition_comment: listing.condition_comment,
    grades: parseGradesToForm(listing),
    inspection_remaining: listing.inspection_remaining,
    inspection_expiry_date: listing.inspection_expiry_date,
    liability_insurance_expiry_date: listing.liability_insurance_expiry_date,
    model_designation: listing.model_designation,
    engine_model: listing.engine_model,
    is_officially_stamped_vin: listing.is_officially_stamped_vin ?? false,
    vin_note: listing.vin_note,
  };

  return (
    <ListingEditorForm
      mode="edit"
      listingId={id}
      initial={initial}
      cancelHref="/listings/mine"
    />
  );
}
