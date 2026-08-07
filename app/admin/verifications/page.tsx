import { redirect } from "next/navigation";

export default function AdminVerificationsPage() {
  redirect("/admin?tab=verifications");
}
