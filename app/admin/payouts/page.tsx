import { redirect } from "next/navigation";

export default function AdminPayoutsPage() {
  redirect("/admin?tab=payouts");
}
