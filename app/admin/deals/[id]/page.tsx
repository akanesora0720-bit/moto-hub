import { redirect } from "next/navigation";
import { DealDetailPageView } from "@/app/deals/[id]/page";
import { canAccessAdmin } from "@/lib/auth";
import { getViewer } from "@/lib/viewer";
import type { Profile } from "@/lib/types";

export default async function AdminDealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer || !canAccessAdmin(viewer.profile as Profile)) redirect("/home");
  return DealDetailPageView({ params }, { forceAdminShell: true });
}
