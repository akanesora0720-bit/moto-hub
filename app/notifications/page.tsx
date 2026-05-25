import { NotificationsClient } from "@/components/NotificationsClient";
import { canAccessAdmin } from "@/lib/auth";
import { getViewer } from "@/lib/viewer";
import type { Profile } from "@/lib/types";

export default async function NotificationsPage() {
  const viewer = await getViewer();
  const isAdminContext = viewer ? canAccessAdmin(viewer.profile as Profile) : false;
  return <NotificationsClient isAdminContext={isAdminContext} />;
}
