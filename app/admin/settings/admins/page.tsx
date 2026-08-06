import { redirect } from "next/navigation";

export default function AdminAdminsPage() {
  redirect("/admin?tab=settings");
}
