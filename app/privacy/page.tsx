import { redirect } from "next/navigation";

/** プライバシーポリシーは /terms#privacy に集約 */
export default function PrivacyPage() {
  redirect("/terms#privacy");
}
