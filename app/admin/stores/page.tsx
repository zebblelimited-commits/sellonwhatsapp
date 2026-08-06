import { redirect } from "next/navigation";

export default function AdminStoresPage() {
  redirect("/admin?tab=stores");
}
