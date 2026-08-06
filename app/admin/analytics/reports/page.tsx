import { redirect } from "next/navigation";

export default function AdminAnalyticsReportsPage() {
  redirect("/admin?tab=analytics");
}
