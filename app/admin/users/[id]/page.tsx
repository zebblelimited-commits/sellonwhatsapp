import { redirect } from "next/navigation";

export default function AdminUserDetailsPage() {
  redirect("/admin?tab=users");
}
