import { redirect } from "next/navigation";

export default function AdminDisputesPage() {
  redirect("/admin?tab=disputes");
}
