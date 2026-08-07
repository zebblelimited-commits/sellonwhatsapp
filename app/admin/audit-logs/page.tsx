import { redirect } from "next/navigation";

export default function AdminAuditLogsPage() {
  redirect("/admin?tab=audit");
}
