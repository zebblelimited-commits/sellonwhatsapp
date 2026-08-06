import { redirect } from "next/navigation";

export default function AdminPayoutDetailsPage() {
  redirect("/admin?tab=payouts");
}
