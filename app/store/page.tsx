import { redirect } from "next/navigation";

export default function StoreFallbackPage() {
  redirect("/explore");
}
