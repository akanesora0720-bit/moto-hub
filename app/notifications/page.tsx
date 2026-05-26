import { NotificationsClient } from "@/components/NotificationsClient";

/** 加盟店ダッシュボード用。is_admin でもここでは運営シェルにしない */
export default function NotificationsPage() {
  return <NotificationsClient context="dealer" />;
}
