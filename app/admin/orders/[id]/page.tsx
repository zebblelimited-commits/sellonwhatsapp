import { redirect } from "next/navigation";

export default function AdminOrderDetailsPage() {
  redirect("/admin?tab=orders");
}
