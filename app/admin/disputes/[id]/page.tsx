import { redirect } from "next/navigation";

export default function AdminDisputeDetailsPage() {
  redirect("/admin?tab=disputes");
}
