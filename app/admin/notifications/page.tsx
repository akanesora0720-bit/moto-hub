import { redirect } from "next/navigation";
import { NotificationsClient } from "@/components/NotificationsClient";
import { canAccessAdmin } from "@/lib/auth";
import { getViewer } from "@/lib/viewer";
import type { Profile } from "@/lib/types";

export default async function AdminNotificationsPage() {
  const viewer = await getViewer();
  if (!viewer || !canAccessAdmin(viewer.profile as Profile)) {
    redirect("/home");
  }
  return <NotificationsClient context="admin" />;
}
