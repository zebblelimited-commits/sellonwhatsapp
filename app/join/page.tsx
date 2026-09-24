import { redirect } from "next/navigation";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const params = await searchParams;
  const referralCode = String(params.ref || "").trim();
  redirect(referralCode ? `/register?ref=${encodeURIComponent(referralCode)}` : "/register");
}
