import { redirect } from "next/navigation";

export default function AdminStoreDetailsPage() {
  redirect("/admin?tab=stores");
}
