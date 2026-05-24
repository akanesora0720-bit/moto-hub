import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";

export default async function RootPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.profile.member_type === "staff") redirect("/admin");
  redirect("/home");
}
