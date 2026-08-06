import { redirect } from "next/navigation";

export default function AdminChatPage() {
  redirect("/admin?tab=chat");
}
